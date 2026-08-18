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
 * ponytail: five of the seven renderers still throw (T5 owns them), so a product/obstacle block is
 * flattened to `text` here using templates from the config payload. When T5 lands, `flatten` loses
 * those cases and the blocks go straight through — the FSM already emits the right ones.
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

function item(strings: Record<string, string>, product: Product): string {
  return fill(str(strings, 'recommend.item'), { title: product.title, price: money(product) })
}

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

function flatten(block: Block, state: BrainState, strings: Record<string, string>): Block[] {
  switch (block.kind) {
    case 'text':
    case 'chips-update':
      return [block]
    case 'quick-replies':
      return [text(str(strings, 'clarify'))]
    case 'product-card':
      return [text(item(strings, block.product))]
    case 'product-compare':
      return block.products.map((product) => text(item(strings, product)))
    case 'no-match':
      return [text(obstacleText(block, state, strings))]
    case 'cta':
      return [text(block.label)]
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
    out.push(...flatten(block, state, strings))
  }
  if (!out.some((b) => b.kind === 'text')) {
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
