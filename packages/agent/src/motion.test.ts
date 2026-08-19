import { expect, test } from 'bun:test'
import { HELDER, KRACHT, VELDE, derive } from '@maximal/tokens'
import { styles } from './css'

/**
 * T9's DoD box: *"`prefers-reduced-motion` respected."*
 *
 * The honest state of that box, measured: **the widget ships no motion at all.** There is not one
 * `transition`, `animation`, `@keyframes` or `transform` in `packages/agent/src`. The only animated
 * surface in the repo is VELDE's cart drawer, which is frozen storefront source and not ours.
 *
 * So the box is satisfied vacuously today, and a `@media (prefers-reduced-motion: reduce)` block
 * guarding nothing would be a box that cannot fail — the exact defect T7's review had to catch
 * elsewhere. Adding an animation in order to have something to suppress would be building a
 * problem to solve it.
 *
 * What ships instead is this: the assertion that keeps the box true for the NEXT person. The
 * moment anyone adds motion to the widget — T13's turn loop is the likely one — this test fails
 * until the motion is guarded. It reads the stylesheet the widget actually emits, under all three
 * brands, rather than grepping the source [ENGINEERING §3.13].
 *
 * Its ceiling, named: this sees CSS motion only. A JS-driven animation would pass it, and the
 * guard for that is `matchMedia('(prefers-reduced-motion: reduce)')` in the code that starts it.
 */

const MOTION = /\b(transition|animation|@keyframes|scroll-behavior\s*:\s*smooth)\b/g
const REDUCED = '@media (prefers-reduced-motion: reduce)'

for (const [name, merchant] of [
  ['velde', VELDE],
  ['kracht', KRACHT],
  ['helder', HELDER],
] as const) {
  test(`${name}: every motion declaration in the emitted stylesheet is behind a reduced-motion guard`, () => {
    const sheet = styles(derive(merchant))
    const declarations = sheet.match(MOTION) ?? []

    if (declarations.length === 0) {
      // The state at the time of writing. Asserted rather than assumed, so "there is no motion"
      // stays a measurement instead of becoming folklore.
      expect(sheet).not.toContain(REDUCED)
      return
    }

    expect(
      sheet.includes(REDUCED),
      `${declarations.length} motion declaration(s) (${[...new Set(declarations)].join(', ')}) ` +
        `and no ${REDUCED} block. Motion is fine; unguarded motion is not.`,
    ).toBe(true)
  })
}

test('the emitted stylesheet is non-empty, so the assertions above ran against something', () => {
  expect(styles(derive(VELDE)).length).toBeGreaterThan(1000)
})
