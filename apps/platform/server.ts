/**
 * The real T6 platform origin: `/v1/config/:shopKey` and `/v1/agent.js`, both cross-origin,
 * both cached, neither able to 500 a merchant's page. Replaces the `tools/serve-platform.ts`
 * stub — this file is the router the stub's comment said T6 would build.
 *
 * PORT 4003 IS FROZEN: both storefronts carry a literal `<script src="http://localhost:4003/...">`
 * and `ENGINEERING.md §1.1` forbids editing storefront source, so the port cannot move here either.
 *
 * T7 adds the configuration page's own routes (`/`, `/ui/*`), the brand extractor (`/v1/extract`),
 * config authoring (`POST /v1/config`), and a font-file-to-stylesheet wrapper (`/v1/font.css`).
 */

import { isDeepStrictEqual } from 'node:util'
import { isConfigResponse, isRecord } from '../../packages/agent/src/config'
import { extractMerchantTokens } from '../../packages/agent/src/extract/extract'
import type { MerchantDraft } from '../../packages/agent/src/extract/extract'
import { SEED_BY_ORIGIN } from '../../packages/agent/src/extract/seed'

const root = `${import.meta.dir}/../..`
const BUNDLE = `${root}/packages/agent/dist/agent.js`
const CONFIG_DIR = `${import.meta.dir}/config`

/**
 * Where a MINTED config is written. Locally that is `config/` next to the committed brands, which
 * is what the e2e suite and the demo have always done. On Vercel the deployment is read-only
 * except for `/tmp`, so minted keys go there and `configPath()` below decides per key which of the
 * two directories a read comes from — the four committed brands are never in `/tmp`, and nothing
 * minted is ever in `config/`.
 *
 * ponytail: `/tmp` is per-instance, and the sentence above understated that by a wide margin —
 * measured on the deployed platform, 24 of 24 PARALLEL reads of a freshly minted key served the
 * default brand, because the instance answering had never minted it. So a published key does not
 * survive the demo session; it does not reliably survive the next request. Nothing on stage
 * depends on it — every brand in the six-beat demo comes from a committed config, which deploys as
 * a static CDN file and never reaches this function [COMPETITORS §6] — so this is left standing
 * deliberately [T16, DECISIONS-LOG §Scope].
 *
 * Upgrade path, when a published config must outlive a request: the Upstash KV store
 * `upstash-kv-celeste-castle` is already provisioned and connected to `maximal-platform`, so
 * `KV_REST_API_URL`/`KV_REST_API_TOKEN` are present in production. Two `fetch` calls against its
 * REST API replace the `Bun.write`/`Bun.file` pair, and `SHOPS`/`MINTED` stop being the oracle for
 * "does this key exist". NOT Vercel Blob, which this comment used to name: its public URLs are
 * CDN-cached and overwriting a pathname does not purge the edge, so republish would keep serving
 * the pre-edit brand.
 */
const MINT_DIR = process.env.VERCEL === undefined ? CONFIG_DIR : '/tmp/config'
const MINTED = new Set<string>()
const configPath = (shop: string): string =>
  `${MINTED.has(shop) ? MINT_DIR : CONFIG_DIR}/${shop}.json`

/**
 * A closed set, not a path segment: `/v1/config/../../etc/passwd` never reaches the filesystem,
 * because the key is only ever used as a Set lookup, never interpolated into a path. Enumerated
 * once at startup from the files that actually exist, rather than a hand-maintained list that
 * drifts from `config/` — the DoD's "unknown shopKey never breaks the page" needs `default.json`
 * to always be one of these, so it's the one shop key requirement here rather than an assumption.
 *
 * Mutable on purpose: `POST /v1/config` mints a new key and `.add()`s it here so the key is
 * servable by `GET /v1/config/:key` in the same process, with no rebuild of this Set needed.
 */
const SHOPS = new Set(
  (await Array.fromAsync(new Bun.Glob('*.json').scan({ cwd: CONFIG_DIR }))).map((name) =>
    name.replace(/\.json$/, ''),
  ),
)
if (!SHOPS.has('default')) throw new Error(`${CONFIG_DIR}/default.json is missing`)

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  // The embed fetches with `credentials: 'omit'`, so `*` is legal and no allow-credentials
  // pairing is needed. A merchant-scoped origin list is out of scope (T6 DoD: "Not in scope").
}

