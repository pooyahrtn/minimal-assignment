export type Category = 'protein' | 'creatine' | 'pre-workout'

export type Product = {
  slug: string
  /** Product family name, e.g. "Whey Classic". */
  name: string
  /** The line a product belongs to — drives the "other sizes" links. */
  line: string
  flavour: string
  /** Products sharing this key are the same product in another flavour. */
  flavourLine: string
  category: Category
  size: string
  servings: number
  /** null for everything that is not a protein — creatine has no protein per serving. */
  proteinPerServing: string | null
  diet: string[]
  /** Consumer price, VAT included, the way a Dutch shop quotes it. */
  price: number
  compareAt: number | null
  bulk: { qty: number; price: number }[]
  /** Filename in assets/photos/kracht, or null where we simply have no packshot. */
  image: string | null
  rating: number
  reviews: number
  inStock: boolean
  short: string
  description: string
  usage: string
}

export const VAT_RATE = 0.21
export const FREE_SHIPPING_FROM = 50
export const REVIEW_SCORE = 9.6
export const REVIEW_COUNT = 4218

export const categories: { id: Category; label: string; blurb: string }[] = [
  { id: 'protein', label: 'Protein', blurb: 'Whey, isolate, vegan and casein' },
  { id: 'creatine', label: 'Creatine', blurb: 'Monohydrate, Creapure, capsules' },
  { id: 'pre-workout', label: 'Pre-workout', blurb: 'Stim, non-stim and single ingredients' },
]

export function excludingVat(price: number): number {
  return price / (1 + VAT_RATE)
}

export function euro(amount: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount)
}

export function decimal(value: number, digits = 1): string {
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function discountPercent(product: Product): number | null {
  if (product.compareAt === null || product.compareAt <= product.price) return null
  return Math.round((1 - product.price / product.compareAt) * 100)
}

export function pricePerServing(product: Product): string {
  return euro(product.price / product.servings)
}

/** Spec rows for the accordion and for the JSON-LD `additionalProperty` list. */
export function specs(product: Product): { label: string; value: string }[] {
  const rows = [
    { label: 'Flavour', value: product.flavour },
    { label: 'Size', value: product.size },
    { label: 'Servings', value: String(product.servings) },
  ]
  if (product.proteinPerServing !== null) {
    rows.splice(0, 0, { label: 'Protein per serving', value: product.proteinPerServing })
  }
  if (product.diet.length > 0) {
    rows.push({ label: 'Diet', value: product.diet.join(', ') })
  }
  return rows
}

export function photoAlt(product: Product): string {
  return `KRACHT ${product.name} ${product.size}, ${product.flavour.toLowerCase()}`
}
