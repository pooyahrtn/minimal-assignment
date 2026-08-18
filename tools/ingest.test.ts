import { describe, expect, test } from 'bun:test'
import { normalise, productUrlsFrom } from './ingest'

// Representative schema.org/Product JSON-LD, shaped exactly like what velde.render.ts and
// shop-kracht's [slug]/page.tsx actually emit — the two DIFFERENT spec schemas T8's ingest must
// normalise into one `{label,value}[]` shape. [ENGINEERING §2.5]
const veldeProductLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Dijk Chore Jacket',
  description: 'Cut close enough for the bike, plain enough for the office.',
  sku: 'DIJK-CHORE-JACKET',
  color: 'Black',
  category: 'outerwear',
  brand: { '@type': 'Brand', name: 'VELDE' },
  additionalProperty: [
    { '@type': 'PropertyValue', name: 'Material', value: '100% garment-dyed cotton twill, 11oz' },
    { '@type': 'PropertyValue', name: 'Fit', value: 'Boxy' },
    { '@type': 'PropertyValue', name: 'Made in', value: 'Portugal' },
    { '@type': 'PropertyValue', name: 'Care', value: 'Machine wash 30°.' },
  ],
  offers: {
    '@type': 'Offer',
    price: '245.00',
    priceCurrency: 'EUR',
    availability: 'https://schema.org/InStock',
  },
  image: 'http://localhost:4001/photos/outerwear-04.jpg',
}

const krachtProductLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'KRACHT Pure Whey Isolate 1 kg — Unflavoured',
  description: 'Isolate with nothing added.',
  sku: 'pure-whey-isolate-1kg',
  category: 'protein',
  brand: { '@type': 'Brand', name: 'KRACHT' },
  additionalProperty: [
    { '@type': 'PropertyValue', name: 'Protein per serving', value: '28 g' },
    { '@type': 'PropertyValue', name: 'Flavour', value: 'Unflavoured' },
    { '@type': 'PropertyValue', name: 'Size', value: '1 kg' },
    { '@type': 'PropertyValue', name: 'Servings', value: '33' },
    { '@type': 'PropertyValue', name: 'Diet', value: 'lactose-free, no sweeteners' },
  ],
  offers: {
    '@type': 'Offer',
    price: '49.00',
    priceCurrency: 'EUR',
    availability: 'https://schema.org/InStock',
  },
  image: [],
}

describe('ingest: normalise() — two spec schemas into one shape', () => {
  test('VELDE JSON-LD normalises specs to {label,value}[] and derives the jacket vocabulary', () => {
    const product = normalise(veldeProductLd, 'http://localhost:4001/products/dijk-chore-jacket')
    expect(product).not.toBeNull()
    expect(product?.id).toBe('dijk-chore-jacket')
    expect(product?.price).toBe(245)
    expect(product?.currency).toBe('EUR')
    expect(product?.inStock).toBe(true)
    expect(product?.specs).toEqual([
      { label: 'Material', value: '100% garment-dyed cotton twill, 11oz' },
      { label: 'Fit', value: 'Boxy' },
      { label: 'Made in', value: 'Portugal' },
      { label: 'Care', value: 'Machine wash 30°.' },
    ])
    // These are exactly the tags parse.ts's SYNONYMS map looks for — the load-bearing part.
    for (const tag of ['jacket', 'black', 'matte', 'office', 'bike']) {
      expect(product?.tags).toContain(tag)
    }
  })

  test('KRACHT JSON-LD normalises a differently-shaped spec set to the same {label,value}[] shape', () => {
    const product = normalise(
      krachtProductLd,
      'http://localhost:4002/product/pure-whey-isolate-1kg',
    )
    expect(product).not.toBeNull()
    expect(product?.id).toBe('pure-whey-isolate-1kg')
    expect(product?.price).toBe(49)
    expect(product?.image).toBeNull() // empty `image` array normalises to null, never a crash
    expect(product?.specs).toEqual([
      { label: 'Protein per serving', value: '28 g' },
      { label: 'Flavour', value: 'Unflavoured' },
      { label: 'Size', value: '1 kg' },
      { label: 'Servings', value: '33' },
      { label: 'Diet', value: 'lactose-free, no sweeteners' },
    ])
    for (const tag of ['protein-shake', 'no-sweeteners', 'lactose-free']) {
      expect(product?.tags).toContain(tag)
    }
  })

  test('a Product JSON-LD block with no offers cannot be normalised — returns null, never throws', () => {
    const { offers: _offers, ...withoutOffers } = veldeProductLd
    expect(normalise(withoutOffers, 'http://localhost:4001/products/x')).toBeNull()
  })
})

describe('ingest: productUrlsFrom() — sitemap -> product URLs', () => {
  test('keeps product pages, drops the homepage', () => {
    const sitemap = `<?xml version="1.0"?><urlset>
      <url><loc>http://localhost:4001/</loc></url>
      <url><loc>http://localhost:4001/products/dijk-chore-jacket</loc></url>
      <url><loc>http://localhost:4001/products/sluis-anorak</loc></url>
    </urlset>`
    const urls = productUrlsFrom(sitemap, 'http://localhost:4001/sitemap.xml')
    expect(urls).toEqual([
      'http://localhost:4001/products/dijk-chore-jacket',
      'http://localhost:4001/products/sluis-anorak',
    ])
  })
})
