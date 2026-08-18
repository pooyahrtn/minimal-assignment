import type { Product } from '../types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSpec(value: unknown): value is { label: string; value: string } {
  return isRecord(value) && typeof value.label === 'string' && typeof value.value === 'string'
}

function isProduct(value: unknown): value is Product {
  if (!isRecord(value)) return false
  const { id, title, url, image, price, currency, inStock, specs, tags } = value
  return (
    typeof id === 'string' &&
    typeof title === 'string' &&
    typeof url === 'string' &&
    (image === null || typeof image === 'string') &&
    typeof price === 'number' &&
    typeof currency === 'string' &&
    typeof inStock === 'boolean' &&
    Array.isArray(specs) &&
    specs.every(isSpec) &&
    Array.isArray(tags) &&
    tags.every((tag): tag is string => typeof tag === 'string')
  )
}

/**
 * Runtime guard that narrows `unknown` JSON to `Product[]`, throwing loudly on bad data instead
 * of letting a half-normalised product reach retrieval. No `as` anywhere. [ENGINEERING §1.4/§2.9]
 */
export function parseCatalog(data: unknown): Product[] {
  if (!Array.isArray(data)) {
    throw new Error(`catalog must be a JSON array, got ${typeof data}`)
  }
  return data.map((item, index) => {
    if (!isProduct(item)) {
      throw new Error(`catalog[${index}] is not a valid Product: ${JSON.stringify(item)}`)
    }
    return item
  })
}

/**
 * Loads a catalog from a path argument — never an inlined array, never a hardcoded path.
 * Swapping in a different catalog file is the only change needed to re-verify. No
 * `resolveJsonModule` in this repo's tsconfig, so this is a runtime read, never a JSON import.
 */
export async function loadCatalog(path: string): Promise<Product[]> {
  const data: unknown = await Bun.file(path).json()
  return parseCatalog(data)
}
