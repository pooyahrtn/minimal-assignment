import type { Product } from '../types'
import type { ParsedChip } from './parse'
import { intersect } from './retrieve'

export type Obstacle = {
  /** The single chip whose removal yields results — computed, never scripted. */
  blocking: ParsedChip
  /** Near misses, gap quantified as a number. */
  closest: { product: Product; gap: string }[]
  /** The chip row as it would read if `blocking` were dropped. */
  alternatives: ParsedChip[]
}

function quantifyGap(chip: ParsedChip, product: Product): string {
  if (chip.kind.type === 'price-max') {
    const over = product.price - chip.kind.max
    return `€${product.price.toFixed(2)}, €${over.toFixed(2)} over`
  }
  return `€${product.price.toFixed(2)}, missing ${chip.label}`
}

/**
 * The obstacle is computed, never scripted: intersect all active chips, and if empty, test the
 * intersection *without* each chip in turn. On a realistic assortment more than one removal can
 * rescue the set (e.g. dropping either of two attribute chips each frees a single product) —
 * when that happens this picks the removal that recovers the MOST products, the most useful
 * trade-off to hand back, with chip declaration order as the deterministic tiebreak. Ties and
 * multi-candidate cases are invented behaviour, not part of the DoD text — see hand-off.
 * [ENGINEERING §3.3 — invariant tested above the limit: run this on more chips than the count
 * that first empties the set.]
 */
export function findObstacle(chips: ParsedChip[], catalog: Product[]): Obstacle | null {
  const active = chips.filter((c) => c.state === 'active')
  if (active.length === 0 || intersect(active, catalog).length > 0) return null

  let best: { chip: ParsedChip; results: Product[] } | null = null
  for (const chip of active) {
    const withoutChip = active.filter((c) => c.id !== chip.id)
    const results = intersect(withoutChip, catalog)
    if (results.length > 0 && (!best || results.length > best.results.length)) {
      best = { chip, results }
    }
  }
  if (!best) return null
  const resolved = best

  const closest = [...resolved.results]
    .sort((a, b) => a.price - b.price)
    .slice(0, 3)
    .map((product) => ({ product, gap: quantifyGap(resolved.chip, product) }))

  const alternatives = chips.map((c) =>
    c.id === resolved.chip.id ? { ...c, state: 'dropped' as const } : c,
  )

  return { blocking: resolved.chip, closest, alternatives }
}