/**
 * Every response — hits, misses, 304s — carries a strong ETag of the exact bytes served, plus
 * `max-age=0, must-revalidate`. The embed script is a binary we cannot recall [ENGINEERING §2.1]:
 * a merchant's browser holds it indefinitely, so a fix only reaches them on the next revalidation.
 * `max-age=0` forces that revalidation on every load instead of trusting a TTL; `must-revalidate`
 * stops a browser from serving stale bytes if the revalidation fails offline. A 304 costs one
 * round trip with no body, so this is cheap on the common case where nothing changed. Commit
 * `6dcb6f1` is the bug this exists to prevent: a long-lived server serving a bundle older than
 * source. No `stale-while-revalidate` — that would let a request serve last build's bytes anyway.
 */
// `Uint8Array<ArrayBuffer>`, not the bare `Uint8Array<ArrayBufferLike>` a plain annotation infers:
// `Bun.file().bytes()` returns the concrete form, and only that satisfies `BodyInit` on this
// TS/lib pair (5.9's `BufferSource` wants `ArrayBufferView<ArrayBuffer>` specifically).
function cachedResponse(
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
  request: Request,
): Response {
  const etag = `"${Bun.hash(bytes).toString(16)}"`
  const headers = {
    ...CORS,
    etag,
    'cache-control': 'public, max-age=0, must-revalidate',
  }
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(bytes, { headers: { ...headers, 'content-type': contentType } })
}

function jsonError(
  status: number,
  error: string,
  headers: Record<string, string> = CORS,
): Response {
  return Response.json({ error }, { status, headers })
}

/**
 * Reads a request body up to `capBytes`, never buffering past it — a client-supplied
 * `content-length` header can lie, so the cap is enforced on bytes actually read off the stream,
 * not on that header. `null` means "over cap"; callers turn that into a 400.
 */
