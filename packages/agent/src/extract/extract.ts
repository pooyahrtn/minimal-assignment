/**
 * Runtime, server-side brand extractor. Fetch a merchant's live URL and read the same signals a
 * browser already computes for the page — CSS custom properties, declared font stacks, declared
 * border-radius, a favicon/og:image logo — into a `MerchantTokens` draft. [PRINCIPLES §6, TASKS T8]
 *
 * No dependency added for this: no jsdom, no headless browser, no image decoder. Bun's `fetch`
 * plus a handful of regexes over the HTML/CSS text a crawler already receives is enough to guess
 * a starting point; a merchant refines the guess by hand on the config page (T7). Real "computed
 * styles" would need a browser; this reads the declared values instead, which is the same
 * information for the vast majority of sites that do not compute colour/radius from JS.
 *
 * The one law that matters more than the guess: every failure path below still returns a usable
 * `MerchantTokens` draft plus an honest note — never a throw, never a hang.
 */
import type { FontChoice, MerchantTokens, RadiusStep } from '@maximal/tokens'
import { SEED_BY_ORIGIN } from './seed'

export type MerchantDraft = {
  tokens: MerchantTokens
  /** Absolute URL to a usable mark, or null — the caller falls back to initials/no avatar. */
  logo: string | null
  /** False on every failure path; still carries a usable `tokens` draft either way. */
  ok: boolean
  /** Human-readable, shown to the merchant: what we found, or why we could not look. */
  note: string
}

/** A neutral, legible starting point — never a crash, never a blank draft. Every field here is
 * an invented default (see hand-off), not read off any real brand. */
const DEFAULT_TOKENS: MerchantTokens = {
  accent: '#2554C7',
  surface: '#FFFFFF',
  fontDisplay: {
    family: 'Inter',
    weight: 600,
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap',
  },
  fontBody: {
    family: 'Inter',
    weight: 400,
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap',
  },
  scale: 'regular',
  radius: 'md',
  elevation: 'soft',
  labelCase: 'sentence',
  density: 'comfortable',
  launcher: { style: 'bubble', position: 'bottom-right' },
}

const FETCH_TIMEOUT_MS = 8000
const MAX_STYLESHEETS = 3
const USER_AGENT = 'Mozilla/5.0 (compatible; MaximalBrandBot/1.0; +https://maximal.example/bot)'

function defaultDraft(note: string): MerchantDraft {
  return { tokens: DEFAULT_TOKENS, logo: null, ok: false, note }
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal, headers: { 'user-agent': USER_AGENT } })
  } finally {
    clearTimeout(timer)
  }
}

function describeFetchFailure(url: string, error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return `${url} did not respond in time — here's a starting point instead.`
  }
  const message = error instanceof Error ? error.message : String(error)
  return `${url} could not be reached (${message}) — here's a starting point instead.`
}

/** Cloudflare and most bot-walls render a real HTML page with a 200 or 403 and one of these
 * phrases; this is a heuristic, not a certainty — worth naming in the hand-off. */
function isChallengePage(html: string): boolean {
  return /cf-browser-verification|cf-chl-|attention required[\s\S]{0,40}cloudflare|checking your browser before accessing|just a moment\.\.\./i.test(
    html,
  )
}

function extractInlineStyle(html: string): string {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1] ?? '').join('\n')
}

function extractStyleLinks(base: URL, html: string): string[] {
  const hrefs: string[] = []
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel=["']stylesheet["']/i.test(tag[0])) continue
    const href = /href=["']([^"']+)["']/i.exec(tag[0])?.[1]
    if (!href) continue
    try {
      hrefs.push(new URL(href, base).toString())
    } catch {
      // A malformed href on a real site is not our problem to fix — skip it.
    }
  }
  return hrefs.slice(0, MAX_STYLESHEETS)
}

/** Inline `<style>` plus up to `MAX_STYLESHEETS` external sheets. A sheet that times out or 404s
 * contributes nothing rather than failing the whole extraction. */
