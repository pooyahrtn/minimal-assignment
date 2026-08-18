import { AA_GUARANTEED_PAIRS, VELDE, derive } from '@maximal/tokens'
import type {
  Corner,
  CssVarName,
  CssVars,
  Density,
  Elevation,
  LabelCase,
  LauncherStyle,
  MerchantTokens,
  RadiusStep,
  Scale,
} from '@maximal/tokens'
import type { Check } from '../checks'
import { contrastRatio } from '../../packages/tokens/src/contrast'
import { hexToRgb } from '../../packages/tokens/src/oklch'
import type { Rgb } from '../../packages/tokens/src/oklch'

// H1 (BENCHMARKS §1, TASKS.md T1). Owned by T1's QA paragraph: fuzz 200 seeded MerchantTokens,
// derive, and assert every text-on-background pair the widget actually renders clears 4.5:1.
//
// PAIR-LIST GAP CHECK (see hand-off). AA_GUARANTEED_PAIRS is derive.ts's own claim of what it
// guarantees. Independently cross-checked here against packages/agent/src/css.ts — the only place
// that actually pairs a `color:` with a `background:` from these vars — and PRINCIPLES §7
// ("accent appears in exactly two places — primary CTA fill and focus ring"). Every text/bg
// combination the shell renders (launcher fill + avatar/mark on accent; panel/chip/input body
// text and placeholder on surface; header/chips-legend/close text on surface-raised; agent bubble
// and dropped-chip text on surface-sunken) reduces to one of the 7 AA_GUARANTEED_PAIRS entries.
// No gap found, so there is nothing to check in a separate section beyond AA_GUARANTEED_PAIRS
// itself — a real gap would be reported loudly and checked here too, per the task brief.

// ---------------------------------------------------------------------------------------------
// Seeded PRNG. Math.random() is banned: a benchmark that cannot be re-run on the same inputs
// cannot confirm a fix. An LCG (Numerical Recipes constants) is the smallest generator that is
// both deterministic and gives a reasonable spread over 200 draws.
// ---------------------------------------------------------------------------------------------

const SEED = 0x5eed_1234

function makeRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

function randomByte(rng: () => number): number {
  return Math.floor(rng() * 256)
}

/** Uniform random sRGB byte per channel — the simplest fuzz of the full colour gamut, including
 * pathological near-black/near-white/desaturated corners without special-casing them. */
