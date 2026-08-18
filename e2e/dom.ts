import type { Locator, Page } from '@playwright/test'

// Small selector-free assertion helpers shared by velde.spec.ts and kracht.spec.ts. Both
// storefronts render the same two deliberate messes (a struck sale price, a fixed sticky ATC bar)
// with different markup, so the *check* is shared even though the selectors passed in are not.

export type JsonLdProduct = {
  '@type': string
  offers: { price: string }
  additionalProperty: unknown[]
}

/** Same runtime-guard style as apps/shop-kracht/lib/cart-store.ts's `isLine` — no `as`, no `any`. */
function isJsonLdProduct(value: unknown): value is JsonLdProduct {
  if (typeof value !== 'object' || value === null) return false
  const offers = Reflect.get(value, 'offers')
  if (typeof offers !== 'object' || offers === null) return false
  return (
    Reflect.get(value, '@type') === 'Product' &&
    typeof Reflect.get(offers, 'price') === 'string' &&
    Array.isArray(Reflect.get(value, 'additionalProperty'))
  )
}

/** Reads the page's first JSON-LD block and parses it as a schema.org Product — the only
 *  sanctioned way in for T12 to reach data the DOM doesn't expose via role or text. */
export async function productJsonLd(page: Page): Promise<JsonLdProduct> {
  const raw = await page.locator('script[type="application/ld+json"]').first().textContent()
  if (raw === null) throw new Error('no JSON-LD script on the page')
  const parsed: unknown = JSON.parse(raw)
  if (!isJsonLdProduct(parsed)) throw new Error('JSON-LD did not parse as a schema.org Product')
  return parsed
}

/** text-decoration-line is not inherited, but a struck line painted on an ancestor still renders
 *  through a descendant's text — so the only correct check is to walk up and ask what actually
 *  gets painted, not just the exact element the text sits in. */
export function isStruckThrough(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    for (let node: Element | null = el; node !== null; node = node.parentElement) {
      if (getComputedStyle(node).textDecorationLine.includes('line-through')) return true
    }
    return false
  })
}

/** True when something else is painted on top of `locator`'s own centre point — the ground truth
 *  for "does a fixed element visually cover this one", which bounding-box comparison against the
 *  sticky bar can't give without selecting the bar itself by its Tailwind classes. Ancestor and
 *  descendant hits don't count as covering (a locator scoped inside the covering element, or one
 *  that wraps it, is not being obscured by it). */
export function isOccludedAtCenter(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const topmost = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return topmost !== null && !el.contains(topmost) && !topmost.contains(el)
  })
}

/** True when every <img> currently on the page finished loading with real pixels — the general
 *  form of "no broken image" on a page that may legitimately have other, unrelated photos on it
 *  (e.g. related-product cards next to a product that has none of its own). */
export async function noBrokenImages(page: Page): Promise<boolean> {
  const loaded = await page
    .locator('img')
    .evaluateAll((imgs) =>
      imgs.map((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0),
    )
  return loaded.every(Boolean)
}
