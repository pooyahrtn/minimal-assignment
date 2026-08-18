import type { CssVars, DerivedTokens, FontChoice, Launcher, Voice } from '@maximal/tokens'
import { CSS_VAR_NAMES, FALLBACK } from './fallback'
import type { ConfigResponse, Product } from './types'

/**
 * Where the config comes from, how it is cached, and the runtime guard that stands between an
 * unknown JSON body and the renderer. Everything here is pure except `fetchConfig`, so the
 * interesting parts are covered by `shell.test.ts` without a DOM.
 */

/**
 * The platform origin is read off the script's OWN `src`, never a root-relative path. A bare
 * `fetch('/v1/config/velde')` resolves against the STOREFRONT's origin, where the endpoint does
 * not exist and never will — the widget would silently live on the built-in fallback forever and
 * the cross-origin behaviour would go untested.
 */
export function configUrl(scriptSrc: string, shop: string): string {
  return new URL(`/v1/config/${encodeURIComponent(shop)}`, scriptSrc).href
}

/** Only the two methods we use, so a test can pass a plain object instead of faking `Storage`. */
export type CacheStore = Pick<Storage, 'getItem' | 'setItem'>

const cacheKey = (shop: string): string => `mx-config-${shop}`

export function readCache(store: CacheStore, shop: string): ConfigResponse | null {
  try {
    const raw = store.getItem(cacheKey(shop))
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return isConfigResponse(parsed) ? parsed : null
  } catch {
    /* Unreadable or unparseable cache is a cache miss, never a crash. */
    return null
  }
}

export function writeCache(store: CacheStore, shop: string, config: ConfigResponse): void {
  try {
    store.setItem(cacheKey(shop), JSON.stringify(config))
  } catch {
    /* Private mode and quota both throw here. The cache is a speed-up, never a requirement. */
  }
}

/** A missing key renders as the key itself — visible in QA, unlike the word "undefined". */
export function str(strings: Record<string, string>, key: string): string {
  return strings[key] ?? key
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')
}

function isCssVars(value: unknown): value is CssVars {
  return isStringRecord(value) && CSS_VAR_NAMES.every((name) => typeof value[name] === 'string')
}

function isFont(value: unknown): value is FontChoice {
  return (
    isRecord(value) &&
    typeof value.family === 'string' &&
    typeof value.weight === 'number' &&
    typeof value.href === 'string'
  )
}

function isLauncher(value: unknown): value is Launcher {
  if (!isRecord(value)) return false
  const styleOk =
    value.style === 'bubble' || value.style === 'pill' || value.style === 'text-anchor'
  const positionOk =
    value.position === 'bottom-right' ||
    value.position === 'bottom-left' ||
    value.position === 'top-right' ||
    value.position === 'top-left'
  return styleOk && positionOk
}

function isTokens(value: unknown): value is DerivedTokens {
  if (!isRecord(value)) return false
  const { css, labelCase, launcher, fonts } = value
  return (
    isCssVars(css) &&
    (labelCase === 'sentence' || labelCase === 'upper-tracked') &&
    isLauncher(launcher) &&
    isRecord(fonts) &&
    isFont(fonts.display) &&
    isFont(fonts.body)
  )
}

function isVoice(value: unknown): value is Voice {
  if (!isRecord(value)) return false
  const { name, avatar, greeting, tone } = value
  const textOk =
    typeof name === 'string' && typeof greeting === 'string' && typeof tone === 'string'
  if (!textOk) return false
  if (avatar === null) return true
  return (
    isRecord(avatar) &&
    (avatar.kind === 'illustration' || avatar.kind === 'glyph') &&
    typeof avatar.src === 'string'
  )
}

function isSpec(value: unknown): boolean {
  return isRecord(value) && typeof value.label === 'string' && typeof value.value === 'string'
}

function isProduct(value: unknown): value is Product {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.url === 'string' &&
    (value.image === null || typeof value.image === 'string') &&
    typeof value.price === 'number' &&
    typeof value.currency === 'string' &&
    typeof value.inStock === 'boolean' &&
    Array.isArray(value.specs) &&
    value.specs.every(isSpec) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string')
  )
}

/** Narrows an unknown body to the closed contract. No `as` anywhere. [ENGINEERING §1.4] */
export function isConfigResponse(value: unknown): value is ConfigResponse {
  if (!isRecord(value)) return false
  return (
    isTokens(value.tokens) &&
    isVoice(value.voice) &&
    isStringRecord(value.strings) &&
    Array.isArray(value.catalog) &&
    value.catalog.every(isProduct)
  )
}

async function fetchConfig(url: string): Promise<ConfigResponse | null> {
  try {
    const response = await fetch(url, { credentials: 'omit' })
    const body: unknown = await response.json()
    return isConfigResponse(body) ? body : null
  } catch {
    /*
     * One catch for every way this fails, because there is no clean status to branch on: a static
     * host answers a missing path with a 404 HTML PAGE, so `response.json()` throws; a wrong
     * origin rejects at the network or CORS layer with no status at all. Any rejection means the
     * same thing to a shopper — we did not get a config — so it gets the same fallback.
     */
    return null
  }
}

/**
 * Cache first so the widget paints instantly and with the right brand, then refresh the cache in
 * the background for the NEXT load: repainting a panel under a shopper mid-sentence is worse than
 * a config change landing one page view late.
 */
export async function loadConfig(
  shop: string,
  url: string,
  store: CacheStore,
): Promise<ConfigResponse> {
  const cached = readCache(store, shop)
  if (cached !== null) {
    void fetchConfig(url).then((fresh) => {
      if (fresh !== null) writeCache(store, shop, fresh)
    })
    return cached
  }

  const fresh = await fetchConfig(url)
  if (fresh !== null) {
    writeCache(store, shop, fresh)
    return fresh
  }

  const builtIn = FALLBACK[shop]
  if (builtIn === undefined) {
    // Fail loudly rather than half-paint: we do not know this shop's brand, and a widget wearing
    // someone else's brand on a merchant's storefront is worse than no widget. [ENGINEERING §2.9]
    throw new Error(`maximal: no config for shop "${shop}" and no built-in fallback for it`)
  }
  return builtIn
}
