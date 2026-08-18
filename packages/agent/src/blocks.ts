import { str } from './config'
import type { Block, Chip } from './types'

/**
 * One renderer per message block, closed with a `never` default so "every block type has a
 * renderer" is a compiler guarantee rather than a QA item. [ENGINEERING §2.6]
 *
 * T3 owns `text` and `chips-update`. The other five throw by name: an empty div would look like a
 * finished renderer that draws nothing, and the point of failing loudly is that T5's job reads as
 * a list of five throws to replace. [ENGINEERING §2.9]
 */
export function renderBlock(block: Block, strings: Record<string, string>): HTMLElement {
  switch (block.kind) {
    case 'text':
      return renderText(block.text, 'agent')
    case 'chips-update':
      return renderChips(block.chips, strings)
    case 'quick-replies':
    case 'product-card':
    case 'product-compare':
    case 'no-match':
    case 'cta':
      throw new Error(`maximal: renderer not built — T5 owns this: "${block.kind}"`)
    default: {
      const _exhaustive: never = block
      throw new Error(`maximal: unknown block ${JSON.stringify(_exhaustive)}`)
    }
  }
}

/** Shared by the agent's blocks and by the shopper's own composer echo — same bubble, same code. */
export function renderText(text: string, from: 'agent' | 'shopper'): HTMLElement {
  const element = document.createElement('p')
  element.className = 'msg'
  element.dataset.from = from
  element.textContent = text
  return element
}

/**
 * The standing brief. A dropped chip renders struck through and stays in the row as a button, so
 * one tap puts it back; an active chip is a plain span because there is nothing to press.
 */
export function renderChips(chips: Chip[], strings: Record<string, string>): HTMLElement {
  const row = document.createElement('div')
  row.className = 'chips'
  if (chips.length === 0) return row

  const legend = document.createElement('span')
  legend.className = 'chips-legend'
  legend.textContent = str(strings, 'chips.legend')
  row.append(legend)

  for (const chip of chips) {
    const element = document.createElement(chip.state === 'dropped' ? 'button' : 'span')
    element.className = 'chip'
    element.dataset.state = chip.state
    element.dataset.chipId = chip.id
    element.textContent = chip.label
    if (element instanceof HTMLButtonElement) {
      element.type = 'button'
      element.setAttribute(
        'aria-label',
        str(strings, 'chips.restore').replace('{label}', chip.label),
      )
    }
    row.append(element)
  }
  return row
}
