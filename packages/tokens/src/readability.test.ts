import { expect, test } from 'bun:test'
import { DEFAULT_BRAND, HELDER, KRACHT, MAXIMAL, VELDE } from './brands'
import { contrastRatio } from './contrast'
import { nearestVisibleAccent, readabilityReport } from './derive'
import type { MerchantTokens } from './merchant'
import { hexToRgb } from './oklch'

const BRANDS: readonly [string, MerchantTokens][] = [
  ['VELDE', VELDE],
  ['KRACHT', KRACHT],
  ['HELDER', HELDER],
  ['MAXIMAL', MAXIMAL],
]

test('every guaranteed pair meets 4.5:1 and shortfalls is empty, for all four brands', () => {
  for (const [name, brand] of BRANDS) {
    const report = readabilityReport(brand)
    for (const row of report.guaranteed) {
      expect(row.meets, `${name} ${row.fg} on ${row.bg}: ${row.ratio}`).toBe(true)
    }
    expect(report.shortfalls, name).toEqual([])
  }
})

test('HELDER accentOnSurface fails, ~1.30:1 — the shipped brand that fails', () => {
  const row = readabilityReport(HELDER).accentOnSurface
  expect(row.meets).toBe(false)
  expect(row.ratio).toBeCloseTo(1.3, 1)
})

test('MAXIMAL accentOnSurface passes', () => {
  expect(readabilityReport(MAXIMAL).accentOnSurface.meets).toBe(true)
})

test('mutedMove always moves, and HELDER differs from VELDE (hue-tinted vs grey)', () => {
  for (const [name, brand] of BRANDS) {
    const { mutedMove } = readabilityReport(brand)
    expect(mutedMove.toHex, name).not.toBe(mutedMove.fromHex)
  }
  const helder = readabilityReport(HELDER).mutedMove.toHex
  const velde = readabilityReport(VELDE).mutedMove.toHex
  expect(helder).not.toBe(velde)
})

test('nearestVisibleAccent finds a passing colour, and leaves an already-passing accent unchanged', () => {
  const surface = '#F7F0B8'
  const fixed = nearestVisibleAccent('#E8D44D', surface)
  const ratio = contrastRatio(hexToRgb(fixed), hexToRgb(surface))
  expect(ratio).toBeGreaterThanOrEqual(3)

  const unchanged = nearestVisibleAccent('#2C3E5C', '#FBFAF8')
  expect(unchanged).toBe('#2C3E5C')
})

test('fault-inject: pathological mid-grey surface does not throw and returns a hex', () => {
  const result = nearestVisibleAccent('#777777', '#767676')
  expect(result).toMatch(/^#[0-9a-fA-F]{6}$/)
})

test('sanity: DEFAULT_BRAND readability report does not throw', () => {
  expect(() => readabilityReport(DEFAULT_BRAND)).not.toThrow()
})
