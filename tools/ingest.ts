/**
 * Build-time catalog ingest. sitemap.xml -> product URLs -> fetch each -> parse the
 * schema.org/Product JSON-LD a crawler would see -> normalised `Product[]` -> committed JSON
 * snapshot. [PRINCIPLES §6, ENGINEERING §2.5]
 *
 * Public JSON-LD only: no importing a storefront's own product data module, no reaching into
 * `apps/` for anything but an HTTP fetch. This is the same path a real merchant's site would
 * give us, so the same script also runs, unmodified, against a webshop we did not build.
 *
 * Usage: bun tools/ingest.ts <sitemapUrl> [outFile]
 *   - prints the normalised product count (and each title) to stdout always
 *   - writes the JSON snapshot to outFile when given
 */
import { parseCatalog } from '../packages/agent/src/brain/catalog'
import type { Product } from '../packages/agent/src/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Extracts every `<script type="application/ld+json">` block's parsed JSON from a page. */
function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = []
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(pattern)) {
    const raw = match[1]
    if (!raw) continue
    try {
      blocks.push(JSON.parse(raw))
    } catch {
      // A malformed block on a real site is not our problem to fix — skip it.
    }
  }
  return blocks
}

/** The one block, if any, that is actually a schema.org/Product. */
function findProductLd(blocks: unknown[]): Record<string, unknown> | null {
  for (const block of blocks) {
    if (isRecord(block) && block['@type'] === 'Product') return block
  }
  return null
}

function readOffers(
  raw: Record<string, unknown>,
): { price: number; currency: string; inStock: boolean } | null {
  const offers = raw.offers
  if (!isRecord(offers)) return null
  const price = Number(offers.price)
  if (!Number.isFinite(price)) return null
  const currency = typeof offers.priceCurrency === 'string' ? offers.priceCurrency : 'EUR'
  const inStock = offers.availability === 'https://schema.org/InStock'
  return { price, currency, inStock }
}

function readSpecs(raw: Record<string, unknown>): { label: string; value: string }[] {
  const list = raw.additionalProperty
  if (!Array.isArray(list)) return []
  const specs: { label: string; value: string }[] = []
  for (const entry of list) {
    if (!isRecord(entry)) continue
    const { name, value } = entry
    if (typeof name === 'string' && typeof value === 'string') specs.push({ label: name, value })
  }
  return specs
}

/** `image` is a bare string on one shop and an array on the other — normalise to the first, or null. */
function readImage(raw: Record<string, unknown>): string | null {
  const image = raw.image
  if (typeof image === 'string') return image
  if (Array.isArray(image) && typeof image[0] === 'string') return image[0]
  return null
}

function specValue(specs: { label: string; value: string }[], label: string): string | null {
  return specs.find((s) => s.label.toLowerCase() === label.toLowerCase())?.value ?? null
}

/** Fabric/finish words that read as having visible sheen — the rest defaults to matte. Invented
 * heuristic, see hand-off: no site publishes a "shine" field, so this is read off the material
 * and description text a crawler already has. */
const GLOSSY_PATTERN = /nylon|shell|membrane|gabardine|pu coating|patent/i
const OFFICE_PATTERN = /\boffice\b|\bdesk\b|smart casual|workwear|tailored/i
const BIKE_PATTERN = /\bbike\b|\bcycl(?:e|ing)\b|\bcommut(?:e|ing)?\b|\bride\b/i

/** VELDE ships material/fit/madeIn/care specs; tags are read off category, colour, and the
 * material/description text a crawler already has — no field on the page says "office" or "bike"
 * outright, so this is keyword matching against real copy, not an invented signal. */
function veldeTags(
  raw: Record<string, unknown>,
  specs: { label: string; value: string }[],
): string[] {
  const tags = new Set<string>()
  const category = typeof raw.category === 'string' ? raw.category : ''
  const colour = typeof raw.color === 'string' ? raw.color : ''
  const description = typeof raw.description === 'string' ? raw.description : ''
  const material = specValue(specs, 'material') ?? ''
  if (category === 'outerwear') tags.add('jacket')
  if (colour.toLowerCase() === 'black') tags.add('black')
  if (!GLOSSY_PATTERN.test(material) && !GLOSSY_PATTERN.test(description)) tags.add('matte')
  if (OFFICE_PATTERN.test(description)) tags.add('office')
  if (BIKE_PATTERN.test(description)) tags.add('bike')
  if (category) tags.add(category)
  if (colour) tags.add(colour.toLowerCase())
  return [...tags]
}

