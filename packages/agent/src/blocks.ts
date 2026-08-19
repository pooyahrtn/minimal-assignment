import { str } from './config'
import type { Block, Chip, Product } from './types'

/**
 * One renderer per message block, closed with a `never` default so "every block type has a
 * renderer" is a compiler guarantee rather than a QA item. [ENGINEERING §2.6]
 *
 * Every string a shopper reads comes from `strings` — the config payload — and every length,
 * colour and radius from a `--mx-*` custom property. Nothing here knows what a brand is, and
 * nothing here knows what an ingredient is: `specs` is `{label,value}[]`, so the same function
 * draws VELDE's "Material / Fit / Made in" and KRACHT's "Protein per serving / Flavour /
 * Servings" with no schema-specific code. [PRINCIPLES §6]
 */
export function renderBlock(block: Block, strings: Record<string, string>): HTMLElement {
  switch (block.kind) {
    case 'text':
      return renderText(block.text, 'agent')
    case 'chips-update':
      return renderChips(block.chips, strings)
    case 'quick-replies':
      return renderQuickReplies(block.prompt, block.options)
    case 'product-card':
      return renderProductCard(block.product, strings)
    case 'product-compare':
      return renderCompare(block.products, block.rows, strings)
    case 'no-match':
      return renderNoMatch(block.blocking, block.closest, strings)
    case 'cta':
      return renderCta(block.label, block.href)
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
 * The standing brief. Every chip is a one-tap toggle: an active chip drops, a dropped chip renders
 * struck through, stays in the row, and puts itself back. Nothing is ever evicted.
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
    // An unsupported chip is a SPAN, not a button, and that is the whole affordance argument: it
    // cannot be dropped or restored because it was never filtering, so giving it a control would
    // promise an action that does nothing. A span also keeps it out of the tab order, where a
    // keyboard user would otherwise land on a dead stop. [ENGINEERING §2.10]
    if (chip.state === 'unsupported') {
      const inert = document.createElement('span')
      inert.className = 'chip'
      inert.dataset.state = chip.state
      inert.dataset.chipId = chip.id
      inert.textContent = chip.label
      row.append(inert)
      continue
    }
    // Both remaining states are buttons: a chip is dropped by tapping it and restored by tapping
    // it again, so the affordance and the aria-label are the only things that differ.
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'chip'
    element.dataset.state = chip.state
    element.dataset.chipId = chip.id
    element.textContent = chip.label
    const action = chip.state === 'dropped' ? 'chips.restore' : 'chips.drop'
    element.setAttribute('aria-label', str(strings, action).replace('{label}', chip.label))
    row.append(element)
  }
  return row
}

// -----------------------------------------------------------------------------------------------
// Shared primitives. Every renderer below builds out of these, which is what keeps five block
// types from growing five slightly different cards. [ENGINEERING §2.11]
// -----------------------------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  return node
}

/**
 * `{placeholder}` interpolation. An unknown placeholder is left standing — visible in QA.
 * Exported because `converse.ts` fills the obstacle template with it: one transformation, one
 * place [ENGINEERING §2.4], and one copy in a bundle H6 caps.
 */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole)
}

/**
 * The catalog's own currency, the browser's own formatting — no symbol and no decimal separator is
 * authored anywhere. Shared with the obstacle sentence in `converse.ts`.
 */
export function money(product: Product): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: product.currency,
    minimumFractionDigits: Number.isInteger(product.price) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(product.price)
}

/**
 * A small tracked-uppercase-or-sentence-case label. This element is where `labelCase` becomes
 * visible in every block that has a label — it reads `--mx-label-transform` and
 * `--mx-label-tracking`, the two custom properties `labelCase` resolves into. The `text` block
 * has no label surface and deliberately does not get one: uppercasing conversational prose would
 * be wrong. [see hand-off — TASKS T5 DoD box 4 says "all 7", which is not satisfiable for `text`]
 */
function label(text: string): HTMLElement {
  const node = el('span', 'label')
  node.textContent = text
  return node
}

/**
 * The product image, or the deliberate absence of one. `image` is `null` rather than optional
 * precisely so this branch cannot be forgotten [types.ts], and 9 of the 55 shipped products take
 * it — a placeholder that says so in the merchant's words beats a broken-image glyph.
 */
function media(product: Product, strings: Record<string, string>): HTMLElement {
  const frame = el('div', 'media')
  if (product.image === null) {
    const empty = el('span', 'media-empty')
    empty.textContent = str(strings, 'card.noimage')
    frame.append(empty)
    return frame
  }
  const image = el('img', 'media-image')
  image.src = product.image
  image.alt = ''
  image.loading = 'lazy'
  // The merchant's own asset path. If it 404s we fall back to the same placeholder rather than
  // leaving a torn image on their storefront.
  image.addEventListener(
    'error',
    () => {
      const empty = el('span', 'media-empty')
      empty.textContent = str(strings, 'card.noimage')
      image.replaceWith(empty)
    },
    { once: true },
  )
  frame.append(image)
  return frame
}

/** The price line. Out of stock is stated in words, not signalled by a colour alone. */
function priceLine(product: Product, strings: Record<string, string>): HTMLElement {
  const line = el('div', 'price-line')
  const price = el('span', 'price')
  price.textContent = money(product)
  line.append(price)
  if (!product.inStock) {
    const flag = el('span', 'stock')
    flag.textContent = str(strings, 'card.outofstock')
    line.append(flag)
  }
  return line
}

/**
 * `{label,value}` rows, straight off the product. The renderer never reads a spec's NAME, which is
 * the whole claim: two catalogs with different schemas, one card. [TASKS T5 DoD box 1]
 */
