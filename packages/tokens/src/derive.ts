import { contrastRatio } from './contrast'
import { gamutMap, hexToRgb, oklchToRgb, rgbToHex, rgbToOklch } from './oklch'
import type { Oklch, Rgb } from './oklch'
import type { CssVarName, CssVars, DerivedTokens } from './derived'
import type { Density, Elevation, LabelCase, MerchantTokens, RadiusStep, Scale } from './merchant'

// ---------------------------------------------------------------------------------------------
// AA clamp machinery. Search happens over OKLCH L; the pass/fail check is always WCAG contrast
// on the resulting sRGB. [PRINCIPLES §7]
// ---------------------------------------------------------------------------------------------

type Check = { bg: Rgb; minRatio: number }
type ScanResult = { l: number; rgb: Rgb; minRatio: number; passes: boolean }

const SCAN_STEPS = 500

/** Every L from 0 to 1 at fine resolution — dense enough to land inside a narrow multi-background
 * band (e.g. ~0.25-0.29 wide in the VELDE focus-ring case) rather than stepping over it. */
function scanL(makeRgb: (l: number) => Rgb, checks: Check[]): ScanResult[] {
  const results: ScanResult[] = []
  for (let step = 0; step <= SCAN_STEPS; step++) {
    const l = step / SCAN_STEPS
    const rgb = makeRgb(l)
    const minRatio = Math.min(...checks.map((check) => contrastRatio(rgb, check.bg)))
    const passes = checks.every((check) => contrastRatio(rgb, check.bg) >= check.minRatio)
    results.push({ l, rgb, minRatio, passes })
  }
  return results
}

/** The candidate that clears every check by the widest margin — "furthest from every
 * background" — and, when nothing clears all checks, the closest achievable compromise instead
 * of an unclamped colour. */
function bestEffort(results: ScanResult[]): Rgb {
  return results.reduce((best, r) => (r.minRatio > best.minRatio ? r : best)).rgb
}

/** Among passing candidates, the one nearest the starting L — the smallest legal nudge, i.e.
 * "as close to the original as the clamp allows." */
function closestPassing(results: ScanResult[], startL: number): Rgb | null {
  const passing = results.filter((r) => r.passes)
  if (passing.length === 0) return null
  return passing.reduce((closest, r) =>
    Math.abs(r.l - startL) < Math.abs(closest.l - startL) ? r : closest,
  ).rgb
}

function flipByContrast(bg: Rgb): Rgb {
  const black: Rgb = { r: 0, g: 0, b: 0 }
  const white: Rgb = { r: 255, g: 255, b: 255 }
  return contrastRatio(black, bg) >= contrastRatio(white, bg) ? black : white
}

/** Search a tinted (hue/chroma-preserving) L ramp for the closest legal candidate against one or
 * more backgrounds, gamut-mapping every candidate so a saturated surface doesn't get its hue bent
 * by clipping. WCAG guarantees a single 4.5:1 background always has a passing L, but with 2-3
 * close backgrounds (surface + its raised/sunken nudges) `closestPassing` can come back empty in
 * a razor-edge case, so it still falls back to the best achievable compromise. */
function deriveClampedText(hue: number, chroma: number, startL: number, checks: Check[]): Rgb {
  const makeRgb = (l: number) => oklchToRgb(gamutMap({ l, c: chroma, h: hue }))
  const results = scanL(makeRgb, checks)
  return closestPassing(results, startL) ?? bestEffort(results)
}

/**
 * `focusRing` must clear 3:1 against BOTH `accent` and `surface` (WCAG 1.4.11) — a band problem,
 * not a monotone one: a candidate can fail on both sides of the passing band, so this is a full
 * scan, not a directional step search. Grayscale (chroma 0) is always in-gamut, which keeps the
 * guarantee mechanical instead of hue-dependent.
 */
