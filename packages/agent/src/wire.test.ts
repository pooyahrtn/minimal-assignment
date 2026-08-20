import { expect, test } from 'bun:test'
import { parsedReading } from './converse'

/**
 * `POST /v1/chat` is a network boundary, and what comes back goes straight into `retrieve.ts`'s
 * `predicateFor` — a switch that closes with `const _exhaustive: never` and THROWS — and into
 * `obstacle.ts`'s `product.price - chip.kind.max` arithmetic. The origin serving the bundle is
 * trusted to be us; the bytes are still bytes [widget.ts: "an origin check makes the sender
 * trusted, not the data well-formed"].
 *
 * The failure this prevents is specific: the throw would happen inside an async turn handler,
 * where it becomes an unhandled rejection — no blocks pushed, no fallback, no error anywhere, the
 * panel simply stops answering. [ENGINEERING §2.9]
 */

const ok = {
  chips: [
    { id: 'chip-vegan', label: 'vegan', state: 'active', kind: { type: 'tag', tag: 'vegan' } },
  ],
}

test('a well-formed payload survives', () => {
  expect(parsedReading(ok)?.chips.length).toBe(1)
})

test('a price ceiling that is not a finite number is refused', () => {
  for (const max of [Number.NaN, Number.POSITIVE_INFINITY, '30', null, undefined]) {
    const payload = {
      chips: [
        { id: 'chip-price', label: 'under €30', state: 'active', kind: { type: 'price-max', max } },
      ],
    }
    expect(parsedReading(payload)).toBeNull()
  }
})

test('an unknown chip kind is refused rather than reaching the throwing switch', () => {
  const payload = {
    chips: [{ id: 'x', label: 'x', state: 'active', kind: { type: 'regex', pattern: '.*' } }],
  }
  expect(parsedReading(payload)).toBeNull()
})

test('junk in place of the envelope, the array, or any field is refused', () => {
  for (const junk of [
    null,
    undefined,
    42,
    'chips',
    {},
    { chips: null },
    { chips: {} },
    { chips: [null] },
    { chips: [{}] },
  ]) {
    expect(parsedReading(junk)).toBeNull()
  }
})

test('a bad chip anywhere in the array rejects the whole payload, never a partial row', () => {
  const payload = {
    chips: [
      ok.chips[0],
      { id: 'y', label: 'y', state: 'sideways', kind: { type: 'tag', tag: 'y' } },
    ],
  }
  expect(parsedReading(payload)).toBeNull()
})

/**
 * Inverted from "an empty array is not a reading". With no local parser behind this boundary, an
 * empty chip list means "the model understood no constraint" — a real answer, and a different one
 * from "the model could not be reached". Only the latter is `null` now, so the widget can tell the
 * shopper which of the two happened instead of painting the same error for both.
 */
test('an empty chip array is a valid reading, not a miss', () => {
  const reading = parsedReading({ chips: [] })
  expect(reading).not.toBeNull()
  expect(reading?.chips).toEqual([])
  expect(reading?.dropped).toEqual([])
})

test('an unsupported chip — a disclosure, not a filter — survives the guard', () => {
  const payload = {
    chips: [
      {
        id: 'chip-unsupported-exactly-one-button',
        label: 'exactly one button',
        state: 'unsupported',
        kind: { type: 'unsupported', phrase: 'exactly one button' },
      },
    ],
  }
  expect(parsedReading(payload)?.chips[0]?.kind).toEqual({
    type: 'unsupported',
    phrase: 'exactly one button',
  })
})

test('a goal chip survives the wire; an empty or part-junk one is refused, never silently narrowed', () => {
  const goal = (tags: unknown) => ({
    chips: [
      {
        id: 'chip-any-creatine-protein',
        label: 'creatine or protein',
        state: 'active',
        kind: { type: 'any-of', tags },
      },
    ],
  })
  expect(parsedReading(goal(['creatine', 'protein']))?.chips[0]?.kind).toEqual({
    type: 'any-of',
    tags: ['creatine', 'protein'],
  })
  // An EMPTY `any-of` matches nothing — `some` over `[]` is false — so it would empty the catalog
  // rather than widen it, and a goal with one entry dropped is a different constraint, not a
  // smaller one. Both are malformed here, not repaired.
  for (const junk of [[], ['creatine', 3], ['creatine', null], 'creatine', null, 7]) {
    expect(parsedReading(goal(junk))).toBeNull()
  }
})

test('dropped is read as a string array and defaults to [] when absent or junk', () => {
  expect(parsedReading({ ...ok, dropped: ['chip-vegan'] })?.dropped).toEqual(['chip-vegan'])
  expect(parsedReading(ok)?.dropped).toEqual([])
  expect(parsedReading({ ...ok, dropped: 'chip-vegan' })?.dropped).toEqual([])
  expect(parsedReading({ ...ok, dropped: [1, 'chip-vegan', null] })?.dropped).toEqual([
    'chip-vegan',
  ])
})