async function collectCss(base: URL, html: string): Promise<string> {
  const links = extractStyleLinks(base, html)
  const fetched = await Promise.all(
    links.map(async (href) => {
      try {
        const res = await fetchWithTimeout(href, FETCH_TIMEOUT_MS)
        return res.ok ? await res.text() : ''
      } catch {
        return ''
      }
    }),
  )
  return [extractInlineStyle(html), ...fetched].join('\n')
}

function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
}

function normalizeHex(value: string): string {
  if (value.length === 4) {
    const [, r, g, b] = value
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return value.toUpperCase()
}

type CssVar = { name: string; value: string }

function extractCssVarColors(css: string): CssVar[] {
  const out: CssVar[] = []
  for (const match of css.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*[;)]/g)) {
    const name = match[1]
    const value = match[2]
    if (name && value) out.push({ name, value })
  }
  return out
}

/** Prefers a custom property whose NAME says what it is (`--brand`, `--accent`, `--cta`) over
 * the first hex colour in the file, which is often a border or shadow, not the brand colour. Only
 * the accent falls back to "any hex in the page" — doing the same for surface risked landing on
 * the SAME stray hex as accent, which collapses to an illegible zero-contrast pair
 * [ENGINEERING §1.6]. Surface without a named signal stays the neutral default instead. */
function pickAccent(vars: CssVar[], css: string): string {
  const named = vars.find(
    (v) => /brand|primary|accent|cta|action|signal/i.test(v.name) && isHexColor(v.value),
  )
  if (named) return normalizeHex(named.value)
  const any = vars.find((v) => isHexColor(v.value))
  if (any) return normalizeHex(any.value)
  const bareHex = /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(css)?.[0]
  return bareHex ? normalizeHex(bareHex) : DEFAULT_TOKENS.accent
}

function pickSurface(vars: CssVar[]): string {
  const named = vars.find(
    (v) => /background|surface|\bbg\b|\bbase\b/i.test(v.name) && isHexColor(v.value),
  )
  return named ? normalizeHex(named.value) : DEFAULT_TOKENS.surface
}

const GENERIC_FONTS = new Set([
  'sans-serif',
  'serif',
  'monospace',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'cursive',
  'fantasy',
  'inherit',
  'initial',
  'unset',
  '-apple-system',
  'blinkmacsystemfont',
])

/** Declared `font-family` stacks, ranked by how often the leading family is declared — the most
 * common one is very likely the merchant's actual brand font, not an icon-font fallback. Skips
 * a leading `var(...)` indirection (we did not resolve custom-property chains) and anything
 * naming itself an icon font — neither is a font a shopper reads text in. */