/** Every candidate the ring can ever be, in one enumeration: a grey byte 0-255. An OKLCH-L scan
 * (as used for the tinted text clamp) maps unevenly onto this 256-value discrete output space and
 * can step over a narrow legal band; enumerating the 256 actual sRGB bytes is both simpler and a
 * complete search of the real output domain, so no step size can ever miss an answer that exists. */
function deriveFocusRing(accentRgb: Rgb, surfaceRgb: Rgb): Rgb {
  const checks: Check[] = [
    { bg: accentRgb, minRatio: 3 },
    { bg: surfaceRgb, minRatio: 3 },
  ]
  let best: Rgb = { r: 0, g: 0, b: 0 }
  let bestScore = -Infinity
  for (let v = 0; v <= 255; v++) {
    const candidate: Rgb = { r: v, g: v, b: v }
    const score = Math.min(...checks.map((check) => contrastRatio(candidate, check.bg)))
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  // ponytail: measured on 1500 random accent/surface pairs (deterministic LCG), 209/1500 rings
  // land below 3:1 against both — 207 are genuinely infeasible (no colour in the sRGB gamut
  // clears 3:1 against both backgrounds; WCAG contrast is a function of luminance alone, and a
  // complete 256-value scan found nothing, so `best` here is the true best-effort optimum, not a
  // search gap). TASKS.md's box 2 ("clears 3:1 against both") is therefore unachievable in
  // general, not just an implementation gap — real fix is a second token,
  // `--mx-focus-ring-offset`, rendered as a two-tone ring (inner + outer contour in different
  // colours), where each contour only has to clear 3:1 against the one thing it touches. Needs a
  // `CssVarName` addition and both renderers drawing two contours — not built here.
  return best
}

// ---------------------------------------------------------------------------------------------
// Non-clamped surface nudges. `raised`/`sunken`/`border` are cosmetic, not text-on-background, so
// they don't go through the AA scan directly — just a small OKLCH L nudge, gamut-mapped so a
// saturated surface colour doesn't shift hue. But `raised`/`sunken` themselves become backgrounds
// the text clamp must clear 4.5:1 against (AA_GUARANTEED_PAIRS), so the nudge size feeds that
// constraint even though it isn't a clamp search itself — see `deriveFeasibleVariants` below.
// ---------------------------------------------------------------------------------------------

const RAISED_SUNKEN_NUDGE = 0.06
const BORDER_NUDGE = 0.12

function nudgeL(l: number, delta: number): number {
  return Math.max(0, Math.min(1, l + delta))
}

/** On a light surface, "raised" reads as slightly darker (a filled card against a pale page);
 * on a dark surface it reads as lighter (closer to a light source). Sunken is the opposite. */
function deriveSurfaceVariant(
  surfaceOklch: Oklch,
  isLight: boolean,
  wantRaised: boolean,
  nudge: number,
): Rgb {
  const goesDarker = isLight === wantRaised
  const l = nudgeL(surfaceOklch.l, goesDarker ? -nudge : nudge)
  return oklchToRgb(gamutMap({ ...surfaceOklch, l }))
}

function deriveBorder(surfaceOklch: Oklch, isLight: boolean): Rgb {
  const l = nudgeL(surfaceOklch.l, isLight ? -BORDER_NUDGE : BORDER_NUDGE)
  return oklchToRgb(gamutMap({ ...surfaceOklch, l }))
}

const MAX_MIN_RATIO_STEPS = 200

/** The best a single grey text colour can do against every background in the list at once —
 * used only to test feasibility, not to pick the actual text colour (that's `deriveClampedText`
 * later, against real hue/chroma). */
function maxAchievableMinRatio(backgrounds: Rgb[]): number {
  let best = -Infinity
  for (let step = 0; step <= MAX_MIN_RATIO_STEPS; step++) {
    const rgb = oklchToRgb({ l: step / MAX_MIN_RATIO_STEPS, c: 0, h: 0 })
    const minRatio = Math.min(...backgrounds.map((bg) => contrastRatio(rgb, bg)))
    if (minRatio > best) best = minRatio
  }
  return best
}

const NUDGE_SHRINK_STEPS = 12

/**
 * A surface sitting near WCAG's mid-luminance "hardest zone" can have `raised` and `sunken` land
 * far enough apart (even at the same fixed nudge that's harmless everywhere else) that NO single
 * text colour clears 4.5:1 against `surface`, `raised`, AND `sunken` at once — confirmed by brute
 * force for `surface: '#666666'`, where the best achievable is 4.478:1, below the bar, at every
 * lightness. This isn't a quantisation bug; the constraint is genuinely unsatisfiable at that
 * nudge size. Fixing it in the text search would only be a per-pair patch — the real fix is here,
 * where `raised`/`sunken` are produced: halve the nudge until the triple is jointly satisfiable.
 * Nudge -> 0 always converges to `raised === sunken === surface`, the single-background case
 * WCAG guarantees is solvable (>=4.583:1 via a black/white flip), so this always terminates.
 */
function deriveFeasibleVariants(
  surfaceOklch: Oklch,
  surfaceRgb: Rgb,
  isLight: boolean,
): { raised: Rgb; sunken: Rgb } {
  let nudge = RAISED_SUNKEN_NUDGE
  for (let i = 0; i < NUDGE_SHRINK_STEPS; i++) {
    const raised = deriveSurfaceVariant(surfaceOklch, isLight, true, nudge)
    const sunken = deriveSurfaceVariant(surfaceOklch, isLight, false, nudge)
    if (maxAchievableMinRatio([surfaceRgb, raised, sunken]) >= 4.5) {
      return { raised, sunken }
    }
    nudge /= 2
  }
  return { raised: surfaceRgb, sunken: surfaceRgb }
}

function deriveScrim(isLight: boolean): string {
  return isLight ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.45)'
}

