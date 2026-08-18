export type CartLine = {
  slug: string
  name: string
  flavour: string
  price: number
  image: string | null
  qty: number
}

const KEY = 'kracht.cart.v1'
const EMPTY: CartLine[] = []

let lines: CartLine[] = EMPTY
let loaded = false
const listeners = new Set<() => void>()

function isLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false
  const shape = {
    slug: 'string',
    name: 'string',
    flavour: 'string',
    price: 'number',
    qty: 'number',
  }
  return Object.entries(shape).every(
    ([key, kind]) => key in value && typeof Reflect.get(value, key) === kind,
  )
}

function load(): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(parsed)) return EMPTY
    return parsed.filter(isLine).map((line) => ({ ...line, image: line.image ?? null }))
  } catch {
    return EMPTY
  }
}

function commit(next: CartLine[]): void {
  lines = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // A full or blocked storage quota is not a reason to lose the basket in this tab.
  }
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void): () => void {
  if (!loaded) {
    loaded = true
    lines = load()
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function snapshot(): CartLine[] {
  return lines
}

export function serverSnapshot(): CartLine[] {
  return EMPTY
}

export function addLine(line: Omit<CartLine, 'qty'>): void {
  const existing = lines.find((l) => l.slug === line.slug)
  commit(
    existing
      ? lines.map((l) => (l.slug === line.slug ? { ...l, qty: l.qty + 1 } : l))
      : [...lines, { ...line, qty: 1 }],
  )
}

export function setQty(slug: string, qty: number): void {
  commit(
    qty <= 0
      ? lines.filter((l) => l.slug !== slug)
      : lines.map((l) => (l.slug === slug ? { ...l, qty } : l)),
  )
}

export function totalItems(all: CartLine[]): number {
  return all.reduce((sum, line) => sum + line.qty, 0)
}

export function totalPrice(all: CartLine[]): number {
  return all.reduce((sum, line) => sum + line.qty * line.price, 0)
}
