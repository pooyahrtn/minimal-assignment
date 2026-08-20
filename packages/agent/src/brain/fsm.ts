import type { Block, Chip, Product } from '../types'
import { findObstacle } from './obstacle'
import type { ParsedChip } from './parse'
import { chipsFrom } from './parse'
import { intersect } from './retrieve'

export type BrainStateName =
  | 'idle'
  | 'intake'
  | 'clarify'
  | 'recommend'
  | 'obstacle'
  | 'resolve'
  | 'act'

export type BrainState = {
  state: BrainStateName
  chips: ParsedChip[]
  catalog: Product[]
}

export type Action =
  /**
   * One turn of intake, already read. `step` does NOT parse: the model is the only intake path
   * and `converse.ts` supplies its reading here, verified against the merchant's catalog by the
   * platform first [apps/platform/chat.ts].
   *
   * Both fields are REQUIRED, and that is the whole "never silently produce an empty brief"
   * guarantee — made structural rather than promised. This action used to carry the shopper's raw
   * `text` with an optional `chips`, so a turn with no reading fell through to a local parse; with
   * that parse deleted, the same shape would have quietly stepped the FSM with zero constraints
   * and answered the clarify prompt as if the shopper had said nothing. There is now no way to
   * construct this action without a reading, so a turn that has none cannot reach the FSM at all —
   * it reaches the widget's error state instead. [ENGINEERING §2.9]
   *
   * `text` is gone because nothing here reads it any more; the widget echoes the shopper's own
   * line itself [widget.ts `say`].
   */
  | { type: 'message'; chips: ParsedChip[]; dropped: string[] }
  | { type: 'drop-chip'; id: string }
  | { type: 'restore-chip'; id: string }
  | { type: 'select-product'; productId: string }

export type StepResult = { state: BrainState; blocks: Block[] }

export function createBrain(catalog: Product[]): BrainState {
  return { state: 'idle', chips: [], catalog }
}

/**
 * A retraction landing on ONE tag inside a standing `any-of` narrows it instead of leaving it
 * whole — see the third bullet on `mergeChips` below for why a plain id match can never catch
 * this case at all. 2+ tags survive → a narrower `any-of`, same shape `chipsFrom` itself builds.
 * Exactly 1 survives → the ordinary `tag` chip `chipsFrom` builds for a single-attribute goal; no
 * merchant `strings` are in scope here, so the label falls back to the raw tag — same convention
 * `parse.ts` documents for a tag with no `chip.label.*` entry. 0 survive → the chip is dropped
 * whole, receipt intact, exactly like any other retraction. [ENGINEERING §2.10]
 */
function shrinkAnyOf(chip: ParsedChip, dropped: string[]): ParsedChip {
  if (chip.kind.type !== 'any-of') return chip
  const remaining = chip.kind.tags.filter((tag) => !dropped.includes(`chip-${tag}`))
  if (remaining.length === chip.kind.tags.length) return chip
  const [tag, ...rest] = remaining
  if (tag === undefined) return { ...chip, state: 'dropped' }
  if (rest.length === 0) {
    return { id: `chip-${tag}`, label: tag, state: 'active', kind: { type: 'tag', tag } }
  }
  return {
    ...chip,
    id: `chip-any-${remaining.join('-')}`,
    label: remaining.join(' or '),
    kind: { type: 'any-of', tags: remaining },
  }
}

/**
 * New chips are appended; a chip already present (active OR dropped) is left untouched — a
 * dropped chip mentioned again does not silently resurrect. [ENGINEERING §2.10]
 *
 * Three things are not additive, and all three are the shopper changing their mind mid-sentence:
 *
 * - A price ceiling is a SINGLETON. "actually, under €400" is a new budget, not a second one —
 *   ANDing it with the standing "under €250" would leave the answer identical and the shopper
 *   talking to a wall. The incoming chip replaces the standing one IN PLACE (same id, same row
 *   position) and comes back active even if the old ceiling had been dropped.
 * - A tag the turn NEGATED ("forget black") is struck through rather than removed, exactly as if
 *   the chip's own drop control had been tapped: the row stays the brief and the receipt.
 * - An `any-of` (goal) chip SHRINKS. `dropped` only ever carries `chip-<tag>` ids for a single
 *   attribute [chat.ts], never the chip's own composite id, so "actually no creatine" cannot match
 *   `chip-any-creatine-protein` by id — the plain `dropped.includes(c.id)` check below would leave
 *   the whole chip active, the shopper's rejected half included. `shrinkAnyOf` above narrows the
 *   member list by tag instead.
 *
 * Shrinking can mint an id `existing` never had (`chip-any-creatine-protein` → `chip-protein`),
 * invisible to `known` below — if the SAME turn also names that attribute directly, both paths
 * land on `chip-protein` and the row would carry it twice. The incoming one wins: it is built
 * fresh by `chipsFrom` WITH the merchant's `strings`, so it carries a real label where the shrunk
 * fallback only has the raw tag.
 */
