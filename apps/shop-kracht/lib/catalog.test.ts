import { expect, test } from 'bun:test'
import { discountPercent, euro, excludingVat, specs } from './catalog'
import { flavourSiblings, photoSrc, products } from './products'

/**
 * The catalogue is a hand-written JSON file loaded without a schema, so this is what keeps it
 * honest: shape, the four deliberate messy cases, and the money maths behind the BTW toggle.
 */
test('catalogue is complete and well formed', () => {
  expect(products.length).toBe(34)
  expect(new Set(products.map((p) => p.slug)).size).toBe(products.length)

  for (const product of products) {
    expect(product.slug).toMatch(/^[a-z0-9-]+$/)
    expect(product.price).toBeGreaterThan(0)
    expect(product.servings).toBeGreaterThan(0)
    expect(product.description.length).toBeGreaterThan(80)
    expect(['protein', 'creatine', 'pre-workout']).toContain(product.category)
    expect(specs(product).length).toBeGreaterThanOrEqual(3)
    for (const tag of product.diet) {
      expect(['vegan', 'lactose-free', 'no sweeteners', 'halal']).toContain(tag)
    }
  }
})

test('the deliberate mess is present', () => {
  expect(products.filter((p) => !p.inStock).length).toBeGreaterThanOrEqual(1)
  expect(products.filter((p) => p.compareAt !== null).length).toBeGreaterThanOrEqual(1)
  expect(products.some((p) => p.rating === 4.3 && p.reviews === 11)).toBe(true)

  // The unflavoured singles ship in a plain tub and get a label tile by design; exactly one
  // flavoured product is genuinely un-photographed, and that is the case the PDP apologises for.
  const unphotographed = products.filter((p) => p.image === null)
  expect(unphotographed.filter((p) => p.flavour !== 'Unflavoured').length).toBe(1)
})

test('every packshot a product claims is actually on disk', () => {
  const claimed = products.filter((p) => p.image !== null)
  expect(claimed.length).toBeGreaterThan(20)
  for (const product of claimed) {
    expect(photoSrc(product)).not.toBeNull()
  }
})

test('flavour variants point at each other', () => {
  const whey = products.find((p) => p.slug === 'whey-classic-1kg-chocolate')
  expect(whey).toBeDefined()
  if (whey === undefined) return
  expect(flavourSiblings(whey).length).toBe(4)
})

test('VAT comes back off the consumer price', () => {
  expect(excludingVat(121)).toBeCloseTo(100, 10)
  expect(euro(29.95)).toContain('29,95')
})

test('a discount is only a discount when it is one', () => {
  const sale = products.find((p) => p.slug === 'creatine-gummies-90')
  expect(sale).toBeDefined()
  if (sale === undefined) return
  expect(discountPercent(sale)).toBe(27)
  expect(discountPercent({ ...sale, compareAt: sale.price })).toBeNull()
})
