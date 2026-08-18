import { srgbChannelToLinear } from './oklch'
import type { Rgb } from './oklch'

/**
 * WCAG 2.x relative luminance and contrast ratio, measured on sRGB. This is how 4.5:1 and 3:1
 * are *defined* — colour search happens in OKLCH, but the pass/fail check is always this.
 */
export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * srgbChannelToLinear(rgb.r) +
    0.7152 * srgbChannelToLinear(rgb.g) +
    0.0722 * srgbChannelToLinear(rgb.b)
  )
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}
