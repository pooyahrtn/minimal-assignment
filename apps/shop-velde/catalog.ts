export type Category = 'outerwear' | 'knitwear' | 'leather'

export type Product = {
  handle: string
  title: string
  category: Category
  colour: string
  price: number
  compareAt: number | null
  image: string | null
  inStock: boolean
  rating: { value: number; count: number } | null
  description: string
  specs: { material: string; fit: string; madeIn: string; care: string }
}

export type Photo = { src: string; alt: string }

type PhotoManifestEntry = { file: string; alt: string; category: string; dominant: string }

const shopDir = import.meta.dir
export const photoDir = `${shopDir}/../../assets/photos/velde`

export const products: Product[] = await Bun.file(`${shopDir}/products.json`).json()

const manifestFile = Bun.file(`${photoDir}/manifest.json`)

/** The shoot's own index is authoritative. Without it, fall back to the naming the photographer
 *  files under — `<category>-NN.jpg` — so a missing index degrades the alt text, not the page. */
async function readManifest(): Promise<PhotoManifestEntry[]> {
  if (await manifestFile.exists()) return manifestFile.json()
  const names = await Array.fromAsync(new Bun.Glob('*-*.jpg').scan({ cwd: photoDir }))
  return names.sort().map((file) => {
    const category = file.split('-')[0] ?? ''
    return { file, alt: `Velde ${category}, studio photograph`, category, dominant: '#f2f0ec' }
  })
}

const manifest: PhotoManifestEntry[] = await readManifest()

/** Photography is shot and catalogued separately; products claim a slot in their category's
 *  reel rather than a filename, so a re-shoot never has to touch the catalog. A product whose
 *  `image` is null has no photograph on purpose and never gets one. */
function assignPhotos(): Map<string, Photo> {
  const pools = new Map<string, PhotoManifestEntry[]>()
  for (const entry of manifest) {
    const pool = pools.get(entry.category) ?? []
    pool.push(entry)
    pools.set(entry.category, pool)
  }
  const taken = new Map<string, number>()
  const assigned = new Map<string, Photo>()
  for (const product of products) {
    const pool = pools.get(product.category) ?? []
    if (product.image === null || pool.length === 0) continue
    const next = taken.get(product.category) ?? 0
    taken.set(product.category, next + 1)
    const entry = pool[next % pool.length]
    if (entry) assigned.set(product.handle, { src: `/photos/${entry.file}`, alt: entry.alt })
  }
  return assigned
}

const photos = assignPhotos()

export const photoOf = (product: Product): Photo | null => photos.get(product.handle) ?? null

export const byHandle = new Map(products.map((product) => [product.handle, product]))

export const categories: { id: Category; title: string; note: string }[] = [
  { id: 'outerwear', title: 'Outerwear', note: 'Waxed cotton, wool, shell' },
  { id: 'knitwear', title: 'Knitwear', note: 'Merino, lambswool, linen' },
  { id: 'leather', title: 'Leather', note: 'Vegetable-tanned, unlined' },
]

export const inCategory = (id: Category): Product[] =>
  products.filter((product) => product.category === id)

export const euro = (cents: number): string =>
  `€${(cents / 100).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const amount = (cents: number): string => (cents / 100).toFixed(2)

/** Startup self-check. The catalog is the whole shop; a truncated or reshaped JSON file must
 *  stop the server rather than quietly render half a store. Prints the count it checked. */
export function checkCatalog(): string {
  const problems: string[] = []
  const must = (ok: boolean, message: string) => {
    if (!ok) problems.push(message)
  }
  must(products.length >= 30, `expected 30+ products, found ${products.length}`)
  must(byHandle.size === products.length, 'duplicate handles')
  must(products.filter((p) => p.image === null).length === 1, 'expected exactly one image gap')
  must(products.filter((p) => !p.inStock).length === 1, 'expected exactly one sold-out product')
  must(products.filter((p) => p.compareAt !== null).length === 1, 'expected exactly one markdown')
  for (const p of products) {
    must(p.price > 0 && Number.isInteger(p.price), `${p.handle}: price must be whole cents`)
    must(p.compareAt === null || p.compareAt > p.price, `${p.handle}: markdown is not a markdown`)
    must(
      Object.values(p.specs).every((v) => v.length > 0),
      `${p.handle}: incomplete specs`,
    )
    must(inCategory(p.category).length > 0, `${p.handle}: unknown category`)
  }
  if (problems.length > 0) throw new Error(`catalog: ${problems.join('; ')}`)
  return `catalog ok — ${products.length} products, ${photos.size} photographed`
}
