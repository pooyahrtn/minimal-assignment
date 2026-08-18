/**
 * Hand-rolled sRGB <-> OKLab/OKLCH conversion. Published matrices (Björn Ottosson,
 * https://bottosson.github.io/posts/oklab/) — no dependency, ~100 lines.
 *
 * OKLCH is used because its L channel is perceptually even: a fixed step in L reads as a
 * fixed step in apparent lightness across hues, so a lightness search (derive.ts) produces a
 * result that looks deliberate instead of a gamma-space fudge. [PRINCIPLES §7]
 */

export type Rgb = { r: number; g: number; b: number }
export type Oklch = { l: number; c: number; h: number }

export function srgbChannelToLinear(c: number): number {
  const cs = c / 255
  return cs <= 0.04045 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4
}

/**
 * Rounds to the integer 0-255 byte that will actually be written into `CssVars` as hex.
 *
 * Root-cause fix: the AA search (derive.ts `scanL`) checks contrast on whatever this function
 * returns, for BOTH the candidate colour and the backgrounds it's checked against (surfaceRaised
 * / surfaceSunken are themselves OKLCH->RGB conversions). If this returned unrounded floats, the
 * search could find a candidate that clears 4.5:1 against a float background, and then have each
 * side rounded independently afterwards (rgbToHex on the candidate, rgbToHex on the background) —
 * two roundings that can each move the ratio and, together, erode a margin that was only barely
 * above the bar. Rounding here means the search always evaluates the exact bytes that ship, so a
 * "pass" during the scan is a pass in the final `css` map — no rounding happens after the check.
 */
function linearChannelToSrgb(c: number): number {
  const clamped = Math.max(0, Math.min(1, c))
  const cs = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055
  return Math.round(cs * 255)
}

/** Only 6-digit `#rrggbb` — the only shape `MerchantTokens.accent`/`surface` ever carry. */
export function hexToRgb(hex: string): Rgb {
  const clean = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`invalid hex colour: ${hex}`)
  }
  const num = Number.parseInt(clean, 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

export function rgbToHex(rgb: Rgb): string {
  const toHex = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

export function rgbToOklch(rgb: Rgb): Oklch {
  const r = srgbChannelToLinear(rgb.r)
  const g = srgbChannelToLinear(rgb.g)
  const b = srgbChannelToLinear(rgb.b)

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bLab = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_

  const c = Math.sqrt(a * a + bLab * bLab)
  const h = c < 1e-6 ? 0 : (Math.atan2(bLab, a) * 180) / Math.PI

  return { l: L, c, h: h < 0 ? h + 360 : h }
}

function oklchToLinearRgb(oklch: Oklch): { r: number; g: number; b: number } {
  const hRad = (oklch.h * Math.PI) / 180
  const a = oklch.c * Math.cos(hRad)
  const b = oklch.c * Math.sin(hRad)

  const l_ = oklch.l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = oklch.l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = oklch.l - 0.0894841775 * a - 1.291485548 * b

  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}

export function oklchToRgb(oklch: Oklch): Rgb {
  const linear = oklchToLinearRgb(oklch)
  return {
    r: linearChannelToSrgb(linear.r),
    g: linearChannelToSrgb(linear.g),
    b: linearChannelToSrgb(linear.b),
  }
}

const GAMUT_MARGIN = 1e-4

function inGamut(oklch: Oklch): boolean {
  const { r, g, b } = oklchToLinearRgb(oklch)
  return (
    r >= -GAMUT_MARGIN &&
    r <= 1 + GAMUT_MARGIN &&
    g >= -GAMUT_MARGIN &&
    g <= 1 + GAMUT_MARGIN &&
    b >= -GAMUT_MARGIN &&
    b <= 1 + GAMUT_MARGIN
  )
}

const GAMUT_SEARCH_STEPS = 20

/**
 * A saturated brand colour searched across L can walk outside the sRGB gamut; clipping each
 * channel independently afterwards bends the hue while the contrast number stays "valid" — the
 * clamp passes and the colour is wrong. Binary-search chroma down to the gamut boundary at this
 * L/H instead, so hue is preserved and only saturation gives way.
 */
export function gamutMap(oklch: Oklch): Oklch {
  if (inGamut(oklch)) return oklch
  let lo = 0
  let hi = oklch.c
  for (let i = 0; i < GAMUT_SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2
    if (inGamut({ ...oklch, c: mid })) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return { ...oklch, c: lo }
}
