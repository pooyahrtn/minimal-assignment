import { renderBlock } from '../packages/agent/src/blocks'
import type { Block, ConfigResponse, Product } from '../packages/agent/src/types'
import { MxAgent, TAG } from '../packages/agent/src/widget'

/**
 * The H2 gallery: one widget, one brand, all seven message blocks, mounted for a camera.
 *
 * Browser code — `bun build`-ed to an IIFE by `bench/checks/divergence.ts` and injected into a
 * blank page. It deliberately does NOT go through `boot.ts`: no config fetch, no font `<link>`
 * injection, no `localStorage`. A HARD gate must not depend on Google Fonts resolving, and the
 * divergence it measures has to come from the token ramps rather than from whether a network was
 * available. `font-weight` (500 vs 800), the type scale, tracking, transform, spacing, radius and
 * elevation all still differ with no webfont loaded. [BENCHMARKS §1 H2]
 *
 * The fixtures are built from the brand's OWN catalog, so out-of-stock and missing-image are real
 * shipped products rather than something invented for a screenshot. [TASKS T5 DoD box 5]
 */

/**
 * The catalogs point at photographs served by the storefronts on :4001 and :4002. A HARD gate must
 * not need either of them running, so every product that HAS an image gets the same neutral
 * stand-in here. That is deliberate in both directions: the media frame is exercised and visible on
 * the contact sheet, and because both brands get the identical block, photography contributes
 * exactly nothing to the divergence number — which is right, since H2 measures the widget, not the
 * photo library. The product that genuinely has `image: null` still renders the merchant's own
 * "no photograph" copy, so the two states stay distinguishable by eye.
 */
const STAND_IN_IMAGE =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="8" height="8"%3E%3Crect width="8" height="8" fill="%23a8a29e"/%3E%3C/svg%3E'

/** 40 characters, no break opportunity anywhere in it. TASKS T5 DoD box 3 is about this string. */
const UNBREAKABLE = 'Rijksmuseumstraatverlichtingsproject1234'

declare global {
  interface Window {
    __MX_GALLERY__?: ConfigResponse
  }
}

function firstWith(catalog: Product[], match: (product: Product) => boolean): Product | undefined {
  return catalog.find(match)
}

/**
 * A product that exists nowhere in either catalog, carrying both stress cases at once: a title long
 * enough to wrap to three lines at 375px under either type ramp, and one unbreakable 40-character
 * word inside a spec value.
 */
function stressProduct(sample: Product): Product {
  return {
    id: 'gallery-stress',
    title: `Long title that has to wrap across three separate lines at 375 pixels ${UNBREAKABLE}`,
    url: sample.url,
    image: null,
    price: 1234.5,
    currency: sample.currency,
    inStock: true,
    specs: [
      { label: 'Reference', value: UNBREAKABLE },
      { label: 'Notes', value: 'A short one, so the grid has both extremes in the same table.' },
    ],
    tags: [],
  }
}

/** The union of every spec label across the products being compared, in first-seen order. */
function compareRows(products: Product[]): { label: string; values: string[] }[] {
  const labels: string[] = []
  for (const product of products) {
    for (const spec of product.specs) if (!labels.includes(spec.label)) labels.push(spec.label)
  }
  return labels.map((label) => ({
    label,
    values: products.map((product) => product.specs.find((s) => s.label === label)?.value ?? '—'),
  }))
}

function gallery(config: ConfigResponse): Block[] {
  const catalog = config.catalog
  const first = catalog[0]
  if (first === undefined) throw new Error('gallery: the config carries an empty catalog')

  const withStandIn = (product: Product): Product =>
    product.image === null ? product : { ...product, image: STAND_IN_IMAGE }
  const inStock = withStandIn(firstWith(catalog, (p) => p.inStock && p.image !== null) ?? first)
  const noImage = firstWith(catalog, (p) => p.image === null) ?? stressProduct(first)
  const soldOut = withStandIn(firstWith(catalog, (p) => !p.inStock) ?? first)
  const stress = stressProduct(first)
  const comparable = catalog.slice(0, 3).map(withStandIn)

  return [
    // Not the greeting — the widget already pushes that on construction. A shopper's own sentence,
    // carrying the unbreakable word so the plain bubble is stress-tested too.
    { kind: 'text', text: `Something for the office and the bike, ideally ${UNBREAKABLE}` },
    {
      kind: 'quick-replies',
      // Written the way `converse.ts` writes it — the merchant's string, never the FSM's literal.
      prompt: config.strings.clarify ?? 'clarify',
      options: [
        { id: 'a', label: 'Something for every day' },
        { id: 'b', label: UNBREAKABLE },
      ],
    },
    {
      kind: 'chips-update',
      chips: [
        { id: 'chip-1', label: 'under €30', state: 'active' },
        { id: 'chip-2', label: 'lactose-free', state: 'active' },
        { id: 'chip-3', label: UNBREAKABLE, state: 'active' },
        { id: 'chip-4', label: 'no sweeteners', state: 'dropped' },
      ],
    },
    { kind: 'product-card', product: inStock, reason: '' },
    { kind: 'product-card', product: noImage, reason: '' },
    { kind: 'product-card', product: soldOut, reason: '' },
    { kind: 'product-card', product: stress, reason: '' },
    { kind: 'product-compare', products: comparable, rows: compareRows(comparable) },
    {
      kind: 'no-match',
      blocking: { id: 'chip-1', label: 'under €30', state: 'active' },
      closest: catalog.slice(0, 3).map((product) => ({ product: withStandIn(product), gap: '' })),
      alternatives: [],
    },
    { kind: 'cta', label: first.title, href: first.url },
  ]
}

const config = window.__MX_GALLERY__
if (config === undefined) throw new Error('gallery: window.__MX_GALLERY__ was never set')

if (customElements.get(TAG) === undefined) customElements.define(TAG, MxAgent)
const agent = new MxAgent(config)
document.body.append(agent)

// Open the panel the way a shopper does, so the camera sees the real open state rather than a
// hand-set `hidden` attribute.
const launcher = agent.shadowRoot?.querySelector('.launcher')
if (launcher instanceof HTMLElement) launcher.click()

for (const block of gallery(config)) agent.push(block)

// The list autoscrolls on every push [widget.ts], which would put the camera at the bottom of the
// conversation. The viewport is tall enough to hold every block, so scrolling back to the top is
// what makes "all 7 blocks, screenshotted" true rather than "the last two".
const list = agent.shadowRoot?.querySelector('.messages')
if (list instanceof HTMLElement) list.scrollTop = 0

// `renderBlock` is imported so the bundle carries every renderer even if a future gallery stops
// pushing one of them — the point of this file is that all seven are exercised.
void renderBlock
Reflect.set(window, '__MX_GALLERY_READY__', true)