async function readCappedBody(
  request: Request,
  capBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array(0)
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > capBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/**
 * `dist/` is gitignored and rebuilt from source, so a long-lived server (Playwright reuses one)
 * will happily serve a bundle from before the last source change — the exact drift T12 caught in
 * `6dcb6f1`. Rebuild on request instead of trusting whoever last remembered to.
 *
 * But only when the sources are actually newer, and only once at a time. Rebuilding on EVERY
 * request forks a `bun build` per request: the e2e suite loads the embed on dozens of pages across
 * two workers, and those builds compete with the KRACHT storefront's own Next.js compilation for
 * CPU — which made a storefront spec fail under full-suite load while passing in isolation. The
 * mtime comparison turns N builds into one; the in-flight promise stops concurrent requests from
 * racing each other into N more. [ENGINEERING §3.13 — still the shipped artifact, just not rebuilt
 * for nothing]
 */
const SOURCE_DIRS = [`${root}/packages/agent/src`, `${root}/packages/tokens/src`]

async function newestMtime(dirs: string[]): Promise<number> {
  let newest = 0
  for (const dir of dirs) {
    for await (const name of new Bun.Glob('**/*.{ts,tsx,json}').scan({ cwd: dir })) {
      const stat = await Bun.file(`${dir}/${name}`).stat()
      if (stat.mtimeMs > newest) newest = stat.mtimeMs
    }
  }
  return newest
}

let inFlight: Promise<void> | null = null

async function runBuild(): Promise<void> {
  // `.nothrow()` matters: without it a broken build throws inside `fetch` and this endpoint answers
  // 500 — on the one route whose whole contract is that it never breaks a merchant's page. A failed
  // rebuild serves the last good bytes instead, which is the correct degradation: stale beats gone.
  const built = await Bun.$`bun run --filter '@maximal/agent' build`.cwd(root).quiet().nothrow()
  if (built.exitCode !== 0) {
    console.error(`platform: agent build failed, serving last good bundle\n${built.stderr}`)
  }
}

async function rebuildBundle(): Promise<void> {
  // On Vercel the bundle is a build artifact and there is no toolchain, no writable source tree and
  // nothing to be stale against: `bun build` would fail per request on the one route whose contract
  // is that it never breaks a merchant's page. The mtime guard below is a DEV freshness fix.
  if (process.env.VERCEL !== undefined) return
  const bundle = Bun.file(BUNDLE)
  const builtAt = (await bundle.exists()) ? (await bundle.stat()).mtimeMs : 0
  if (builtAt > (await newestMtime(SOURCE_DIRS))) return
  inFlight ??= runBuild().finally(() => {
    inFlight = null
  })
  await inFlight
}

/**
 * The config page's own browser bundle — `apps/platform/ui/main.ts` built for the browser, not
 * the agent's dist bundle. This gets a SEPARATE mtime guard and a SEPARATE in-flight promise from
 * `rebuildBundle` above: sharing `inFlight` would dedupe a UI-bundle request into an already-running
 * AGENT-bundle rebuild (or vice versa) and serve one route the other route's bytes — the same race
 * `SOURCE_DIRS`/`inFlight` above exist to prevent, just between two different outputs instead of N
 * requests for the same one.
 *
 * Built in-process with `Bun.build` rather than shelling out like the agent build: there's no
 * `dist/` file for a UI-only bundle to land in, so the built bytes live in memory instead of being
 * read back off disk. `.nothrow()` has no in-process equivalent, so the same "never break the page"
 * contract is done by hand: `Bun.build` can both reject (a hard config error) and resolve with
 * `success: false` (a source error), and both are caught below without touching `uiBundleBytes` —
 * a broken build serves whatever was last built, exactly like the agent bundle.
 */
const UI_DIR = `${import.meta.dir}/ui`
const UI_ENTRY = `${UI_DIR}/main.ts`
const UI_INDEX = `${UI_DIR}/index.html`
const UI_CSS = `${UI_DIR}/ui.css`
const UI_SOURCE_DIRS = [UI_DIR, `${root}/packages/tokens/src`, `${root}/packages/agent/src`]

let uiBundleBytes: Uint8Array<ArrayBuffer> | null = null
let uiBuiltMtime = 0
let uiInFlight: Promise<void> | null = null

async function runUiBuild(): Promise<void> {
  try {
    const result = await Bun.build({
      entrypoints: [UI_ENTRY],
      target: 'browser',
      format: 'esm',
      minify: false,
    })
    if (!result.success) {
      console.error('platform: ui build failed, serving last good bundle', result.logs)
      return
    }
    const output = result.outputs[0]
    if (output === undefined) {
      console.error('platform: ui build produced no output, serving last good bundle')
      return
    }
    // `.arrayBuffer()`, not `.bytes()`: `BuildArtifact` has no `bytes()` on Bun 1.2.4, and the
    // `Uint8Array<ArrayBuffer>` this produces is the concrete form `cachedResponse` needs — the
    // same TS/lib constraint the agent-bundle path documents above.
    uiBundleBytes = new Uint8Array(await output.arrayBuffer())
    uiBuiltMtime = Date.now()
  } catch (error) {
    console.error('platform: ui build threw, serving last good bundle', error)
  }
}

async function rebuildUiBundle(): Promise<void> {
  // Same reasoning as `rebuildBundle`. Deployed, `/ui/main.js` is a static file staged by
  // `tools/build-platform.ts` and served by the CDN, so this route is never even reached there.
  if (process.env.VERCEL !== undefined) return
  if (uiBundleBytes !== null && uiBuiltMtime > (await newestMtime(UI_SOURCE_DIRS))) return
  uiInFlight ??= runUiBuild().finally(() => {
    uiInFlight = null
  })
  await uiInFlight
}

async function serveUiStaticFile(
  path: string,
  contentType: string,
  request: Request,
): Promise<Response> {
  const file = Bun.file(path)
  // The other desk hasn't landed `apps/platform/ui/*` yet in some checkouts — a missing file is a
  // plain 404, not a crash: there is no "last good bytes" for a file this route never built.
  if (!(await file.exists())) return new Response('not found\n', { status: 404, headers: CORS })
  return cachedResponse(await file.bytes(), contentType, request)
}

async function handleUiMainJs(request: Request): Promise<Response> {
  await rebuildUiBundle()
  if (uiBundleBytes === null) {
    return new Response('ui bundle unavailable\n', { status: 404, headers: CORS })
  }
  return cachedResponse(uiBundleBytes, 'text/javascript; charset=utf-8', request)
}

const MAX_EXTRACT_BODY_BYTES = 4 * 1024

/**
 * A live reference for `DEFAULT_TOKENS` (`packages/agent/src/extract/extract.ts:30`), not a
 * hand-copy of it — a copy drifts silently, and this file may not edit `extract.ts` just to export
 * the constant. `extractMerchantTokens('not-a-url')` fails at its first `new URL(url)` before any
 * network call [extract.ts:298], so this is free and offline, and it returns `defaultDraft(...)`
 * carrying the extractor's own real `DEFAULT_TOKENS` untouched. Computed once at module load — the
 * input never varies, so there is nothing to gain from re-deriving it on every `/v1/extract` call.
 */
const EMPTY_EXTRACT_TOKENS = (await extractMerchantTokens('not-a-url')).tokens

type ExtractState = 'ok' | 'blocked' | 'empty' | 'failed'

/**
 * The extractor only reports `ok: boolean` plus a free-text note, so the three failure states T7
 * has to route on do not exist in its type — this reconstructs them from the note's wording.
 */
/** Exported for `apps/platform/classify.test.ts`. The `blocked` and `empty` branches are not
 *  reachable from the config page against any local fixture — the private-host guard on
 *  `/v1/extract` refuses loopback before classification runs — and reaching them through the UI
 *  would mean depending on a third party's bot policy [TASKS §0 #3]. So they are proven here. */
export function classifyExtractState(draft: MerchantDraft): ExtractState {
  if (draft.ok) {
    // "We reached the page and learned nothing": `buildTokens` spreads `DEFAULT_TOKENS` for every
    // field it cannot find and still returns `ok: true` — the silent fallback this state exists to
    // surface instead of hiding.
    const learnedNothing =
      draft.logo === null && isDeepStrictEqual(draft.tokens, EMPTY_EXTRACT_TOKENS)
    return learnedNothing ? 'empty' : 'ok'
  }
  if (/bot-check|challenge/i.test(draft.note)) return 'blocked'
  // A real bot wall exits on `!response.ok` [extract.ts:314] before `isChallengePage` is ever
  // reached, so its note reads "responded with HTTP 4xx/5xx", never "bot-check" or "challenge" —
  // a 403/503 IS the blocked case in practice, so it has to be recognised here too.
  if (/HTTP 4\d\d|HTTP 5\d\d/.test(draft.note)) return 'blocked'
  return 'failed'
}

// The origins already seeded in `packages/agent/src/extract/seed.ts` — the two local storefronts
// the config page's "paste a URL" demo depends on. Derived from that module's keys, not
// hand-listed, so this allowlist cannot drift from what `extractMerchantTokens` actually treats as
// pre-cached (and therefore safe to fetch without a further outbound request of its own).
const ALLOWED_PRIVATE_ORIGINS = new Set(Object.keys(SEED_BY_ORIGIN))

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function isPrivateIpv4(hostname: string): boolean {
  const match = IPV4_RE.exec(hostname)
  if (!match) return false
  const first = Number(match[1])
  const second = Number(match[2])
  if (first === 127) return true // 127.0.0.0/8 loopback
  if (first === 10) return true // 10.0.0.0/8
  if (first === 172 && second >= 16 && second <= 31) return true // 172.16.0.0/12
  if (first === 192 && second === 168) return true // 192.168.0.0/16
  if (first === 169 && second === 254) return true // 169.254.0.0/16 link-local
  // `0.0.0.0` was the live hole, and it was reachable before any of this: the field is `type=url`,
  // so a merchant could always type the scheme themselves. Measured against the DEPLOYED route on
  // 2026-08-19 — `{"url":"https://0.0.0.0"}` returned a draft whose note read "could not be
  // reached", i.e. the platform attempted the outbound request and reported the result back. What
  // that address resolves to is stack-dependent; that the guard let it start is the defect.
  if (first === 0) return true // 0.0.0.0/8 "this network" — loopback on many stacks
  if (first === 100 && second >= 64 && second <= 127) return true // 100.64.0.0/10 CGNAT [RFC 6598]
  if (first >= 224) return true // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false
}

/**
 * Every IPv6 literal is refused — this replaced a function that tried to enumerate the private
 * ranges and let three past: `[::]`, `[::ffff:127.0.0.1]` (loopback in IPv4-mapped form, which
 * `URL` re-spells as `[::ffff:7f00:1]`, so a leading-hextet test never sees it) and `[fc00::1]`
 * (unique-local, outside the `fe80::/10` range it checked). Enumerating hostile forms of an
 * address family is a list of the ones already imagined; a merchant's storefront is a NAME, and
 * no shop is addressed by a bare IPv6 literal, so the whole family is refusable for nothing.
 */
function isIpv6Literal(hostname: string): boolean {
  return hostname.startsWith('[')
}

/**
 * A merchant types `your-store.com`; `new URL` demands a scheme and 400s without one. Prepend one
 * only when there is NO scheme at all, so anything carrying one — `javascript:`, `file:`,
 * `mailto:`, and `localhost:4001`, whose port reads as a scheme to this test — passes through
 * untouched and is still refused by `isFetchableUrl` below. Never `http:`, so this can only
 * upgrade, and it therefore cannot mint a match against `ALLOWED_PRIVATE_ORIGINS`, whose keys
 * carry an explicit `http:`.
 *
 * `.trim()` first, and it is load-bearing rather than tidy: `new URL(' https://x')` SUCCEEDS today
 * (the parser strips leading whitespace), so prepending in front of the space would newly reject
 * input this route accepts — a fix whose whole purpose is to reject less.
 *
 * The ceiling, said out loud: `[a-z0-9+.-]` is a superset of the domain charset, so a scheme-less
 * `my-store.com:8080` reads as scheme `my-store.com:` and is left alone, i.e. still refused. That
 * is the same tension that keeps `localhost:4001` refusable, and a merchant on a non-standard port
 * is the rarer case of the two.
 *
 * Exported for `apps/platform/withScheme.test.ts`.
 */
export function withScheme(raw: string): string {
  const typed = raw.trim()
  return /^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`
}

/**
 * Refuses loopback, link-local, and RFC1918-private targets, plus any non-http(s) scheme — the
 * SSRF surface a URL pasted by any caller opens onto this server's own network. The one exception
 * is an origin already in `ALLOWED_PRIVATE_ORIGINS` above: those are demo storefronts this route is
 * meant to reach, not attacker-supplied hosts, so they pass even though they're loopback addresses.
 * Literal hostnames only — this does not resolve DNS, so a domain name that resolves to a private
 * address later is not caught here.
 */
function isFetchableUrl(target: URL): boolean {
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return false
  if (ALLOWED_PRIVATE_ORIGINS.has(target.origin)) return true
  // Trailing dots stripped FIRST, or the three tests below read a different name than the resolver
  // does. `localhost.` is the root-terminated form of `localhost` — `URL` keeps the dot verbatim,
  // `endsWith('.localhost')` does not match it, and `ping localhost.` answers from 127.0.0.1. It
  // reached the outbound fetch on the deployed platform, measured 2026-08-19; an adversarial review
  // of this diff found it, after the task text had already committed to "four addresses fell
  // through". It was five, and the fifth is the one the IPv4 side still enumerates by hand.
  const host = target.hostname.toLowerCase().replace(/\.+$/, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  if (isIpv6Literal(host)) return false
  return !isPrivateIpv4(host)
}

/**
 * `/v1/extract` makes outbound fetches on the caller's behalf, so — unlike every other route here —
 * it does not carry the blanket `access-control-allow-origin: *`. It only ever echoes back an
 * Origin that already equals this server's own origin; the config page is served from that same
 * origin and needs no CORS header at all to read its own fetch (browsers don't apply CORS to
 * same-origin requests). A genuinely cross-origin Origin can never equal `url.origin`, so this never
 * grants a third-party page read access to the response.
 */
function extractCorsHeaders(request: Request, url: URL): Record<string, string> {
  const headers: Record<string, string> = { 'access-control-allow-methods': 'POST, OPTIONS' }
  const origin = request.headers.get('origin')
  if (origin !== null && origin === url.origin) headers['access-control-allow-origin'] = origin
  return headers
}

async function handleExtract(request: Request, url: URL): Promise<Response> {
  const headers = extractCorsHeaders(request, url)
  const bytes = await readCappedBody(request, MAX_EXTRACT_BODY_BYTES)
  if (bytes === null) {
    return jsonError(400, `request body over ${MAX_EXTRACT_BODY_BYTES} bytes`, headers)
  }

  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return jsonError(400, 'body is not valid JSON', headers)
  }
  if (!isRecord(body) || typeof body.url !== 'string') {
    return jsonError(400, 'expected a JSON body shaped { "url": string }', headers)
  }

  let target: URL
  try {
    target = new URL(withScheme(body.url))
  } catch {
    return jsonError(400, 'url is not a valid URL', headers)
  }
  if (!isFetchableUrl(target)) {
    return jsonError(
      400,
      'url must be a public http(s) address, not a private, loopback, or link-local host',
      headers,
    )
  }

  try {
    // `target.href`, not the raw string. The extractor does its own `new URL` [extract.ts:298]
    // and returns a "not a valid URL" draft on failure — so handing it the un-normalised text
    // would let a bare address clear the guard here and then fail one layer down, answering 200
    // with the merchant still blocked. It also keeps the URL we vetted and the URL we fetch
    // provably the same one.
    const draft = await extractMerchantTokens(target.href)
    return Response.json({ ...draft, state: classifyExtractState(draft) }, { headers })
  } catch (error) {
    // `extractMerchantTokens` is documented [extract.ts:13] as never throwing — this is the
    // belt-and-braces net for the day that contract slips, so this route keeps its OWN "never a
    // 500" promise regardless.
    console.error('platform: /v1/extract caught a throw from extractMerchantTokens', error)
    const failure: MerchantDraft = {
      tokens: EMPTY_EXTRACT_TOKENS,
      logo: null,
      ok: false,
      note: 'extraction failed unexpectedly',
    }
    return Response.json({ ...failure, state: 'failed' satisfies ExtractState }, { headers })
  }
}

const MAX_CONFIG_BODY_BYTES = 512 * 1024
const SHOP_KEY_RE = /^[a-z0-9-]{6,}$/
// Never overwritten by a generated key, even on the (astronomically unlikely) chance one matches —
// `divergence.ts` hard-codes and validates `config/velde.json` and `config/kracht.json`, so
// clobbering either turns a HARD gate red.
const RESERVED_SHOP_KEYS = new Set(['velde', 'kracht', 'helder', 'default'])

function mintShopKey(): string {
  for (;;) {
    const key = `shop-${Math.random().toString(36).slice(2, 8)}`
    if (SHOP_KEY_RE.test(key) && !SHOPS.has(key) && !RESERVED_SHOP_KEYS.has(key)) return key
  }
}

// The shape a caller may republish under: matches what `mintShopKey` mints, but a caller-supplied
// key is only ever trusted for a *rewrite* of a file that already exists — see `isRepublishableKey`.
const REPUBLISH_KEY_RE = /^shop-[a-z0-9]+$/

/**
 * Whether `?shopKey=` may overwrite an existing config. The reserved check is explicit, not just
 * implied by the pattern: `RESERVED_SHOP_KEYS` (`velde`, `kracht`, `helder`, `default`) never
 * matches `REPUBLISH_KEY_RE` today, but `divergence.ts:92` hard-codes and validates
 * `config/velde.json` and `config/kracht.json`, so this does not rely on the pattern alone to keep
 * them un-overwritable — and `SHOPS.has(key)` is what stops a caller from minting an arbitrary new
 * filename: a key reaches the filesystem here only if it was already a member of `SHOPS`, i.e.
 * already written by a previous mint.
 */
function isRepublishableKey(key: string): boolean {
  return REPUBLISH_KEY_RE.test(key) && !RESERVED_SHOP_KEYS.has(key) && SHOPS.has(key)
}

async function handleConfigPost(request: Request, url: URL): Promise<Response> {
  const bytes = await readCappedBody(request, MAX_CONFIG_BODY_BYTES)
  if (bytes === null) return jsonError(400, `request body over ${MAX_CONFIG_BODY_BYTES} bytes`)

  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return jsonError(400, 'body is not valid JSON')
  }
  if (!isConfigResponse(body)) return jsonError(400, 'body is not a valid ConfigResponse')

  const requestedKey = url.searchParams.get('shopKey')
  let shopKey: string
  let status: number
  if (requestedKey === null) {
    // No key supplied: mint a fresh one, exactly the original "always publish new" behaviour.
    shopKey = mintShopKey()
    status = 201
  } else if (isRepublishableKey(requestedKey)) {
    // Republishing: overwrite the caller's own previously-minted config in place.
    shopKey = requestedKey
    status = 200
  } else {
    return jsonError(400, 'shopKey must be an already-published shop key')
  }

  MINTED.add(shopKey)
  await Bun.write(configPath(shopKey), JSON.stringify(body))
  SHOPS.add(shopKey)

  // Origin from the incoming request, not hardcoded: port 4003 is frozen for the two existing
  // storefronts [header comment above], but T15 deploys THIS route on a different origin, and the
  // snippet has to carry whatever origin actually served it.
  const snippet = `<script src="${url.origin}/v1/agent.js" data-shop="${shopKey}" async></script>`
  return Response.json({ shopKey, snippet }, { status, headers: CORS })
}

const FONT_FAMILY_RE = /^[A-Za-z0-9 _-]{1,64}$/
// Nothing the two allowlists above can produce contains any of these — asserted here rather than
// assumed, so a rule that should never fire still guards the CSS shape this route emits into.
const CSS_UNSAFE_RE = /['";{}\\\r\n]/

/**
 * `FontChoice.href` is documented [merchant.ts:14] as the stylesheet injected into the HOST head,
 * and `boot.ts` renders it as `<link rel="stylesheet">`. A `.woff2` fetched as a stylesheet parses
 * as CSS and yields nothing — a blank rule, no visible failure. Rather than teach the shipped
 * widget to sniff a file extension (which would repurpose `href`'s documented meaning, the thing
 * `ENGINEERING §2.2` "ADD fields, never repurpose" forbids, and puts an `if` in a binary we cannot
 * recall), the platform wraps the merchant's font file in a real stylesheet on our side of the
 * wire. `href` keeps its exact documented meaning; the widget does not change at all.
 * [ENGINEERING §2.1: if it can be computed on our side, it is not an `if` in the widget.]
 */
function handleFontCss(url: URL, request: Request): Response {
  const src = url.searchParams.get('src')
  const family = url.searchParams.get('family')
  const weightRaw = url.searchParams.get('weight')
  if (src === null || family === null) return jsonError(400, 'src and family are required')

  let srcUrl: URL
  try {
    srcUrl = new URL(withScheme(src))
  } catch {
    return jsonError(400, 'src is not a valid URL')
  }
  if (srcUrl.protocol !== 'http:' && srcUrl.protocol !== 'https:') {
    return jsonError(400, 'src must be an http or https URL')
  }
  if (!FONT_FAMILY_RE.test(family)) return jsonError(400, 'family is invalid')

  const weight = weightRaw === null ? 400 : Number(weightRaw)
  if (!Number.isInteger(weight) || weight < 100 || weight > 900) {
    return jsonError(400, 'weight must be an integer between 100 and 900')
  }
  if (CSS_UNSAFE_RE.test(srcUrl.href) || CSS_UNSAFE_RE.test(family)) {
    return jsonError(400, 'src or family contains a character that cannot appear in CSS here')
  }

  const css = `@font-face {
  font-family: '${family}';
  src: url('${srcUrl.href}') format('woff2');
  font-weight: ${weight};
  font-display: swap;
}
`
  return cachedResponse(new TextEncoder().encode(css), 'text/css; charset=utf-8', request)
}

async function handleAgentJs(request: Request): Promise<Response> {
  await rebuildBundle()
  const bytes = await Bun.file(BUNDLE).bytes()
  return cachedResponse(bytes, 'text/javascript; charset=utf-8', request)
}

/**
 * When each minted shop key was first served to anybody. This is what makes the config page's
 * "waiting for first load / detected ✓" state a real observation rather than decoration: the page
 * never fetches `/v1/config/<its own minted key>`, so a timestamp here means some other page —
 * the merchant's store, with the snippet pasted into it — asked for that config.
 *
 * In memory on purpose. It answers "has this ever loaded", which is a question about the demo
 * session, and persisting it would mean inventing a store for one boolean.
 */
const firstServedAt = new Map<string, number>()

async function handleConfigGet(request: Request, url: URL): Promise<Response> {
  const requested = url.pathname.slice('/v1/config/'.length)
  // Unknown or unsafe key -> the default config, always 200. The widget must never see a
  // 404/500 from its own config fetch [TASKS.md T6 DoD].
  const shop = SHOPS.has(requested) ? requested : 'default'
  if (SHOPS.has(requested) && !firstServedAt.has(requested)) {
    firstServedAt.set(requested, Date.now())
  }
  const bytes = await Bun.file(configPath(shop)).bytes()
  return cachedResponse(bytes, 'application/json; charset=utf-8', request)
}

function handlePublished(_request: Request, url: URL): Response {
  const key = url.pathname.slice('/v1/published/'.length)
  return Response.json({ firstSeenAt: firstServedAt.get(key) ?? null }, { headers: CORS })
}

type RouteHandler = (request: Request, url: URL) => Promise<Response> | Response

/**
 * A table, not a chain of `if`s: ten routes inline would blow Biome's cognitive-complexity cap on
 * `fetch` (measured at 24 against a cap of 15) well before this file is done growing. `fetch`
 * itself stays a single `.find()` and one dispatch, so its complexity does not grow with the
 * number of routes — only each individual handler above carries its own, already-bounded logic.
 */
const ROUTES: { method: string; match: (pathname: string) => boolean; handle: RouteHandler }[] = [
  { method: 'GET', match: (p) => p === '/v1/agent.js', handle: handleAgentJs },
  { method: 'GET', match: (p) => p.startsWith('/v1/config/'), handle: handleConfigGet },
  { method: 'GET', match: (p) => p.startsWith('/v1/published/'), handle: handlePublished },
  { method: 'POST', match: (p) => p === '/v1/config', handle: handleConfigPost },
  { method: 'POST', match: (p) => p === '/v1/extract', handle: handleExtract },
  {
    method: 'GET',
    match: (p) => p === '/v1/font.css',
    handle: (request, url) => handleFontCss(url, request),
  },
  {
    method: 'GET',
    match: (p) => p === '/',
    handle: (request) => serveUiStaticFile(UI_INDEX, 'text/html; charset=utf-8', request),
  },
  {
    method: 'GET',
    match: (p) => p === '/ui/ui.css',
    handle: (request) => serveUiStaticFile(UI_CSS, 'text/css; charset=utf-8', request),
  },
  { method: 'GET', match: (p) => p === '/ui/main.js', handle: handleUiMainJs },
]

/**
 * The router itself, separated from `Bun.serve` so it has two callers: `serve()` below for local
 * dev and the e2e suite, and `api/platform.ts` for the deployed Vercel function. One router, so a
 * route cannot exist locally and be missing in production — which is exactly how T7's whole
 * configuration page came to be built, committed, demoed locally, and never deployed.
 */
export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'OPTIONS') {
    // `/v1/extract` doesn't get the blanket wildcard CORS below — same reasoning as its POST
    // handler above applies to its preflight response.
    const headers = url.pathname === '/v1/extract' ? extractCorsHeaders(request, url) : CORS
    return new Response(null, { status: 204, headers })
  }
  const route = ROUTES.find((r) => r.method === request.method && r.match(url.pathname))
  if (route) return route.handle(request, url)
  return new Response('not found\n', { status: 404, headers: CORS })
}

export function serve(port = 4003) {
  return Bun.serve({ port, fetch: handleRequest })
}

if (import.meta.main) {
  const server = serve()
  console.log(`platform API on http://localhost:${server.port}`)
  console.log(`  GET  /                   -> ${UI_INDEX}`)
  console.log(`  GET  /ui/ui.css          -> ${UI_CSS}`)
  console.log(`  GET  /ui/main.js         -> built from ${UI_ENTRY}`)
  console.log(`  GET  /v1/agent.js        -> ${BUNDLE}`)
  console.log(`  GET  /v1/config/{${[...SHOPS].join(',')}} -> ${CONFIG_DIR}/*.json`)
  console.log(`  POST /v1/config          -> mints a shop key, writes ${CONFIG_DIR}/<key>.json`)
  console.log(`  POST /v1/extract         -> runs the brand extractor on a merchant URL`)
  console.log(`  GET  /v1/font.css        -> wraps ?src= as a @font-face stylesheet`)
}