function randomHex(rng: () => number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(randomByte(rng))}${toHex(randomByte(rng))}${toHex(randomByte(rng))}`
}

/** Uniform pick over a non-empty tuple — typed so `first` never needs an `as` or an unchecked
 * index to satisfy noUncheckedIndexedAccess. */
function pick<T>(rng: () => number, [first, ...rest]: readonly [T, ...T[]]): T {
  const idx = Math.floor(rng() * (rest.length + 1))
  if (idx === 0) return first
  const value = rest[idx - 1]
  return value === undefined ? first : value
}

const SCALES: readonly [Scale, ...Scale[]] = ['compact', 'regular', 'generous']
const RADII: readonly [RadiusStep, ...RadiusStep[]] = ['0', 'sm', 'md', 'lg', 'pill']
const ELEVATIONS: readonly [Elevation, ...Elevation[]] = ['hairline', 'soft']
const LABEL_CASES: readonly [LabelCase, ...LabelCase[]] = ['sentence', 'upper-tracked']
const DENSITIES: readonly [Density, ...Density[]] = ['compact', 'comfortable']
const LAUNCHER_STYLES: readonly [LauncherStyle, ...LauncherStyle[]] = [
  'bubble',
  'pill',
  'text-anchor',
]
const CORNERS: readonly [Corner, ...Corner[]] = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
]

/**
 * Every field of MerchantTokens varies except `fontDisplay`/`fontBody`: family and weight feed
 * only CSS font-family strings inside `derive()`, never a contrast computation, so fuzzing them
 * would add draws without adding coverage. Reused verbatim from VELDE (see hand-off).
 */
function randomMerchantTokens(rng: () => number): MerchantTokens {
  return {
    accent: randomHex(rng),
    surface: randomHex(rng),
    fontDisplay: VELDE.fontDisplay,
    fontBody: VELDE.fontBody,
    scale: pick(rng, SCALES),
    radius: pick(rng, RADII),
    elevation: pick(rng, ELEVATIONS),
    labelCase: pick(rng, LABEL_CASES),
    density: pick(rng, DENSITIES),
    launcher: { style: pick(rng, LAUNCHER_STYLES), position: pick(rng, CORNERS) },
  }
}

const CONFIG_COUNT = 200

/** Valid JS/TS object-literal syntax (quoted keys are legal either way), so a failure can be
 * pasted straight into a `derive(...)` repro. */
function reproLiteral(tokens: MerchantTokens): string {
  return JSON.stringify(tokens, null, 2)
}

// ---------------------------------------------------------------------------------------------
// Section 1 — the 4.5:1 text clamp (DoD box 1).
// ---------------------------------------------------------------------------------------------

type WorstContrast = {
  ratio: number
  pair: readonly [CssVarName, CssVarName]
  tokens: MerchantTokens
}

function worstPairRatio(css: CssVars, tokens: MerchantTokens): WorstContrast | null {
  let worst: WorstContrast | null = null
  for (const pair of AA_GUARANTEED_PAIRS) {
    const [fg, bg] = pair
    const ratio = contrastRatio(hexToRgb(css[fg]), hexToRgb(css[bg]))
    if (worst === null || ratio < worst.ratio) worst = { ratio, pair, tokens }
  }
  return worst
}

// ---------------------------------------------------------------------------------------------
// Section 2 — the focus ring (DoD box 2, WCAG 1.4.11). Reported, not thrown on, unless the engine
// did worse than what was achievable. WCAG contrast is a function of relative luminance alone, so
// enumerating every grey byte 0-255 (chroma 0 is always in-gamut) is a COMPLETE search of the
// achievable ceiling — not a heuristic — independent of however `derive()` itself searches.
// ---------------------------------------------------------------------------------------------

const GREY_STEPS = 255
const FOCUS_RING_BAR = 3
const EPS = 1e-6

function ceilingRingRatio(accentRgb: Rgb, surfaceRgb: Rgb): number {
  let best = 0
  for (let v = 0; v <= GREY_STEPS; v++) {
    const grey: Rgb = { r: v, g: v, b: v }
    const ratio = Math.min(contrastRatio(grey, accentRgb), contrastRatio(grey, surfaceRgb))
    if (ratio > best) best = ratio
  }
  return best
}

type FocusRingVerdict = {
  /** True when no colour in the sRGB gamut can clear 3:1 against both grounds at once. */
  infeasible: boolean
  /** True only when 3:1 WAS achievable and the engine returned less than that — a real defect. */
  defect: boolean
  ceiling: number
  engineRatio: number
  tokens: MerchantTokens
}

function evaluateFocusRing(css: CssVars, tokens: MerchantTokens): FocusRingVerdict {
  const accentRgb = hexToRgb(css['--mx-accent'])
  const surfaceRgb = hexToRgb(css['--mx-surface'])
  const ringRgb = hexToRgb(css['--mx-focus-ring'])
  const engineRatio = Math.min(
    contrastRatio(ringRgb, accentRgb),
    contrastRatio(ringRgb, surfaceRgb),
  )
  const ceiling = ceilingRingRatio(accentRgb, surfaceRgb)
  const infeasible = ceiling < FOCUS_RING_BAR - EPS
  const defect = !infeasible && engineRatio < FOCUS_RING_BAR - EPS
  return { infeasible, defect, ceiling, engineRatio, tokens }
}

// ---------------------------------------------------------------------------------------------
// Fuzz loop + reporting.
// ---------------------------------------------------------------------------------------------

type FuzzResult = {
  pairsChecked: number
  worstContrast: WorstContrast | null
  infeasibleRingCount: number
  ringDefects: FocusRingVerdict[]
}

function runFuzz(): FuzzResult {
  const rng = makeRng(SEED)
  let pairsChecked = 0
  let worstContrast: WorstContrast | null = null
  let infeasibleRingCount = 0
  const ringDefects: FocusRingVerdict[] = []

  for (let i = 0; i < CONFIG_COUNT; i++) {
    const tokens = randomMerchantTokens(rng)
    const css = derive(tokens).css

    const localWorst = worstPairRatio(css, tokens)
    pairsChecked += AA_GUARANTEED_PAIRS.length
    if (localWorst && (worstContrast === null || localWorst.ratio < worstContrast.ratio)) {
      worstContrast = localWorst
    }

    const ring = evaluateFocusRing(css, tokens)
    if (ring.infeasible) infeasibleRingCount++
    if (ring.defect) ringDefects.push(ring)
  }

  return { pairsChecked, worstContrast, infeasibleRingCount, ringDefects }
}

function formatContrastFailure(worst: WorstContrast): string {
  const [fg, bg] = worst.pair
  return [
    `H1 contrast: ${fg} vs ${bg} measured ${worst.ratio.toFixed(3)}:1, below the 4.5:1 bar.`,
    'Repro — paste into derive():',
    reproLiteral(worst.tokens),
  ].join('\n')
}

function formatFocusRingDefect(defects: FocusRingVerdict[]): string {
  const lines = defects.map(
    (d) =>
      `engine ${d.engineRatio.toFixed(3)}:1 vs achievable ${d.ceiling.toFixed(3)}:1\n${reproLiteral(d.tokens)}`,
  )
  return [
    `H1 focus ring: engine returned worse than the achievable 3:1 for ${defects.length} config(s)`,
    'this was NOT one of the ~14% infeasible pairs — a colour clearing 3:1 on both grounds exists:',
    lines.join('\n---\n'),
  ].join('\n')
}

export const contrast: Check = {
  name: 'contrast',
  tier: 'HARD',
  run: async () => {
    const result = runFuzz()

    if (!result.worstContrast) {
      throw new Error('H1 contrast: AA_GUARANTEED_PAIRS is empty — nothing was checked')
    }
    if (result.worstContrast.ratio < 4.5) {
      throw new Error(formatContrastFailure(result.worstContrast))
    }
    if (result.ringDefects.length > 0) {
      throw new Error(formatFocusRingDefect(result.ringDefects))
    }

    const feasibleCount = CONFIG_COUNT - result.infeasibleRingCount
    const detail =
      `${CONFIG_COUNT} seeded MerchantTokens (LCG seed 0x${SEED.toString(16)}), ` +
      `${result.pairsChecked} text/bg pairs checked against AA_GUARANTEED_PAIRS's 7 pairs ` +
      `(independently cross-checked against css.ts — no gap found, see hand-off). ` +
      `Worst ratio ${result.worstContrast.ratio.toFixed(3)}:1. ` +
      `Focus ring (WCAG 1.4.11, >=3:1 vs both accent and surface): ${feasibleCount}/${CONFIG_COUNT} ` +
      `feasible, ${result.infeasibleRingCount}/${CONFIG_COUNT} have no colour in gamut clearing ` +
      `3:1 on both grounds (reported only, not a defect — a full 0-255 grey scan is a complete ` +
      `search since WCAG contrast is a function of luminance alone), 0 cases where the engine did ` +
      `worse than what was achievable.`

    return { count: result.pairsChecked, detail }
  },
}
