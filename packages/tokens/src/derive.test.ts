import { expect, test } from 'bun:test'
import { KRACHT, VELDE } from './brands'
import { contrastRatio } from './contrast'
import { AA_GUARANTEED_PAIRS, derive } from './derive'
import { hexToRgb, oklchToRgb, rgbToOklch } from './oklch'
import type { CssVars } from './derived'
import type { MerchantTokens } from './merchant'

const PALE_YELLOW: MerchantTokens = { ...VELDE, accent: '#F7F3B0', surface: '#FFFFFF' }

function ratioFor(css: CssVars, fg: keyof CssVars, bg: keyof CssVars): number {
  return contrastRatio(hexToRgb(css[fg]), hexToRgb(css[bg]))
}

// --- colour space round-trip [correction #3] ------------------------------------------------
// A broken OKLab matrix can still emit sRGB that happens to clear 4.5:1, so contrast tests alone
// can't catch it. Round-trip a deterministic grid of 64 sRGB colours through
// srgb -> oklab -> oklch -> oklab -> srgb (rgbToOklch computes Lab internally before deriving
// C/H; oklchToRgb reconstructs Lab from C/H before converting back) and check every channel
// lands within 1/255 of the original.
test('sRGB <-> OKLCH round-trips within 1/255 per channel', () => {
  const steps = [0, 85, 170, 255]
  let checked = 0
  for (const r of steps) {
    for (const g of steps) {
      for (const b of steps) {
        const original = { r, g, b }
        const roundTripped = oklchToRgb(rgbToOklch(original))
        expect(Math.abs(roundTripped.r - r)).toBeLessThanOrEqual(1)
        expect(Math.abs(roundTripped.g - g)).toBeLessThanOrEqual(1)
        expect(Math.abs(roundTripped.b - b)).toBeLessThanOrEqual(1)
        checked++
      }
    }
  }
  expect(checked).toBe(64)
})

// --- the AA contract itself -------------------------------------------------------------------
test('every AA_GUARANTEED_PAIRS pair clears 4.5:1 for both brands', () => {
  let checked = 0
  for (const tokens of [VELDE, KRACHT, PALE_YELLOW]) {
    const css = derive(tokens).css
    for (const [fg, bg] of AA_GUARANTEED_PAIRS) {
      expect(ratioFor(css, fg, bg)).toBeGreaterThanOrEqual(4.5)
      checked++
    }
  }
  expect(checked).toBe(AA_GUARANTEED_PAIRS.length * 3)
})

// --- pathological pale-yellow accent ------------------------------------------------------------
test('pale-yellow accent on white still yields readable text and a visible focus ring', () => {
  const css = derive(PALE_YELLOW).css
  expect(ratioFor(css, '--mx-text-on-accent', '--mx-accent')).toBeGreaterThanOrEqual(4.5)
  const ring = hexToRgb(css['--mx-focus-ring'])
  expect(contrastRatio(ring, hexToRgb(css['--mx-accent']))).toBeGreaterThanOrEqual(3)
  expect(contrastRatio(ring, hexToRgb(css['--mx-surface']))).toBeGreaterThanOrEqual(3)
})

// --- VELDE's near-black accent: the case ENGINEERING §7 calls out by name ----------------------
test("VELDE's near-black accent yields a focus ring clearing 3:1 on its own CTA", () => {
  const css = derive(VELDE).css
  const ring = hexToRgb(css['--mx-focus-ring'])
  const accentContrast = contrastRatio(ring, hexToRgb(css['--mx-accent']))
  const surfaceContrast = contrastRatio(ring, hexToRgb(css['--mx-surface']))
  expect(accentContrast).toBeGreaterThanOrEqual(3)
  expect(surfaceContrast).toBeGreaterThanOrEqual(3)
  // A ring derived from `accent` alone would compute ~1.0:1 sitting on an accent-filled CTA —
  // the exact failure this DoD box exists to catch.
  expect(accentContrast).toBeGreaterThan(1.5)
})

// --- layout ramps change layout, not paint [DoD box 3] -----------------------------------------
test('radius 0 emits real zeros', () => {
  const css = derive({ ...VELDE, radius: '0' }).css
  expect(css['--mx-radius-sm']).toBe('0px')
  expect(css['--mx-radius-md']).toBe('0px')
  expect(css['--mx-radius-lg']).toBe('0px')
})

