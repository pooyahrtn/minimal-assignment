import { describe, expect, test } from 'bun:test'
import type { Block, Product } from '../types'
import { createBrain, step } from './fsm'
import type { ParsedChip } from './parse'
import { parseIntake } from './parse'
import { intersect } from './retrieve'

/**
 * RED ON PURPOSE. Every test in this file fails today and describes behaviour the agent does not
 * have yet: knowing the boundary of what it can filter on, and saying so.
 *
 * The brief (`TAKE_HOME.md`) asks for a moment where things do not go smoothly. The repo ships
 * one — the obstacle: nothing matches, name the blocking constraint, offer the trade-off. That
 * path is good and these tests do not touch it. They cover the OTHER unhappy path, the one that
 * currently fails silently:
 *
 *   1. The shopper excludes something ("nothing leather"). There is no exclusion predicate, so
 *      the constraint evaporates and the same results come back looking like agreement.
 *   2. The shopper names an attribute the catalog cannot express ("exactly one button"). Every
 *      unrecognised word is dropped without trace, and the agent answers with full confidence.
 *
 * Both are the same defect wearing two hats: the system is honest about what it DID and mute
 * about what it COULDN'T. A shopper cannot tell the difference between "no jacket has one button"
 * and "I never checked".
 *
 * TYPECHECK STAYS GREEN. `Intake.unsupported` has landed and is read as the typed field it now
 * is. The `tag-not` chip kind has not, so it is still probed by name through a guarded read —
 * no `as`, per ENGINEERING §1.4. `bun run typecheck` passes; `bun test` fails with a readable
 * message. Tighten the remaining probe into a typed read when exclusion lands.
 */

/** The `kind.type` of a chip, as a plain string, so a test can name a kind the union lacks. */
function kindType(chip: ParsedChip): string {
  const held: unknown = Reflect.get(chip.kind, 'type')
  return typeof held === 'string' ? held : ''
}

const product = (id: string, price: number, tags: string[]): Product => ({
  id,
  title: id,
  url: '',
  image: null,
  price,
  currency: 'EUR',
  inStock: true,
  specs: [],
  tags,
})

/**
 * Shaped after the real VELDE assortment (`apps/platform/config/velde.json`), reduced to the part
 * that matters: leather goods that are NOT tagged `jacket`, plus jackets that are not leather.
 *
 * That split is why the screenshot that started this looked correct. "not leather" did nothing at
 * all, and nobody could tell, because no leather item was tagged `jacket` in the first place. The
 * bag case below removes that coincidence and shows the defect bare.
 */
const catalog: Product[] = [
  product('wal-overshirt', 195, ['jacket', 'matte', 'navy']),
  product('dijk-chore-jacket', 245, ['jacket', 'black', 'matte', 'office']),
  product('kade-leather-bomber', 595, ['jacket', 'black', 'matte', 'leather']),
  product('veld-leather-tote', 395, ['bag', 'black', 'matte', 'leather']),
  product('dam-canvas-tote', 120, ['bag', 'matte', 'ecru']),
]

const cards = (blocks: Block[]): string[] =>
  blocks.flatMap((b) => (b.kind === 'product-card' ? [b.product.title] : []))

/**
 * Did this turn tell the shopper about something it could not do? Deliberately loose about HOW:
 * a dedicated block kind, a flag on the chip row, or a text block — the UX is still open. The
 * assertion is only that the information reaches the transcript at all, so these tests survive
 * the design decision instead of pre-empting it.
 */
function reportsALimit(blocks: Block[]): boolean {
  return blocks.some((block) => {
    // The shipped shape: a third chip state, carried in the row the shopper already reads.
    if (block.kind === 'chips-update') {
      return block.chips.some((chip) => chip.state === 'unsupported')
    }
    // Still tolerated, so a later redesign that moves the disclosure into its own block does not
    // have to rewrite these tests to stay meaningful.
    const kind: string = block.kind
    return kind === 'unsupported' || kind === 'limits'
  })
}

