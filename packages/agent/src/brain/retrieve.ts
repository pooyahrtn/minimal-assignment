import type { Product } from '../types'
import type { ParsedChip } from './parse'

/** Each chip is a predicate over a Product's `tags`/`price`. [PRINCIPLES §6] */
export function predicateFor(chip: ParsedChip): (product: Product) => boolean {
  switch (chip.kind.type) {
    case 'tag': {
      const tag = chip.kind.tag
      return (product) => product.tags.includes(tag)
    }
    // ANY of them, not all. The chip is ONE goal the shopper stated and the tags are the ways this
    // merchant can serve it, so a product that does either satisfies it. `every` here would be an
    // empty set on any catalog where the alternatives do not co-occur, which is the normal case —
    // protein powders and creatine are different products in every shop that sells both.
    case 'any-of': {
      const tags = chip.kind.tags
      return (product) => product.tags.some((tag) => tags.includes(tag))
    }
    case 'price-max': {
      const max = chip.kind.max
      return (product) => product.price <= max
    }
    // Never consulted in practice — `intersect` reads active chips only and this kind is never
    // active — but the switch is closed with a throwing `never`, so the case has to exist. Always
    // true is the honest answer anyway: a constraint we cannot express excludes nothing.
    case 'unsupported':
      return () => true
    default: {
      const _exhaustive: never = chip.kind
      throw new Error(`unhandled chip kind: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

export function matches(chip: ParsedChip, product: Product): boolean {
  return predicateFor(chip)(product)
}

/** A recommendation is the intersection of all active chips' predicates. */
export function intersect(chips: ParsedChip[], catalog: Product[]): Product[] {
  const active = chips.filter((c) => c.state === 'active')
  return catalog.filter((product) => active.every((chip) => matches(chip, product)))
}