// ---------------------------------------------------------------------------------------------
// Layout ramps. `scale`/`density`/`radius`/`elevation`/`labelCase` change layout, not paint —
// DoD box 3. Every number here is invented; see the hand-off "what I invented" list.
// ---------------------------------------------------------------------------------------------

type SpaceRamp = readonly [number, number, number, number, number]
type TextRamp = { xs: string; sm: string; md: string; lg: string }
type RadiusRamp = { sm: string; md: string; lg: string }
type ShadowRamp = { s1: string; s2: string }
type LabelStyle = { transform: string; tracking: string }

const SCALE_SPACE_BASE: Record<Scale, SpaceRamp> = {
  compact: [4, 8, 12, 16, 20],
  regular: [4, 8, 16, 24, 32],
  generous: [6, 12, 24, 36, 56],
}

const SCALE_TEXT: Record<Scale, TextRamp> = {
  compact: { xs: '11px', sm: '12px', md: '14px', lg: '16px' },
  regular: { xs: '12px', sm: '14px', md: '16px', lg: '20px' },
  generous: { xs: '13px', sm: '15px', md: '18px', lg: '24px' },
}

const DENSITY_SPACE_MULTIPLIER: Record<Density, number> = { compact: 0.85, comfortable: 1 }
const DENSITY_LINE_HEIGHT: Record<Density, string> = { compact: '1.3', comfortable: '1.55' }

const RADIUS_MAP: Record<RadiusStep, RadiusRamp> = {
  '0': { sm: '0px', md: '0px', lg: '0px' },
  sm: { sm: '4px', md: '6px', lg: '8px' },
  md: { sm: '6px', md: '10px', lg: '14px' },
  lg: { sm: '10px', md: '16px', lg: '22px' },
  // `pill` is fully round only at `sm`, the step chips and buttons use — that is what "pill" names
  // [css.ts:107 already treats fully-round as definitional for the pill/bubble launcher, not as a
  // radius]. `md` and `lg` land on large boxes (cards, the compare table, the panel itself, which
  // is `overflow: hidden`), and 9999px there is not a rounder card — it is an ellipse whose curve
  // eats its own content: at 1440px the panel clipped the merchant's name to "elder". Continues the
  // ramp past `lg` (10/16/22) so pill stays visibly the roundest step without swallowing text.
  // Found by rendering the first config in the project that asks for it [T11]; VELDE is '0' and
  // KRACHT is 'md', so no gate could have caught it.
  pill: { sm: '9999px', md: '20px', lg: '28px' },
}

