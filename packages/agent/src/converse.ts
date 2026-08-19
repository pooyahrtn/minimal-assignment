import type { Action, BrainState } from './brain/fsm'
import { createBrain, step } from './brain/fsm'
import { intersect } from './brain/retrieve'
import { isRecord, str } from './config'
import type { Block, ConfigResponse, Product } from './types'
import type { MxAgent } from './widget'

/**
 * The seam: shell events in, brain blocks out. The shell owns no conversation logic and the brain
 * owns no DOM, so this file is the only place that knows both exist.
 *
 * T5 landed, so every block now has a real renderer and passes straight through. Two things still
 * happen here, and both are the same rule: copy belongs to the merchant, not to the brain.
 *   - `quick-replies` carries a hardcoded English prompt built in `fsm.ts`. It is replaced with the
 *     merchant's own `clarify` string on the way past.
 *   - `no-match` is preceded by the obstacle SENTENCE, built from the merchant's template plus
 *     arithmetic [PRINCIPLES §8]. The card that follows shows the near misses; the sentence is what
 *     names the blocking constraint and quantifies it.
 */

/** Reads one string off a `CustomEvent.detail` without trusting its shape. No `as`. */
function detailString(event: Event, key: string): string | null {
  if (!(event instanceof CustomEvent)) return null
  const detail: unknown = event.detail
  if (!isRecord(detail)) return null
  const value = detail[key]
  return typeof value === 'string' ? value : null
}

function text(value: string): Block {
  return { kind: 'text', text: value }
}

/** `{placeholder}` interpolation. An unknown placeholder is left standing — visible in QA. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole)
}

/** The catalog's own currency, the browser's own formatting. No symbol is hardcoded here. */
function money(product: Product): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: product.currency,
    minimumFractionDigits: Number.isInteger(product.price) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(product.price)
}

// `recommend.item` is still in the payload and is no longer read: the product card renders title
// and price itself now. The key stays because an embed script pasted last month is a binary we
// cannot recall and may still be reading it — fields are added, never removed. [ENGINEERING §2.2]

/** Plural forms are copy, not code: the merchant owns both halves. */
function countPhrase(strings: Record<string, string>, n: number): string {
  return n === 1
    ? str(strings, 'obstacle.count.one')
    : fill(str(strings, 'obstacle.count.many'), { n: String(n) })
}

/**
 * PRINCIPLES §8: a template in the config payload plus arithmetic in the widget. `obstacle.ts`
 * computed WHICH constraint blocks and which products sit closest; the count of what would be
 * rescued is recomputed here from the live chip row, because the block only carries the three
 * nearest near-misses and "3 options fit" would be a lie on a set of seven.
 */
function obstacleText(
  block: Extract<Block, { kind: 'no-match' }>,
  state: BrainState,
  strings: Record<string, string>,
): string {
  const closest = block.closest[0]
  if (closest === undefined) return str(strings, 'no-results')
  const rescued = intersect(
    state.chips.filter((chip) => chip.id !== block.blocking.id),
    state.catalog,
  )
  return fill(str(strings, 'obstacle.text'), {
    blocking: block.blocking.label,
    options: countPhrase(strings, rescued.length),
    closest: money(closest.product),
  })
}

/**
 * The brain's blocks, with every string it built itself replaced by one the merchant owns. The
 * FSM is deliberately brand-blind, so the two literals it does produce — the clarify prompt and a
 * product card's `reason` — must not reach a shopper. `reason` is dropped by the renderer;
 * the prompt is swapped here, where the payload is in scope.
 */
function voice(block: Block, state: BrainState, strings: Record<string, string>): Block[] {
  switch (block.kind) {
    case 'text':
    case 'chips-update':
    case 'product-card':
    case 'product-compare':
    case 'cta':
      return [block]
    case 'quick-replies':
      return [{ ...block, prompt: str(strings, 'clarify') }]
    case 'no-match':
      return [text(obstacleText(block, state, strings)), block]
    default: {
      const _exhaustive: never = block
      throw new Error(`maximal: unknown block ${JSON.stringify(_exhaustive)}`)
    }
  }
}

/**
 * Never answer with silence. Exported so the graded turn is checkable without a DOM.
 * A turn that produced no sentence — no rescue exists, or the config
 * arrived from the built-in fallback with no catalog at all — says so in the merchant's own
 * words instead of leaving a spinner or a blank panel. [ENGINEERING §2.9]
 */
export function reply(
  blocks: Block[],
  state: BrainState,
  strings: Record<string, string>,
): Block[] {
  const out: Block[] = []
  for (const block of blocks) {
    // The lead-in goes once, above the first product line.
    if (block.kind === 'product-card' && !out.some((b) => b.kind === 'text')) {
      out.push(text(str(strings, 'recommend.lead')))
    }
    out.push(...voice(block, state, strings))
  }
  // The predicate is "the turn answered nothing", not "the turn produced no prose". Before T5 the
  // two were the same thing only because every block was flattened into text; testing for prose
  // now would staple "Nothing in the range does all of that" underneath every clarify prompt and
  // every CTA. A `chips-update` is the only block that is not an answer — it echoes the brief back
  // — so a turn that produced nothing else still owes the shopper a sentence. [ENGINEERING §2.9]
  const answered = out.some((block) => block.kind !== 'chips-update')
  if (!answered) {
    const key = state.catalog.length === 0 ? 'catalog.offline' : 'no-results'
    out.push(text(str(strings, key)))
  }
  return out
}

/** Wires one mounted widget to its own brain. Called by the loader, once, before mount. */
export function converse(agent: MxAgent, config: ConfigResponse): void {
  let brain = createBrain(config.catalog)

  const run = (action: Action): void => {
    const result = step(brain, action)
    brain = result.state
    for (const block of reply(result.blocks, brain, config.strings)) agent.push(block)
  }

  agent.addEventListener('mx-send', (event) => {
    const value = detailString(event, 'text')
    if (value !== null) run({ type: 'message', text: value })
  })
  agent.addEventListener('mx-chip-drop', (event) => {
    const id = detailString(event, 'id')
    if (id !== null) run({ type: 'drop-chip', id })
  })
  agent.addEventListener('mx-chip-restore', (event) => {
    const id = detailString(event, 'id')
    if (id !== null) run({ type: 'restore-chip', id })
  })
}