test('pill radius emits a large value', () => {
  const css = derive({ ...VELDE, radius: 'pill' }).css
  expect(Number.parseInt(css['--mx-radius-md'], 10)).toBeGreaterThan(100)
})

test('hairline and soft elevation are distinguishable shadows, not just opacity', () => {
  const hairline = derive({ ...VELDE, elevation: 'hairline' }).css['--mx-shadow-2']
  const soft = derive({ ...VELDE, elevation: 'soft' }).css['--mx-shadow-2']
  expect(hairline).not.toBe(soft)
  // hairline is a 0-blur "border" shadow: blur radius (the 3rd length in the shorthand) is 0.
  expect(hairline).toMatch(/^0 0 0 \d/)
  // soft has a real blur.
  expect(soft).not.toMatch(/^0 0 0 \d/)
})

// --- the focus ring's no-legal-band branch --------------------------------------------------
// The T1 hand-off flagged this fallback as "structurally safe but unverified by example" — it
// could not construct an accent/surface pair with no colour clearing 3:1 against both. The pair
// exists: the band is empty whenever the surface's relative luminance sits in
// (0.30, 9*accentLuminance + 0.4). Below 0.30 white clears both; above the upper bound a middle
// grey does. A mid-grey accent on a lighter mid-grey surface falls between, and WCAG 1.4.11 is
// then unsatisfiable by any single colour — so the guarantee degrades to "the best available
// ring", and this test pins that it degrades *optimally* rather than silently returning junk.
test('focus ring falls back to the best available colour when no band clears 3:1 on both', () => {
  const css = derive({ ...VELDE, accent: '#4A4A4A', surface: '#BCBCBC' }).css
  const ring = hexToRgb(css['--mx-focus-ring'])
  const vsAccent = contrastRatio(ring, hexToRgb('#4A4A4A'))
  const vsSurface = contrastRatio(ring, hexToRgb('#BCBCBC'))
  // The premise: this pair genuinely has no legal answer.
  expect(Math.min(vsAccent, vsSurface)).toBeLessThan(3)
  // The guarantee that survives: nothing beats it. Balancing the two ratios yields 2.16:1, and
  // every candidate lightness is worse than pure black's 2.37:1 — so black is the true maximum
  // of the minimum, not a lazy default.
  expect(Math.min(vsAccent, vsSurface)).toBeGreaterThan(2.3)
  // And the text pairs are unaffected: a broken ring must never cost us legibility.
  for (const [fg, bg] of AA_GUARANTEED_PAIRS) {
    expect(ratioFor(css, fg, bg)).toBeGreaterThanOrEqual(4.5)
  }
})

// --- sweep: the invariant is "no exceptions", so the check has to try to find one ------------
// A single pair (however deliberately chosen) only proves the clamp holds at that one point.
// `surface: '#666666'` sits near WCAG's mid-luminance "hardest zone", where a fixed OKLCH-L nudge
// for surfaceRaised/surfaceSunken used to spread them far enough apart that no grey cleared
// 4.5:1 against all three at once (best achievable was 4.478:1) — a real infeasibility, not a
// rounding artefact, fixed by shrinking the nudge until the triple is jointly satisfiable
// (`deriveFeasibleVariants`). Sweep every 2nd grey surface across the visible range, against every
// accent this codebase actually ships (both brands, plus the two pathological ones already used
// above), and assert the count checked is non-zero — a check that silently found nothing would
// read as a pass for the wrong reason.
test('every AA_GUARANTEED_PAIRS pair clears 4.5:1 across a sweep of grey surfaces', () => {
  const accents = ['#4A4A4A', VELDE.accent, KRACHT.accent, PALE_YELLOW.accent]
  let checked = 0
  for (const accent of accents) {
    for (let v = 20; v <= 235; v += 2) {
      const hex = `#${v.toString(16).padStart(2, '0').repeat(3)}`
      const css = derive({ ...VELDE, accent, surface: hex }).css
      for (const [fg, bg] of AA_GUARANTEED_PAIRS) {
        expect(ratioFor(css, fg, bg)).toBeGreaterThanOrEqual(4.5)
        checked++
      }
    }
  }
  expect(checked).toBe(accents.length * 108 * AA_GUARANTEED_PAIRS.length)
})