/** hairline = a 0-blur "border" shadow; soft = a real blurred shadow. Distinguishable in
 * greyscale by shape alone (crisp edge vs. diffuse falloff), not just opacity. */
const ELEVATION_MAP: Record<Elevation, ShadowRamp> = {
  hairline: {
    s1: '0 0 0 1px rgba(0, 0, 0, 0.12)',
    s2: '0 0 0 1px rgba(0, 0, 0, 0.2)',
  },
  soft: {
    s1: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)',
    s2: '0 8px 24px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.1)',
  },
}

const LABEL_MAP: Record<LabelCase, LabelStyle> = {
  sentence: { transform: 'none', tracking: 'normal' },
  'upper-tracked': { transform: 'uppercase', tracking: '0.08em' },
}

function deriveSpace(scale: Scale, density: Density): SpaceRamp {
  const [b1, b2, b3, b4, b5] = SCALE_SPACE_BASE[scale]
  const mult = DENSITY_SPACE_MULTIPLIER[density]
  return [b1 * mult, b2 * mult, b3 * mult, b4 * mult, b5 * mult]
}

function fontStack(family: string): string {
  return `'${family}', system-ui, sans-serif`
}

// ---------------------------------------------------------------------------------------------
// Contract: the `[foreground, background]` CssVarName pairs the AA clamp guarantees ≥4.5:1 for.
// A component may only render text using one of these pairings and stay inside the guarantee;
// this is also exactly what the H1 benchmark fuzzes. [ENGINEERING §5.5]
// ---------------------------------------------------------------------------------------------

export const AA_GUARANTEED_PAIRS: ReadonlyArray<readonly [CssVarName, CssVarName]> = [
  ['--mx-text-on-accent', '--mx-accent'],
  ['--mx-text-primary', '--mx-surface'],
  ['--mx-text-primary', '--mx-surface-raised'],
  ['--mx-text-primary', '--mx-surface-sunken'],
  ['--mx-text-muted', '--mx-surface'],
  ['--mx-text-muted', '--mx-surface-raised'],
  ['--mx-text-muted', '--mx-surface-sunken'],
] as const

const TEXT_CHROMA_CAP = 0.04