describe('exclusion is a constraint, not a no-op', () => {
  test('"nothing leather" removes leather products from the results', () => {
    const intake = parseIntake('a bag, nothing leather', catalog)
    const results = intersect(intake.chips, catalog)

    expect(results.length).toBeGreaterThan(0)
    expect(results.map((p) => p.id)).not.toContain('veld-leather-tote')
    expect(results.map((p) => p.id)).toContain('dam-canvas-tote')
  })

  test('an exclusion becomes a visible chip, so it can be dropped like any other constraint', () => {
    const intake = parseIntake('a bag, nothing leather', catalog)
    const exclusion = intake.chips.find((chip) => kindType(chip) === 'tag-not')

    // The chip row is the brief AND the receipt (ENGINEERING §2.10). A constraint that filters
    // results but never appears in the row is a filter the shopper cannot see or undo.
    expect(exclusion).toBeDefined()
    expect(exclusion?.state).toBe('active')
  })

  test('the screenshot case: "not leather" against a standing brief changes the answer', () => {
    const opened = step(createBrain(catalog), { type: 'message', text: 'a jacket under €400' })
    expect(cards(opened.blocks)).toEqual(['wal-overshirt', 'dijk-chore-jacket'])

    // Today this is a pure no-op: `not leather` retracts a `chip-leather` that was never in the
    // row, so the same two cards render again and the turn reads as agreement. Under the €400
    // ceiling the leather bomber is already excluded on price, so the OUTPUT is accidentally
    // right — which is exactly what makes it dangerous. Lift the ceiling and the coincidence goes.
    const excluded = step(opened.state, { type: 'message', text: 'not leather' })
    const raised = step(excluded.state, { type: 'message', text: 'actually up to €700' })

    expect(cards(raised.blocks)).not.toContain('kade-leather-bomber')
  })

  test('the model path can carry an exclusion too', () => {
    // `fsm.ts` hardcodes `dropped: []` for the model path, so negation exists only on the
    // deterministic path today. A model that correctly reads "nothing leather" has nowhere to put
    // it, and the two paths disagree on the same sentence — the one thing T13 is built to avoid.
    const intake = parseIntake('a bag, nothing leather', catalog)
    const viaModel = step(createBrain(catalog), {
      type: 'message',
      text: 'a bag, nothing leather',
      chips: intake.chips,
    })

    expect(cards(viaModel.blocks)).not.toContain('veld-leather-tote')
  })
})

describe('the agent knows what it cannot filter on', () => {
  test('an unfilterable attribute is reported back, not silently dropped', () => {
    const intake = parseIntake('a jacket with exactly one button', catalog)

    expect(intake.chips.map((c) => c.id)).toContain('chip-jacket')
    // "exactly one button" is not in this catalog's vocabulary and never will be — no product
    // records a button count. The parser must hand that back rather than discard it.
    expect(intake.unsupported).not.toEqual([])
  })

  test('a turn never shows results as if it understood everything', () => {
    const result = step(createBrain(catalog), {
      type: 'message',
      text: 'a jacket with exactly one button',
    })

    // The invariant, stated as the thing that must never happen: confident cards AND an unspoken
    // constraint. Either the limit is named or there is nothing to name. This is design-agnostic
    // on purpose — it holds whatever the eventual copy and block kind turn out to be.
    const silentlyConfident = cards(result.blocks).length > 0 && !reportsALimit(result.blocks)
    expect(silentlyConfident).toBe(false)
  })

  test('a fully understood message reports no limit — the signal has to stay quiet when it should', () => {
    // The failure mode of the fix is a widget that apologises on every turn. A message entirely
    // inside the vocabulary must produce a clean recommendation with nothing appended.
    const result = step(createBrain(catalog), {
      type: 'message',
      text: 'a black jacket under €400',
    })

    expect(cards(result.blocks).length).toBeGreaterThan(0)
    expect(reportsALimit(result.blocks)).toBe(false)
  })
})

/**
 * The eval proper: one row per shopper message, each naming what the agent is expected to
 * understand and what it must admit it cannot do. Table-driven so a new failure mode is one row
 * rather than one more test, and so the pass rate is a number that can move over time.
 *
 * `unsupported: true` does not demand any particular sentence — only that the turn does not claim
 * to have applied a constraint it has no way to apply.
 */
const EVAL_CASES: { message: string; expectChips: string[]; unsupported: boolean }[] = [
  {
    message: 'a jacket under €400',
    expectChips: ['chip-jacket', 'chip-price'],
    unsupported: false,
  },
  { message: 'a black jacket', expectChips: ['chip-black'], unsupported: false },
  { message: 'a bag, nothing leather', expectChips: ['chip-bag'], unsupported: false },
  { message: 'a jacket with exactly one button', expectChips: ['chip-jacket'], unsupported: true },
  { message: 'a jacket my mother would like', expectChips: ['chip-jacket'], unsupported: true },
  { message: 'something waterproof', expectChips: [], unsupported: true },
  {
    message: 'a jacket that arrives before Friday',
    expectChips: ['chip-jacket'],
    unsupported: true,
  },
  { message: 'a jacket in a size 52 long', expectChips: ['chip-jacket'], unsupported: true },
]

describe('eval: understood vs admitted', () => {
  for (const { message, expectChips, unsupported } of EVAL_CASES) {
    test(`"${message}"`, () => {
      const intake = parseIntake(message, catalog)
      const ids = intake.chips.map((chip) => chip.id)
      for (const expected of expectChips) expect(ids).toContain(expected)

      const reported = intake.unsupported.length > 0
      expect(reported).toBe(unsupported)
    })
  }
})