function mergeChips(
  existing: ParsedChip[],
  incoming: ParsedChip[],
  dropped: string[],
): ParsedChip[] {
  const known = new Set(existing.map((c) => c.id))
  const price = incoming.find((c) => c.kind.type === 'price-max')
  const kept = existing.map((c) => {
    if (price !== undefined && c.id === price.id) return price
    if (c.state === 'active' && c.kind.type === 'any-of') return shrinkAnyOf(c, dropped)
    return dropped.includes(c.id) ? { ...c, state: 'dropped' as const } : c
  })
  const added = incoming.filter((c) => !known.has(c.id))
  const addedIds = new Set(added.map((c) => c.id))
  return [...kept.filter((c) => !addedIds.has(c.id)), ...added]
}

function reasonFor(chips: ParsedChip[]): string {
  return `Matches ${chips.map((c) => c.label).join(', ')}`
}

/**
 * A goal-shaped brief ("I want to gain muscle") can legitimately match most of a catalog — on
 * KRACHT that was 28 uncapped cards, a scroll wall no shipped shopping assistant ships. Four
 * independent systems converge on 3-5 regardless of how much actually matches: Amazon Rufus shows
 * ~5 where standard search shows ~50, Perplexity Shopping 3-5, Google Shopping AI Mode averages
 * ~4.3 per answer against ~22.5 on a standard results page (100k+ SERP study), ChatGPT shopping ~4
 * organic. RESULT_CAP sits one above that range on purpose: this panel is a vertical stack the
 * shopper scrolls, not a horizontal carousel, so it can afford one more card before the same
 * scroll-wall problem returns.
 *
 * The cut is never silent, which is the other half of the finding: usability sources favour an
 * explicit disclosure over silent truncation, and Google AI Mode is the only one of the four
 * confirmed to show any affordance at all — silent truncation is the norm, not a considered
 * choice. `converse.ts`'s `reply()` owns saying what is hidden and how to narrow, in the
 * merchant's own words (`recommend.more`); this file stays brand-blind and only does the cut. A
 * module constant rather than a literal inline so the self-check below can assert against the
 * SAME number rather than a second copy of it that could drift.
 */
const RESULT_CAP = 6

function evaluate(current: BrainState): StepResult {
  const active = current.chips.filter((c) => c.state === 'active')
  const chipsBlock: Block = { kind: 'chips-update', chips: current.chips }

  if (active.length === 0) {
    const prompt: Block = {
      kind: 'quick-replies',
      prompt: 'What are you looking for?',
      options: [],
    }
    // `chipsBlock` goes out here too. The widget refreshes its row ONLY on a `chips-update`, so a
    // turn that left no chip active — every constraint negated, or nothing understood but
    // something disclosed — used to leave the row on screen showing the old chips as live filters
    // while the agent asked what the shopper wanted. The row was a lie for one turn, and tapping
    // it took two taps to undo.
    return { state: { ...current, state: 'clarify' }, blocks: [chipsBlock, prompt] }
  }

  // Cheapest first. The obstacle sentence has just quoted the closest price, so leading the list
  // with anything dearer reads as ignoring what was said one line earlier — and on the happy path
  // a shopper who named a budget is scanning by price anyway.
  const results = intersect(active, current.catalog).sort((a, b) => a.price - b.price)
  if (results.length > 0) {
    // Capped at RESULT_CAP [see comment above] — never silently: `converse.ts` `reply()` appends
    // the disclosure once it sees more cards were possible than were sent.
    const cards: Block[] = results.slice(0, RESULT_CAP).map((product) => ({
      kind: 'product-card',
      product,
      reason: reasonFor(active),
    }))
    return { state: { ...current, state: 'recommend' }, blocks: [chipsBlock, ...cards] }
  }

  const obstacle = findObstacle(active, current.catalog)
  if (!obstacle) {
    return { state: { ...current, state: 'obstacle' }, blocks: [chipsBlock] }
  }
  const noMatch: Block = {
    kind: 'no-match',
    blocking: obstacle.blocking,
    closest: obstacle.closest,
    alternatives: obstacle.alternatives,
  }
  return { state: { ...current, state: 'obstacle' }, blocks: [chipsBlock, noMatch] }
}

