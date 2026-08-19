import type { Block, Chip, Product } from '../types'
import { findObstacle } from './obstacle'
import type { Intake, ParsedChip } from './parse'
import { parseIntake } from './parse'
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
   * `chips` is the model's reading of `text`, when there was one [TASKS T13]. It is a REPLACEMENT
   * for this turn's parse, not for the parser: `converse.ts` only ever supplies it after the
   * platform has verified the reading against the merchant's catalog, and falls back to `text`
   * alone on any doubt. Everything after this point — `mergeChips`, `evaluate`, `intersect`,
   * `findObstacle` — is the same code either way, so there is no second path for retrieval or the
   * obstacle to diverge down. Optional rather than a separate action type because `step` must
   * treat the two identically by construction; a second case is a second thing to keep in sync.
   */
  | { type: 'message'; text: string; chips?: ParsedChip[] }
  | { type: 'drop-chip'; id: string }
  | { type: 'restore-chip'; id: string }
  | { type: 'select-product'; productId: string }

export type StepResult = { state: BrainState; blocks: Block[] }

export function createBrain(catalog: Product[]): BrainState {
  return { state: 'idle', chips: [], catalog }
}

/**
 * New chips are appended; a chip already present (active OR dropped) is left untouched — a
 * dropped chip mentioned again does not silently resurrect. [ENGINEERING §2.10]
 *
 * Two constraints are not additive, and both are the shopper changing their mind mid-sentence:
 *
 * - A price ceiling is a SINGLETON. "actually, under €400" is a new budget, not a second one —
 *   ANDing it with the standing "under €250" would leave the answer identical and the shopper
 *   talking to a wall. The incoming chip replaces the standing one IN PLACE (same id, same row
 *   position) and comes back active even if the old ceiling had been dropped.
 * - A tag the turn NEGATED ("forget black") is struck through rather than removed, exactly as if
 *   the chip's own drop control had been tapped: the row stays the brief and the receipt.
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
    return dropped.includes(c.id) ? { ...c, state: 'dropped' as const } : c
  })
  return [...kept, ...incoming.filter((c) => !known.has(c.id))]
}

function reasonFor(chips: ParsedChip[]): string {
  return `Matches ${chips.map((c) => c.label).join(', ')}`
}

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
    const cards: Block[] = results.map((product) => ({
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
      // Length-checked, not `??`: an empty array is a reading that found nothing, and `[] ?? x`
      // is `[]`. Without this, a model turn that matched no constraint would suppress the
      // deterministic parser on the one input the parser handles perfectly — the LLM path would
      // be strictly worse than no LLM at all, which is the opposite of "degrade, never break".
      const intake: Intake =
        action.chips !== undefined && action.chips.length > 0
          ? { chips: action.chips, dropped: [], unsupported: [] }
          : parseIntake(action.text, current.catalog)
      const merged = mergeChips(current.chips, intake.chips, intake.dropped)
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
  const priceOf = (state: BrainState): number | undefined => {
    const chip = state.chips.find((c) => c.id === 'chip-price')
    return chip?.kind.type === 'price-max' ? chip.kind.max : undefined
  }
  const titles = (result: StepResult): string[] =>
    result.blocks.flatMap((b) => (b.kind === 'product-card' ? [b.product.title] : []))

  const opened = step(createBrain(catalog), { type: 'message', text: 'a jacket under €250' })
  check(titles(opened).join(',') === 'cheap', `expected the cheap coat, got ${titles(opened)}`)

  // A second budget REPLACES the first — same chip, new ceiling, active again — and the answer
  // actually changes. Appending it would have left this identical to `opened`.
  const raised = step(opened.state, { type: 'message', text: 'actually under €400' })
  check(
    raised.state.chips.filter((c) => c.id === 'chip-price').length === 1,
    `price chip must stay a singleton, got ${JSON.stringify(raised.state.chips.map((c) => c.id))}`,
  )
  check(priceOf(raised.state) === 400, `expected a €400 ceiling, got ${priceOf(raised.state)}`)
  check(titles(raised).join(',') === 'cheap,dear', `expected both coats, got ${titles(raised)}`)

  const dropped = step(raised.state, { type: 'drop-chip', id: 'chip-price' })
  const respoken = step(dropped.state, { type: 'message', text: 'under €200 then' })
  check(
    respoken.state.chips.find((c) => c.id === 'chip-price')?.state === 'active',
    'naming a new budget must revive a dropped price chip, not leave it struck through',
  )

  // Negation strikes the chip through instead of adding it, and never evicts it. [§2.10]
  const black = step(createBrain(catalog), { type: 'message', text: 'a black jacket' })
  check(titles(black).join(',') === 'dear', `expected the black coat, got ${titles(black)}`)
  const navy = step(black.state, {
    type: 'message',
    text: 'actually forget black, I would rather have navy',
  })
  check(
    navy.state.chips.find((c) => c.id === 'chip-black')?.state === 'dropped',
    'the negated chip must survive struck through, never evicted',
  )
  check(titles(navy).join(',') === 'cheap', `expected the navy coat, got ${titles(navy)}`)

  check(count > 0, 'self-check made zero assertions')
  console.log(`fsm.ts self-check: ${count} assertions passed`)
}