export function derive(m: MerchantTokens): DerivedTokens {
  const accentRgb = hexToRgb(m.accent)
  const surfaceRgb = hexToRgb(m.surface)
  const surfaceOklch = rgbToOklch(surfaceRgb)
  const isLight = surfaceOklch.l >= 0.5

  const textOnAccent = flipByContrast(accentRgb)

  const { raised: surfaceRaised, sunken: surfaceSunken } = deriveFeasibleVariants(
    surfaceOklch,
    surfaceRgb,
    isLight,
  )
  const border = deriveBorder(surfaceOklch, isLight)

  // textPrimary/textMuted must clear 4.5:1 against every surface a component might render them
  // on: the base surface and both nudged variants. [correction #4]
  const textChecks: Check[] = [
    { bg: surfaceRgb, minRatio: 4.5 },
    { bg: surfaceRaised, minRatio: 4.5 },
    { bg: surfaceSunken, minRatio: 4.5 },
  ]
  const textChroma = Math.min(surfaceOklch.c, TEXT_CHROMA_CAP)
  const primaryStartL = isLight ? 0 : 1 // start at the strong extreme: near-black or near-white
  const textPrimary = deriveClampedText(surfaceOklch.h, textChroma, primaryStartL, textChecks)
  // textMuted starts AT the surface's own L and nudges out to the nearest point that still
  // clears 4.5:1 — the most "muted" (closest to surface) a compliant colour can be. Forcing it
  // to the same 4.5:1 floor as textPrimary limits how muted it can actually look; the read comes
  // from chroma/hue proximity to the surface, not from a lower contrast ratio.
  const textMuted = deriveClampedText(surfaceOklch.h, textChroma, surfaceOklch.l, textChecks)

  const focusRing = deriveFocusRing(accentRgb, surfaceRgb)
  const scrim = deriveScrim(isLight)

  const [space1, space2, space3, space4, space5] = deriveSpace(m.scale, m.density)
  const px = (n: number) => `${Math.round(n)}px`
  const text = SCALE_TEXT[m.scale]
  const radius = RADIUS_MAP[m.radius]
  const shadow = ELEVATION_MAP[m.elevation]
  const label = LABEL_MAP[m.labelCase]

  const css: CssVars = {
    '--mx-accent': rgbToHex(accentRgb),
    '--mx-text-on-accent': rgbToHex(textOnAccent),
    '--mx-surface': rgbToHex(surfaceRgb),
    '--mx-surface-raised': rgbToHex(surfaceRaised),
    '--mx-surface-sunken': rgbToHex(surfaceSunken),
    '--mx-border': rgbToHex(border),
    '--mx-text-primary': rgbToHex(textPrimary),
    '--mx-text-muted': rgbToHex(textMuted),
    '--mx-focus-ring': rgbToHex(focusRing),
    '--mx-overlay-scrim': scrim,
    '--mx-space-1': px(space1),
    '--mx-space-2': px(space2),
    '--mx-space-3': px(space3),
    '--mx-space-4': px(space4),
    '--mx-space-5': px(space5),
    '--mx-radius-sm': radius.sm,
    '--mx-radius-md': radius.md,
    '--mx-radius-lg': radius.lg,
    '--mx-shadow-1': shadow.s1,
    '--mx-shadow-2': shadow.s2,
    '--mx-font-display': fontStack(m.fontDisplay.family),
    '--mx-font-body': fontStack(m.fontBody.family),
    '--mx-text-xs': text.xs,
    '--mx-text-sm': text.sm,
    '--mx-text-md': text.md,
    '--mx-text-lg': text.lg,
    '--mx-label-transform': label.transform,
    '--mx-label-tracking': label.tracking,
    '--mx-line-height': DENSITY_LINE_HEIGHT[m.density],
  }

  return {
    css,
    labelCase: m.labelCase,
    launcher: m.launcher,
    fonts: { display: m.fontDisplay, body: m.fontBody },
  }
}

// ---------------------------------------------------------------------------------------------
// Readability report — T7 DoD box 7 ("every clamped pair is visible as a named before/after, not
// silently corrected"). Reuses `derive()`'s own output and the clamp machinery above; no
// parallel derivation logic.
// ---------------------------------------------------------------------------------------------

export type ReadabilityRow = {
  /** The token pair being measured, as CSS custom-property names. */
  fg: CssVarName
  bg: CssVarName
  fgHex: string
  bgHex: string
  ratio: number
  /** 4.5 for text pairs, 3 for the focus ring and for accent-vs-surface. */
  floor: number
  meets: boolean
}

export type ReadabilityReport = {
  /** One row per AA_GUARANTEED_PAIRS entry, floor 4.5. */
  guaranteed: ReadabilityRow[]
  /** focusRing measured against accent and against surface, floor 3 (WCAG 1.4.11). */
  focusRing: ReadabilityRow[]
  /**
   * accent vs surface, floor 3. NOT part of the AA guarantee — derive() emits accent verbatim —
   * but the launcher and primary CTA are filled with it on the merchant's own page, so an accent
   * that vanishes into the surface is an invisible button. This row is why the config page can
   * refuse to hand over a snippet.
   */
  accentOnSurface: ReadabilityRow
  /**
   * The one genuine clamp movement. `textMuted`'s search starts AT the surface's own lightness
   * and nudges out to the nearest point clearing 4.5:1, so `from` is what the merchant's surface
   * tint wants the muted text to be and `to` is what it had to become. This always moves; that is
   * expected and is the point — HELDER's olive and VELDE's grey are different answers to the same
   * question.
   */
  mutedMove: { fromHex: string; toHex: string; fromRatio: number; toRatio: number }
  /**
   * Rows where the derivation could NOT reach the floor and fell back to best-effort
   * (`bestEffort`, or a focus ring with no in-gamut answer). Silent non-correction is the failure
   * the "show the clamp" feature actually needs to surface. Empty on almost every config.
   */
  shortfalls: ReadabilityRow[]
}