/** KRACHT ships protein/flavour/size/servings/diet specs; `category` and the `Diet` spec are
 * already structured, so tags are a direct read, not a keyword guess. */
function krachtTags(
  raw: Record<string, unknown>,
  specs: { label: string; value: string }[],
): string[] {
  const tags = new Set<string>()
  const category = typeof raw.category === 'string' ? raw.category : ''
  if (category === 'protein') tags.add('protein-shake')
  if (category) tags.add(category)
  const diet = specValue(specs, 'diet')
  if (diet) {
    for (const entry of diet.split(',')) {
      const tag = entry.trim().toLowerCase().replace(/\s+/g, '-')
      if (tag) tags.add(tag)
    }
  }
  return [...tags]
}

function brandOf(raw: Record<string, unknown>): string | null {
  const brand = raw.brand
  if (isRecord(brand) && typeof brand.name === 'string') return brand.name
  return null
}

function idFromUrl(url: string): string {
  const path = new URL(url).pathname.replace(/\/+$/, '')
  return path.split('/').pop() ?? url
}

/** Normalises one product page's JSON-LD into the closed `Product` contract. Both shops already
 * emit `additionalProperty` as `{name,value}` pairs — the "different spec schema" is which
 * labels show up, not a different shape, so this is one function, not two. Only the tag
 * derivation is brand-specific, because tags encode brand-specific vocabulary on purpose
 * [PRINCIPLES §6 — "structured attributes derived at ingest"]. */
export function normalise(raw: Record<string, unknown>, url: string): Product | null {
  const name = raw.name
  if (typeof name !== 'string') return null
  const offers = readOffers(raw)
  if (!offers) return null
  const specs = readSpecs(raw)
  const brand = brandOf(raw)
  const tags = brand === 'KRACHT' ? krachtTags(raw, specs) : veldeTags(raw, specs)
  return {
    id: idFromUrl(url),
    title: name,
    url,
    image: readImage(raw),
    price: offers.price,
    currency: offers.currency,
    inStock: offers.inStock,
    specs,
    tags,
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`)
  return response.text()
}

export function productUrlsFrom(sitemapXml: string, sitemapUrl: string): string[] {
  const origin = new URL(sitemapUrl).origin
  const urls: string[] = []
  for (const match of sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const loc = match[1]
    if (!loc) continue
    const path = new URL(loc, origin).pathname
    // The homepage and any collection/info page carry no Product JSON-LD — skip by path shape
    // rather than a brand-specific prefix, so this keeps working against a store we did not build.
    if (path === '/' || path === '') continue
    urls.push(loc)
  }
  return urls
}

async function ingest(sitemapUrl: string): Promise<Product[]> {
  const sitemapXml = await fetchText(sitemapUrl)
  const urls = productUrlsFrom(sitemapXml, sitemapUrl)
  const products: Product[] = []
  for (const url of urls) {
    let html: string
    try {
      html = await fetchText(url)
    } catch (error) {
      console.error(`skip ${url}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    const productLd = findProductLd(extractJsonLdBlocks(html))
    if (!productLd) {
      console.error(`skip ${url}: no schema.org/Product JSON-LD`)
      continue
    }
    const product = normalise(productLd, url)
    if (!product) {
      console.error(`skip ${url}: Product JSON-LD missing name/offers`)
      continue
    }
    products.push(product)
  }
  // Round-trips through the same runtime guard everything else reads a catalog through, so a
  // normalisation bug fails the ingest instead of shipping a half-normalised product downstream.
  return parseCatalog(products)
}

async function main(): Promise<void> {
  const [sitemapUrl, outFile] = process.argv.slice(2)
  if (!sitemapUrl) {
    console.error('usage: bun tools/ingest.ts <sitemapUrl> [outFile]')
    process.exit(1)
  }
  const products = await ingest(sitemapUrl)
  if (products.length === 0) {
    console.error(`ingested 0 products from ${sitemapUrl} — that is a failure, not a pass`)
    process.exit(1)
  }
  console.log(`ingested ${products.length} products from ${sitemapUrl}`)
  for (const product of products) {
    console.log(`  ${product.id} — €${product.price.toFixed(2)} — [${product.tags.join(', ')}]`)
  }
  if (outFile) {
    await Bun.write(outFile, `${JSON.stringify(products, null, 2)}\n`)
    console.log(`wrote ${outFile}`)
  }
}

if (import.meta.main) {
  await main()
}
