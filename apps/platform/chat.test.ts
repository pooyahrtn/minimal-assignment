import { expect, test } from 'bun:test'
import { chipsFrom } from '../../packages/agent/src/brain/parse'
import type { Product } from '../../packages/agent/src/types'
import { offerableTags, readingIsUseless } from './chat'

/**
 * The two pieces of T13 that decide whether the LIVE path is better or worse than the offline one,
 * both reachable without a key or a network call — which is the point. Everything else in `chat.ts`
 * is the provider call itself, and a test that needs a paid API is a test nobody runs.
 *
 * Neither of these was covered when this task first went to review, and the review said so: the
 * verify guard is described in its own comment as the thing "the demo depends on", and nothing
 * would have failed if someone had deleted it.
 */

const product = (id: string, price: number, tags: string[]): Product => ({
  id,
  title: id,
  url: `http://example.test/${id}`,
  image: null,
  price,
  currency: 'EUR',
  inStock: true,
  specs: [],
  tags,
})

// Shaped like the real KRACHT catalog on the axis that matters: `protein` and `protein-shake` sit
// on exactly the same products, which is the ingest artifact that produced two chips for one
// constraint. `vegan` is co-extensive with nothing and must survive untouched.
const CATALOG: Product[] = [
  product('a', 32.95, ['protein', 'protein-shake', 'lactose-free', 'no-sweeteners']),
  product('b', 38.95, ['protein', 'protein-shake', 'lactose-free', 'no-sweeteners']),
  product('c', 19.95, ['protein', 'protein-shake', 'vegan']),
  product('d', 24.0, ['pre-workout']),
]

test('co-extensive tags collapse to the one the deterministic parser also names', () => {
  const offered = offerableTags(CATALOG)
  expect(offered).toContain('protein-shake')
  // `protein` selects the identical product set and `parse.ts` does not name it, so it loses the
  // slot. Offering both is what let one LLM turn and one fallback turn put `chip-protein` and
  // `chip-protein-shake` in the same row, ANDed, with neither one droppable to rescue the set.
  expect(offered).not.toContain('protein')
})

test('tags that select different products all survive', () => {
  const offered = offerableTags(CATALOG)
  for (const tag of ['lactose-free', 'vegan', 'pre-workout']) expect(offered).toContain(tag)
})

test('no catalog tag is ever invented or renamed — the vocabulary is a subset of the real one', () => {
  const real = new Set(CATALOG.flatMap((p) => p.tags))
  for (const tag of offerableTags(CATALOG)) expect(real.has(tag)).toBe(true)
})

test('an unbounded or hostile tag list cannot reach the system prompt', () => {
  const hostile = [product('x', 1, [`${'A'.repeat(5000)}`, 'ok-tag'])]
  expect(offerableTags(hostile)).toEqual(['ok-tag'])
  const many = [
    product(
      'y',
      1,
      Array.from({ length: 500 }, (_, i) => `t${i}`),
    ),
  ]
  expect(offerableTags(many).length).toBeLessThanOrEqual(64)
})

test('a reading that matches nothing AND explains nothing is refused', () => {
  // Three tags no product combines, where dropping ANY ONE still yields zero: `vegan` only ever
  // co-occurs with `pre-workout` on nothing, `lactose-free` never with `vegan`. So `findObstacle`
  // has no single blocking constraint to name and returns null. Left to run, this is the dead end
  // PRINCIPLES §8 forbids: no chip to drop, no quantified trade-off, just "nothing in the range".
  //
  // Two chips is NOT enough to reach this state and the first draft of this test wrongly used two:
  // dropping one of a pair leaves a single constraint, which on any non-empty catalog usually
  // rescues something. It takes three to strand the set, which is exactly why one extra valid tag
  // from the model is the realistic way in.
  const chips = chipsFrom({ tags: ['pre-workout', 'vegan', 'lactose-free'] })
  expect(readingIsUseless(chips, CATALOG)).toBe(true)
})

test('a reading that matches nothing but names a blocking constraint is kept', () => {
  // The graded obstacle: three real constraints plus a budget nothing meets. Dropping the price
  // rescues two products, so there IS something to say.
  const chips = chipsFrom({
    tags: ['protein-shake', 'lactose-free', 'no-sweeteners'],
    maxPrice: 30,
  })
  expect(readingIsUseless(chips, CATALOG)).toBe(false)
})

test('a reading that simply matches products is kept', () => {
  expect(readingIsUseless(chipsFrom({ tags: ['vegan'] }), CATALOG)).toBe(false)
})

test('a price the model made up cannot reach the chip row or the obstacle arithmetic', () => {
  // `obstacle.ts` does `product.price - max` and the row renders `under €${max}`, so a NaN or an
  // Infinity off the wire would render into both. The regex path cannot produce one; the model can.
  for (const maxPrice of [Number.NaN, Number.POSITIVE_INFINITY, -5, 0]) {
    expect(chipsFrom({ tags: ['vegan'], maxPrice }).some((c) => c.id === 'chip-price')).toBe(false)
  }
  expect(chipsFrom({ tags: [], maxPrice: 30 }).map((c) => c.label)).toEqual(['under €30'])
})
