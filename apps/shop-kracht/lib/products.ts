import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Category, Product } from './catalog'

// Server-side only, and resolved against this file rather than the working directory: the gates
// run from the repo root while `next dev` runs from the app directory. [ENGINEERING §3.2]
const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(appRoot, 'data')
const photoDir = join(appRoot, 'public', 'photos')

/** Our own committed catalogue file; `catalog.test.ts` is what keeps its shape honest. */
export const products: Product[] = JSON.parse(readFileSync(join(dataDir, 'products.json'), 'utf8'))

export function findProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug)
}

export function byCategory(category: Category): Product[] {
  return products.filter((p) => p.category === category)
}

/** The same product in other flavours — what the swatch row links to. */
export function flavourSiblings(product: Product): Product[] {
  return products.filter((p) => p.flavourLine === product.flavourLine)
}

/** The same product in other sizes, cheapest first. */
export function sizeSiblings(product: Product): Product[] {
  return products
    .filter((p) => p.line === product.line && p.flavourLine !== product.flavourLine)
    .sort((a, b) => a.price - b.price)
}

/**
 * Photography is delivered separately, so a filename in the catalogue is a claim, not a promise.
 * A packshot we do not have on disk renders as the same fallback tile as a product that has none.
 */
export function photoSrc(product: Product): string | null {
  if (product.image === null) return null
  return existsSync(join(photoDir, product.image)) ? `/photos/${product.image}` : null
}
