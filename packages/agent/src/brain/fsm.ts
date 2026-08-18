import type { Block, Chip, Product } from '../types'
import { findObstacle } from './obstacle'
import type { ParsedChip } from './parse'
import { parseChips } from './parse'
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
  | { type: 'message'; text: string }
  | { type: 'drop-chip'; id: string }
  | { type: 'restore-chip'; id: string }
  | { type: 'select-product'; productId: string }

export type StepResult = { state: BrainState; blocks: Block[] }

export function createBrain(catalog: Product[]): BrainState {
  return { state: 'idle', chips: [], catalog }
}

/** New chips are appended; a chip already present (active OR dropped) is left untouched — a
 * dropped chip mentioned again does not silently resurrect. [ENGINEERING §2.10] */
function mergeChips(existing: ParsedChip[], incoming: ParsedChip[]): ParsedChip[] {
  const known = new Set(existing.map((c) => c.id))
  return [...existing, ...incoming.filter((c) => !known.has(c.id))]
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
    return { state: { ...current, state: 'clarify' }, blocks: [prompt] }
  }

  const results = intersect(active, current.catalog)
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
      const parsed = parseChips(action.text)
      const merged = mergeChips(current.chips, parsed)
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