function setChipState(current: BrainState, id: string, next: Chip['state']): BrainState {
  return { ...current, chips: current.chips.map((c) => (c.id === id ? { ...c, state: next } : c)) }
}

/**
 * Pure reducer over `idle → intake → clarify → recommend → obstacle → resolve → act`. Dropping a
 * chip is one call and is undoable; the dropped chip stays in `chips` with `state: 'dropped'`,
 * never evicted — the chip row is both the brief and the receipt. [ENGINEERING §2.10]
 */
export function step(current: BrainState, action: Action): StepResult {
  switch (action.type) {
    case 'message': {
      // No branch and no fallback: the reading is the action. An empty reading is a real answer
      // (the shopper said "hi"), and `evaluate` already has the right response to it — the
      // merchant's clarify prompt, with the standing row re-sent so it cannot go stale.
      const merged = mergeChips(current.chips, action.chips, action.dropped)
      return evaluate({ ...current, state: 'intake', chips: merged })
    }
    case 'drop-chip': {
      const wasObstacle = current.state === 'obstacle'
      const result = evaluate(setChipState(current, action.id, 'dropped'))
      return wasObstacle && result.state.state === 'recommend'
        ? { ...result, state: { ...result.state, state: 'resolve' } }
        : result
    }
    case 'restore-chip': {
      return evaluate(setChipState(current, action.id, 'active'))
    }
    case 'select-product': {
      const product = current.catalog.find((p) => p.id === action.productId)
      if (!product) return { state: current, blocks: [] }
      const cta: Block = { kind: 'cta', label: product.title, href: product.url }
      return { state: { ...current, state: 'act' }, blocks: [cta] }
    }
    default: {
      const _exhaustive: never = action
      throw new Error(`unhandled action: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

// The brief's "changes their mind halfway through" moment, as one runnable check (universal DoD).
// Guarded by `import.meta.main`: this module is never the bundle's entry point, so the block is
// dead code in the shipped `agent.js`. Run it with `bun run packages/agent/src/brain/fsm.ts`.
//
// The readings below are written out by hand, exactly as `apps/platform/chat.ts` would return
// them. That is the point of the split: the FSM is now a pure reducer over a reading, so its
// behaviour is checkable with no model, no key and no network — the model's own accuracy is a
// separate question, measured against the real endpoint by `bench/checks/transcript.ts`.
if (import.meta.main) {
  let count = 0
  const check = (condition: boolean, message: string): void => {
    count++
    if (!condition) throw new Error(`fsm.ts self-check failed: ${message}`)
  }
  const coat = (id: string, price: number, tags: string[]): Product => ({
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
  const catalog = [coat('cheap', 195, ['jacket', 'navy']), coat('dear', 380, ['jacket', 'black'])]
  /** One turn's reading, in the shape `POST /v1/chat` puts on the wire. */
  const read = (
    tags: string[],
    maxPrice?: number,
    dropped: string[] = [],
  ): Extract<Action, { type: 'message' }> => ({
    type: 'message',
    chips: chipsFrom({ tags, maxPrice }),
    dropped: dropped.map((tag) => `chip-${tag}`),
  })
  const priceOf = (state: BrainState): number | undefined => {
    const chip = state.chips.find((c) => c.id === 'chip-price')
    return chip?.kind.type === 'price-max' ? chip.kind.max : undefined
  }
  const titles = (result: StepResult): string[] =>
    result.blocks.flatMap((b) => (b.kind === 'product-card' ? [b.product.title] : []))

  const opened = step(createBrain(catalog), read(['jacket'], 250))
  check(titles(opened).join(',') === 'cheap', `expected the cheap coat, got ${titles(opened)}`)

  // A second budget REPLACES the first — same chip, new ceiling, active again — and the answer
  // actually changes. Appending it would have left this identical to `opened`.
  const raised = step(opened.state, read([], 400))
  check(
    raised.state.chips.filter((c) => c.id === 'chip-price').length === 1,
    `price chip must stay a singleton, got ${JSON.stringify(raised.state.chips.map((c) => c.id))}`,
  )
  check(priceOf(raised.state) === 400, `expected a €400 ceiling, got ${priceOf(raised.state)}`)
  check(titles(raised).join(',') === 'cheap,dear', `expected both coats, got ${titles(raised)}`)

  const dropped = step(raised.state, { type: 'drop-chip', id: 'chip-price' })
  const respoken = step(dropped.state, read([], 200))
  check(
    respoken.state.chips.find((c) => c.id === 'chip-price')?.state === 'active',
    'naming a new budget must revive a dropped price chip, not leave it struck through',
  )

  // The graded mind-change: "actually forget black, I would rather have navy" reaches the FSM as
  // one reading — navy added, black retracted. The retracted chip is struck through, never
  // evicted. [§2.10]
  const black = step(createBrain(catalog), read(['black', 'jacket']))
  check(titles(black).join(',') === 'dear', `expected the black coat, got ${titles(black)}`)
  const navy = step(black.state, read(['navy'], undefined, ['black']))
  check(
    navy.state.chips.find((c) => c.id === 'chip-black')?.state === 'dropped',
    'the retracted chip must survive struck through, never evicted',
  )
  check(titles(navy).join(',') === 'cheap', `expected the navy coat, got ${titles(navy)}`)

  // The goal-shaped mind-change: retracting ONE alternative inside a standing any-of must shrink
  // it, not leave it whole. `dropped` only ever carries `chip-<tag>`, never the any-of's own
  // composite id, so a naive id match can never strike `chip-any-creatine-protein` at all — this
  // is the regression a correct-looking-but-wrong fix would still pass every check above.
  const goalCatalog = [coat('creatine-cap', 20, ['creatine']), coat('protein-tub', 25, ['protein'])]
  const goalOpened = step(createBrain(goalCatalog), {
    type: 'message',
    chips: chipsFrom({ tags: [], goal: ['creatine', 'protein'] }),
    dropped: [],
  })
  check(
    goalOpened.state.chips.some((c) => c.kind.type === 'any-of'),
    'a 2-attribute goal must open as one any-of chip',
  )
  check(
    titles(goalOpened).join(',') === 'creatine-cap,protein-tub',
    `expected both goal products, got ${titles(goalOpened)}`,
  )

  // "actually no creatine" — shrink-to-one collapses to the ordinary tag chip, any-of gone.
  const shrunk = step(goalOpened.state, { type: 'message', chips: [], dropped: ['chip-creatine'] })
  check(
    !shrunk.state.chips.some((c) => c.state === 'active' && c.kind.type === 'any-of'),
    'shrinking to one attribute must collapse the any-of, not leave it standing (anyOfExpected: false)',
  )
  const proteinChip = shrunk.state.chips.find((c) => c.id === 'chip-protein')
  check(
    proteinChip?.state === 'active' && proteinChip.kind.type === 'tag',
    'the surviving attribute must become an ordinary active tag chip',
  )
  check(
    titles(shrunk).join(',') === 'protein-tub',
    `expected only the surviving attribute's product, got ${titles(shrunk)}`,
  )

  // "actually forget the whole thing" — retracting EVERY remaining alternative in one turn
  // empties the any-of straight to 0 survivors, `shrinkAnyOf`'s `tag === undefined` branch,
  // never exercised above since `shrunk` only drops one of the two. The chip persists dropped,
  // same id and tags untouched: the receipt shows the whole goal that got rejected, not a
  // narrowed remainder.
  const emptied = step(goalOpened.state, {
    type: 'message',
    chips: [],
    dropped: ['chip-creatine', 'chip-protein'],
  })
  const emptiedGoal = emptied.state.chips.find((c) => c.kind.type === 'any-of')
  check(
    emptiedGoal?.state === 'dropped' && emptiedGoal.id === goalOpened.state.chips[0]?.id,
    'retracting every alternative in one turn must drop the any-of whole, same id, never evicted',
  )
  check(
    emptiedGoal?.kind.type === 'any-of' && emptiedGoal.kind.tags.join(',') === 'creatine,protein',
    'the dropped any-of must keep its full original tag list as the receipt, not an emptied one',
  )
  check(
    titles(emptied).length === 0,
    `expected no products with the goal fully retracted, got ${titles(emptied)}`,
  )

  // A 3+-attribute goal shrinks to a SMALLER any-of, not straight to a tag chip: `shrunk` and
  // `emptied` above only ever start from a 2-tag goal, so the `rest.length !== 0` branch inside
  // `shrinkAnyOf` — the one that mints a narrower composite id from 2+ survivors — has no coverage
  // without this. One retraction should leave the other two tags standing, still active, still
  // matching by ANY of them.
  const threeCatalog = [
    coat('creatine-cap', 20, ['creatine']),
    coat('protein-tub', 25, ['protein']),
    coat('iron-pill', 15, ['iron']),
  ]
  const threeOpened = step(createBrain(threeCatalog), {
    type: 'message',
    chips: chipsFrom({ tags: [], goal: ['creatine', 'iron', 'protein'] }),
    dropped: [],
  })
  const threeShrunk = step(threeOpened.state, {
    type: 'message',
    chips: [],
    dropped: ['chip-creatine'],
  })
  const narrowed = threeShrunk.state.chips.find((c) => c.kind.type === 'any-of')
  check(
    narrowed?.state === 'active' && narrowed.id === 'chip-any-iron-protein',
    `expected the narrower chip-any-iron-protein, got ${JSON.stringify(narrowed)}`,
  )
  check(
    narrowed?.kind.type === 'any-of' && narrowed.kind.tags.join(',') === 'iron,protein',
    'the narrowed any-of must keep exactly the two surviving tags',
  )
  check(
    titles(threeShrunk).join(',') === 'iron-pill,protein-tub',
    `expected both surviving-attribute products, got ${titles(threeShrunk)}`,
  )

  // Same-turn collision: one message can BOTH retract creatine AND name protein directly (exactly
  // kracht-muscle-goal-retract-creatine's shape) — the shrink mints `chip-protein` from the
  // standing any-of in the same step an incoming `chip-protein` also arrives. One row, one
  // `chip-protein`, and the incoming one wins (it carries a real merchant label; the shrunk
  // fallback only has the raw tag).
  const collided = step(goalOpened.state, {
    type: 'message',
    chips: chipsFrom({ tags: ['protein'] }, { 'chip.label.protein': 'Protein Powder' }),
    dropped: ['chip-creatine'],
  })
  const proteinChips = collided.state.chips.filter((c) => c.id === 'chip-protein')
  check(proteinChips.length === 1, `expected exactly one chip-protein, got ${proteinChips.length}`)
  check(
    proteinChips[0]?.label === 'Protein Powder',
    `expected the incoming chip to win the collision, got label ${proteinChips[0]?.label}`,
  )

  // A reading with nothing in it is a real turn, not an error: it re-sends the row and asks. The
  // row must go out even when it is empty, or the widget keeps painting a stale one.
  const nothing = step(createBrain(catalog), read([]))
  check(
    nothing.blocks.some((b) => b.kind === 'quick-replies'),
    'an empty reading must still ask the shopper something',
  )
  check(
    nothing.blocks.some((b) => b.kind === 'chips-update'),
    'every turn must re-send the chip row, so it can never show a stale brief',
  )

  // The cap [RESULT_CAP above]. One tag, RESULT_CAP+3 products so a regression to "no cap" and a
  // regression to "cap at the wrong number" both show up as a count mismatch, not just a bound.
  const bulkCatalog = Array.from({ length: RESULT_CAP + 3 }, (_, i) =>
    coat(`coat-${i}`, (i + 1) * 10, ['jacket']),
  )
  const bulk = step(createBrain(bulkCatalog), read(['jacket']))
  check(
    titles(bulk).length === RESULT_CAP,
    `expected exactly RESULT_CAP (${RESULT_CAP}) cards from ${bulkCatalog.length} matches, got ${titles(bulk).length}`,
  )
  // Cheapest first survives the cut: the visible cards are the CHEAPEST RESULT_CAP, not just any
  // RESULT_CAP of them — a cap that sliced after losing the sort would pass the count check above
  // and still ship the wrong products.
  const bulkPrices = bulk.blocks.flatMap((b) =>
    b.kind === 'product-card' ? [b.product.price] : [],
  )
  const cheapestPrices = bulkCatalog
    .map((p) => p.price)
    .sort((a, b) => a - b)
    .slice(0, RESULT_CAP)
  check(
    JSON.stringify(bulkPrices) === JSON.stringify(cheapestPrices),
    `expected the ${RESULT_CAP} cheapest prices ${JSON.stringify(cheapestPrices)}, got ${JSON.stringify(bulkPrices)}`,
  )

  check(count > 0, 'self-check made zero assertions')
  console.log(`fsm.ts self-check: ${count} assertions passed`)
}
