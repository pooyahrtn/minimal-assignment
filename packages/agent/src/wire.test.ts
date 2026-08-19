import { expect, test } from 'bun:test'
import { parsedChips } from './converse'

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
  expect(parsedChips(ok)?.length).toBe(1)
})

test('a price ceiling that is not a finite number is refused', () => {
  for (const max of [Number.NaN, Number.POSITIVE_INFINITY, '30', null, undefined]) {
    const payload = {
      chips: [
        { id: 'chip-price', label: 'under €30', state: 'active', kind: { type: 'price-max', max } },
      ],
    }
    expect(parsedChips(payload)).toBeNull()
  }
})

test('an unknown chip kind is refused rather than reaching the throwing switch', () => {
  const payload = {
    chips: [{ id: 'x', label: 'x', state: 'active', kind: { type: 'regex', pattern: '.*' } }],
  }
  expect(parsedChips(payload)).toBeNull()
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
    expect(parsedChips(junk)).toBeNull()
  }
})

test('a bad chip anywhere in the array rejects the whole payload, never a partial row', () => {
  const payload = {
    chips: [
      ok.chips[0],
      { id: 'y', label: 'y', state: 'sideways', kind: { type: 'tag', tag: 'y' } },
    ],
  }
  expect(parsedChips(payload)).toBeNull()
})

test('an empty array is not a reading', () => {
  expect(parsedChips({ chips: [] })).toBeNull()
})