function specList(product: Product, strings: Record<string, string>): HTMLElement {
  const wrap = el('div', 'specs')
  wrap.append(label(str(strings, 'card.specs')))
  const list = el('dl', 'spec-rows')
  for (const spec of product.specs) {
    const term = el('dt', 'spec-label')
    term.textContent = spec.label
    const value = el('dd', 'spec-value')
    value.textContent = spec.value
    list.append(term, value)
  }
  wrap.append(list)
  return wrap
}

/** The one anchor shape in the widget. `rel` is set because it leaves our shadow root. */
function link(text: string, href: string, className: string): HTMLAnchorElement {
  const anchor = el('a', className)
  anchor.href = href
  anchor.textContent = text
  anchor.rel = 'noopener'
  return anchor
}

// -----------------------------------------------------------------------------------------------
// The five blocks T5 owns.
// -----------------------------------------------------------------------------------------------

/**
 * `prompt` is written by `converse.ts` from the merchant's `clarify` string before it reaches
 * here — the FSM's own prompt is a hardcoded English literal that must never reach a shopper.
 * `options` is empty on every path the FSM currently produces, so the empty case is the live one
 * and has to read as a prompt rather than as an empty row.
 */
function renderQuickReplies(prompt: string, options: { id: string; label: string }[]): HTMLElement {
  const wrap = el('div', 'quick')
  wrap.append(renderText(prompt, 'agent'))
  if (options.length === 0) return wrap
  const row = el('div', 'quick-options')
  for (const option of options) {
    const button = el('button', 'quick-option')
    button.type = 'button'
    button.dataset.replyText = option.label
    button.textContent = option.label
    row.append(button)
  }
  wrap.append(row)
  return wrap
}

/**
 * The recommendation. `reason` is deliberately NOT rendered: `fsm.ts`'s `reasonFor()` builds it as
 * a hardcoded English sentence inside the brain, so putting it on the card would ship identical
 * un-branded copy to both merchants and repeat the `recommend.lead` line directly above it.
 */
function renderProductCard(product: Product, strings: Record<string, string>): HTMLElement {
  const card = el('article', 'card')
  if (!product.inStock) card.dataset.stock = 'out'
  card.append(media(product, strings))

  const body = el('div', 'card-body')
  const title = el('h3', 'card-title')
  title.textContent = product.title
  body.append(title, priceLine(product, strings))
  if (product.specs.length > 0) body.append(specList(product, strings))
  body.append(link(str(strings, 'card.view'), product.url, 'card-link'))
  card.append(body)
  return card
}

/**
 * Products as columns, `rows` as rows. The table scrolls horizontally inside its own container
 * rather than widening the panel — at 375px three columns cannot fit, and clipping them would be
 * worse than letting the shopper swipe.
 */
function renderCompare(
  products: Product[],
  rows: { label: string; values: string[] }[],
  strings: Record<string, string>,
): HTMLElement {
  const wrap = el('section', 'compare')
  wrap.append(label(str(strings, 'compare.heading')))

  const scroller = el('div', 'compare-scroll')
  const table = el('table', 'compare-table')
  const head = el('tr', 'compare-head')
  head.append(el('th', 'compare-corner'))
  for (const product of products) {
    const cell = el('th', 'compare-product')
    cell.scope = 'col'
    cell.textContent = product.title
    head.append(cell)
  }
  table.append(head)

  for (const row of rows) {
    const tr = el('tr', 'compare-row')
    const key = el('th', 'compare-key')
    key.scope = 'row'
    key.append(label(row.label))
    tr.append(key)
    // One cell per product, always — a row with fewer values than columns must still line up, so
    // a missing value is an empty cell rather than a shifted table.
    for (let index = 0; index < products.length; index++) {
      const cell = el('td', 'compare-value')
      cell.textContent = row.values[index] ?? ''
      tr.append(cell)
    }
    table.append(tr)
  }
  scroller.append(table)
  wrap.append(scroller)
  return wrap
}

/**
 * The designed dead end. The obstacle SENTENCE — which names the blocking constraint and quantifies
 * what dropping it buys — is a separate `text` block written from the merchant's own template one
 * line above this [PRINCIPLES §8]. This card is what makes the trade-off concrete: the near misses
 * the shopper is being kept away from, priced, and a single control that acts on the sentence.
 *
 * `gap` is not rendered. `obstacle.ts` builds it with a hardcoded `€` and English word order; the
 * price here goes through `money()` and the catalog's own currency instead.
 *
 * The action carries `data-drop-chip`, not `class="chip"`: the chip row is the one place chips
 * live [ENGINEERING §2.10], and a second chip surface inside the scrollback would leave a stale,
 * re-tappable receipt behind every time the row was redrawn.
 */
function renderNoMatch(
  blocking: Chip,
  closest: { product: Product; gap: string }[],
  strings: Record<string, string>,
): HTMLElement {
  const card = el('section', 'nomatch')
  card.append(label(fill(str(strings, 'nomatch.heading'), { blocking: blocking.label })))

  const list = el('ul', 'nomatch-list')
  for (const entry of closest) {
    const item = el('li', 'nomatch-item')
    const title = el('span', 'nomatch-title')
    title.textContent = entry.product.title
    const price = el('span', 'nomatch-price')
    price.textContent = money(entry.product)
    item.append(title, price)
    list.append(item)
  }
  card.append(list)

  const action = el('button', 'nomatch-drop')
  action.type = 'button'
  action.dataset.dropChip = blocking.id
  action.textContent = fill(str(strings, 'nomatch.drop'), { blocking: blocking.label })
  card.append(action)
  return card
}

/** The act state: one anchor, styled as the primary action rather than as body copy. */
function renderCta(text: string, href: string): HTMLElement {
  const wrap = el('div', 'cta')
  wrap.append(link(text, href, 'cta-link'))
  return wrap
}