function readabilityRow(
  fg: CssVarName,
  bg: CssVarName,
  css: CssVars,
  floor: number,
): ReadabilityRow {
  const fgHex = css[fg]
  const bgHex = css[bg]
  const ratio = contrastRatio(hexToRgb(fgHex), hexToRgb(bgHex))
  return { fg, bg, fgHex, bgHex, ratio, floor, meets: ratio >= floor }
}

/** Recomputes exactly the point `deriveClampedText` starts its `textMuted` search from — the
 * surface's own L/H at the capped chroma — so `mutedMove.fromHex` is a real value, not an
 * approximation of one. */
function deriveMutedMove(m: MerchantTokens, css: CssVars): ReadabilityReport['mutedMove'] {
  const surfaceRgb = hexToRgb(m.surface)
  const surfaceOklch = rgbToOklch(surfaceRgb)
  const textChroma = Math.min(surfaceOklch.c, TEXT_CHROMA_CAP)
  const fromRgb = oklchToRgb(gamutMap({ l: surfaceOklch.l, c: textChroma, h: surfaceOklch.h }))
  const fromHex = rgbToHex(fromRgb)
  const toHex = css['--mx-text-muted']
  return {
    fromHex,
    toHex,
    fromRatio: contrastRatio(fromRgb, surfaceRgb),
    toRatio: contrastRatio(hexToRgb(toHex), surfaceRgb),
  }
}

export function readabilityReport(m: MerchantTokens): ReadabilityReport {
  const { css } = derive(m)

  const guaranteed = AA_GUARANTEED_PAIRS.map(([fg, bg]) => readabilityRow(fg, bg, css, 4.5))
  const focusRing = [
    readabilityRow('--mx-focus-ring', '--mx-accent', css, 3),
    readabilityRow('--mx-focus-ring', '--mx-surface', css, 3),
  ]
  const accentOnSurface = readabilityRow('--mx-accent', '--mx-surface', css, 3)
  const mutedMove = deriveMutedMove(m, css)
  const shortfalls = [...guaranteed, ...focusRing].filter((row) => !row.meets)

  return { guaranteed, focusRing, accentOnSurface, mutedMove, shortfalls }
}

/**
 * The nearest colour to `accent` that clears `minRatio` against `surface`, preserving hue and
 * chroma and moving only lightness — so the suggestion still reads as the merchant's colour.
 * Returns the accent unchanged when it already clears. Returns the best achievable when nothing
 * in the sRGB gamut clears (possible for a mid-luminance surface).
 */
export function nearestVisibleAccent(accent: string, surface: string, minRatio = 3): string {
  const accentRgb = hexToRgb(accent)
  const surfaceRgb = hexToRgb(surface)
  if (contrastRatio(accentRgb, surfaceRgb) >= minRatio) return accent

  const accentOklch = rgbToOklch(accentRgb)
  const checks: Check[] = [{ bg: surfaceRgb, minRatio }]
  const makeRgb = (l: number) => oklchToRgb(gamutMap({ l, c: accentOklch.c, h: accentOklch.h }))
  const results = scanL(makeRgb, checks)
  const candidate = closestPassing(results, accentOklch.l) ?? bestEffort(results)
  return rgbToHex(candidate)
}
