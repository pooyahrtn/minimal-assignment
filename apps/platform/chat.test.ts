import { expect, test } from 'bun:test'
import { chipsFrom } from '../../packages/agent/src/brain/parse'
import type { Product } from '../../packages/agent/src/types'
import { offerableTags } from './chat'

/**
 * Everything in `chat.ts` that decides what the model is allowed to say and how its answer becomes
 * a chip row — all of it reachable without a key or a network call, which is the point. The
 * provider call itself is measured against the REAL endpoint by `bench/checks/transcript.ts`; a
 * paid test in `bun test` is a test nobody runs.
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

// Shaped like the real KRACHT catalog on the axis that used to matter: `protein` and
// `protein-shake` sit on exactly the same products (an ingest artifact). `vegan` is co-extensive
// with nothing.
const CATALOG: Product[] = [
  product('a', 32.95, ['protein', 'protein-shake', 'lactose-free', 'no-sweeteners']),
  product('b', 38.95, ['protein', 'protein-shake', 'lactose-free', 'no-sweeteners']),
  product('c', 19.95, ['protein', 'protein-shake', 'vegan']),
  product('d', 24.0, ['pre-workout']),
]

// Shaped like the real VELDE catalog on the axis that broke: `bike` and `office` are co-extensive
// there too — two pieces carry both — but they are a REAL distinction, not an artifact, and the
// graded opening message asks for both of them in one sentence.
const CLOTHES: Product[] = [
  product('overshirt', 195, ['jacket', 'outerwear', 'navy', 'matte']),
  product('commuter', 245, ['jacket', 'outerwear', 'black', 'matte', 'office', 'bike']),
  product('peacoat', 380, ['jacket', 'outerwear', 'black', 'office', 'bike']),
]

test('every tag the merchant sells is offerable — co-extensive tags are no longer collapsed', () => {
  // The collapse existed to stop two INTAKE PATHS naming one constraint differently. There is one
  // path now. What it cost while it stood is this: `bike` and `office` select the same two pieces,
  // so one of them was dropped from VELDE's vocabulary outright and the model had no word for a
  // constraint the shopper said out loud in "a jacket I can wear to the office and on the bike".
  const offered = offerableTags(CLOTHES)
  expect(offered).toContain('office')
  expect(offered).toContain('bike')
  // Same rule, applied to the pair it used to be justified by: both survive now.
  expect(offerableTags(CATALOG)).toContain('protein')
  expect(offerableTags(CATALOG)).toContain('protein-shake')
})

test('the vocabulary is deterministic — sorted, so two runs offer the same list in the same order', () => {
  const once = offerableTags(CLOTHES)
  const shuffled = offerableTags([...CLOTHES].reverse())
  expect(once).toEqual(shuffled)
  expect(once).toEqual([...once].sort())
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

test('a chip label comes from the merchant config, never from the model', () => {
  // PRINCIPLES §8: the chip row is computed, never generated. The model emits a TAG; the label is
  // looked up server-side out of the merchant's own strings.
  const chips = chipsFrom(
    { tags: ['office', 'bike'] },
    { 'chip.label.office': 'office-ready', 'chip.label.bike': 'bike-ready' },
  )
  expect(chips.map((c) => c.label)).toEqual(['office-ready', 'bike-ready'])
  expect(chips.map((c) => c.id)).toEqual(['chip-office', 'chip-bike'])
})

test('a tag the merchant never labelled falls back to the tag, never to the raw key', () => {
  // The ~150 runtime-minted `shop-*.json` configs carry no `chip.label.*` keys at all, and
  // `config.ts:47 str()` renders a missing key AS THE KEY. This path deliberately does not go
  // through `str()`, so no shopper ever reads "chip.label.vegan" in the row.
  const chips = chipsFrom({ tags: ['vegan', 'leather'] }, {})
  expect(chips.map((c) => c.label)).toEqual(['vegan', 'leather'])
  for (const chip of chips) expect(chip.label.startsWith('chip.label.')).toBe(false)
})

test('an unsupported phrase becomes an inert chip, last in the row and never active', () => {
  // A disclosure, not a filter: `intersect` and `findObstacle` both read `state === 'active'`
  // only, so this kind reaches neither without a line of code being written to let it.
  const chips = chipsFrom({ tags: ['vegan'], unsupported: ['exactly one button', 'waterproof'] })
  expect(chips.map((c) => c.state)).toEqual(['active', 'unsupported', 'unsupported'])
  expect(chips.filter((c) => c.state === 'unsupported').map((c) => c.label)).toEqual([
    'exactly one button',
    'waterproof',
  ])
})

test('a goal becomes ONE chip, satisfied by ANY of its attributes, labelled from merchant config', () => {
  // "I want to gain muscle" on KRACHT. Nothing there carries both `protein` and `creatine`, so two
  // tag chips would intersect to zero and the shopper would be told their own goal contradicts
  // itself. One chip, either attribute satisfies it, dropped in one tap like any other.
  const chips = chipsFrom(
    { tags: [], goal: ['protein', 'creatine'] },
    { 'chip.label.protein': 'protein powder' },
  )
  expect(chips.map((c) => c.id)).toEqual(['chip-any-creatine-protein'])
  expect(chips[0]?.kind).toEqual({ type: 'any-of', tags: ['creatine', 'protein'] })
  // Still PRINCIPLES §8: every word in that label came from the merchant's config or the tag
  // itself, never off the wire from the model.
  expect(chips[0]?.label).toBe('creatine or protein powder')
  // Sorted, so the same goal read again next turn keeps the same id and `mergeChips` sees one
  // chip rather than two.
  expect(chipsFrom({ tags: [], goal: ['creatine', 'protein'] })[0]?.id).toBe(chips[0]?.id)
})

test('a one-attribute goal IS that attribute — never a one-sided "or", never a duplicate chip', () => {
  expect(chipsFrom({ tags: ['vegan'], goal: ['protein'] }).map((c) => c.id)).toEqual([
    'chip-vegan',
    'chip-protein',
  ])
  // Same id as if the shopper had named it, so stating a goal and then naming the thing out loud
  // leaves one chip for one constraint.
  expect(chipsFrom({ tags: ['protein'], goal: ['protein'] }).map((c) => c.id)).toEqual([
    'chip-protein',
  ])
})

test('a price the model made up cannot reach the chip row or the obstacle arithmetic', () => {
  // `obstacle.ts` does `product.price - max` and the row renders `under €${max}`, so a NaN or an
  // Infinity off the wire would render into both. The model is the only intake path now, so it is
  // the only thing that can produce one.
  for (const maxPrice of [Number.NaN, Number.POSITIVE_INFINITY, -5, 0]) {
    expect(chipsFrom({ tags: ['vegan'], maxPrice }).some((c) => c.id === 'chip-price')).toBe(false)
  }
  expect(chipsFrom({ tags: [], maxPrice: 30 }).map((c) => c.label)).toEqual(['under €30'])
})