function extractFontFamilies(css: string): string[] {
  const counts = new Map<string, number>()
  for (const match of css.matchAll(/font-family\s*:\s*([^;{}]+)/gi)) {
    const first = match[1]
      ?.split(',')[0]
      ?.trim()
      .replace(/^['"]|['"]$/g, '')
    if (!first || GENERIC_FONTS.has(first.toLowerCase())) continue
    if (first.startsWith('var(') || /icon/i.test(first)) continue
    counts.set(first, (counts.get(first) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
}

/** We only ever saw a family NAME, never the actual font file — Google Fonts is a guess that
 * works for the huge share of stores that use it, and is honestly wrong for a licensed/self-hosted
 * face. ponytail: no font-matching service wired up; upgrade if a demo store trips on it. */
function fontChoiceFor(family: string, weight: number): FontChoice {
  const encoded = family.replace(/\s+/g, '+')
  return {
    family,
    weight,
    href: `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;${weight}&display=swap`,
  }
}

function extractRadiiPx(css: string): number[] {
  const values: number[] = []
  for (const match of css.matchAll(/border-radius\s*:\s*([\d.]+)(px|rem|em)/gi)) {
    const raw = match[1]
    const unit = match[2]
    if (!raw || !unit) continue
    const num = Number(raw)
    if (!Number.isFinite(num) || num <= 0) continue
    values.push(unit === 'px' ? num : num * 16)
  }
  return values
}

/** The single most-declared radius, bucketed to the closest step. Ties break to the first mode
 * encountered — stable, not meaningful, and cheap to document. */
function dominantRadiusStep(pxValues: number[]): RadiusStep {
  if (pxValues.length === 0) return DEFAULT_TOKENS.radius
  const counts = new Map<number, number>()
  for (const px of pxValues) counts.set(px, (counts.get(px) ?? 0) + 1)
  let mode = pxValues[0] ?? 8
  let best = 0
  for (const [px, count] of counts) {
    if (count > best) {
      best = count
      mode = px
    }
  }
  if (mode >= 999) return 'pill'
  if (mode <= 2) return '0'
  if (mode <= 6) return 'sm'
  if (mode <= 14) return 'md'
  return 'lg'
}

/** A `data:` favicon is usually a deliberate empty placeholder (`href="data:,"`), never a usable
 * mark to show a shopper — skip it and keep looking rather than "extracting" a blank image. */
function isUsableLogoUrl(href: string): boolean {
  return href.trim().length > 0 && !href.trim().toLowerCase().startsWith('data:')
}

function findLogo(base: URL, html: string): string | null {
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel=["'](?:apple-touch-icon|icon|shortcut icon)["']/i.test(tag[0])) continue
    const href = /href=["']([^"']+)["']/i.exec(tag[0])?.[1]
    if (!href || !isUsableLogoUrl(href)) continue
    try {
      return new URL(href, base).toString()
    } catch {}
  }
  const ogImage = /<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(
    html,
  )?.[1]
  if (ogImage && isUsableLogoUrl(ogImage)) {
    try {
      return new URL(ogImage, base).toString()
    } catch {
      return null
    }
  }
  return null
}

function buildTokens(css: string): MerchantTokens {
  const vars = extractCssVarColors(css)
  const accent = pickAccent(vars, css)
  const surface = pickSurface(vars)
  const families = extractFontFamilies(css)
  const displayFamily = families[0]
  const bodyFamily = families[1] ?? families[0]
  const fontDisplay = displayFamily ? fontChoiceFor(displayFamily, 600) : DEFAULT_TOKENS.fontDisplay
  const fontBody = bodyFamily ? fontChoiceFor(bodyFamily, 400) : DEFAULT_TOKENS.fontBody
  const radius = dominantRadiusStep(extractRadiiPx(css))
  return { ...DEFAULT_TOKENS, accent, surface, fontDisplay, fontBody, radius }
}

/**
 * Fetch `url`, read whatever brand signal is on the page, and return a `MerchantTokens` draft.
 * Every branch below returns — nothing throws past this function, nothing hangs past
 * `FETCH_TIMEOUT_MS` per request. [ENGINEERING §2.9 — fail loudly in logs, never half-paint]
 */
export async function extractMerchantTokens(url: string): Promise<MerchantDraft> {
  let base: URL
  try {
    base = new URL(url)
  } catch {
    return defaultDraft(`"${url}" is not a valid URL — here's a starting point instead.`)
  }

  // The two demo storefronts are seeded so the live demo never depends on a network round-trip
  // to a server on the same machine that is about to be presenting. [TASKS T8 DoD box 5]
  const seeded = SEED_BY_ORIGIN[base.origin]
  if (seeded) return seeded

  let response: Response
  try {
    response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS)
  } catch (error) {
    return defaultDraft(describeFetchFailure(url, error))
  }
  if (!response.ok) {
    return defaultDraft(
      `${url} responded with HTTP ${response.status} — we could not read this site, so here's a starting point.`,
    )
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html')) {
    return defaultDraft(
      `${url} did not return a webpage (content-type: ${contentType || 'unknown'}) — here's a starting point.`,
    )
  }

  const html = await response.text()
  if (isChallengePage(html)) {
    return defaultDraft(
      `${url} returned a bot-check page instead of the site — here's a starting point.`,
    )
  }

  const css = await collectCss(base, html)
  const tokens = buildTokens(css)
  const logo = findLogo(base, html)
  return { tokens, logo, ok: true, note: `Extracted from ${url}.` }
}
