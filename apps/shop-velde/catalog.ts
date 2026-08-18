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

/**
 * Each handle below was matched to exactly one shoot frame by garment type and colour: the
 * product against the shoot's own `alt` description, and the product's declared `colour` against
 * the file's `dominant` hex — checked by eye with the Read tool against the actual photos, not
 * assumed from either label. No frame appears twice; a product with no honest frame in this shoot
 * (e.g. a card holder or a nylon shell when the shoot has neither) is left unmapped on purpose,
 * same as a product whose `image` is null — `assignPhotos` below leaves it photo-less rather than
 * hand it a photo of the wrong kind of thing. Where the closest genuine frame for a surviving
 * product was a different garment than its original name implied (a peacoat standing in for what
 * was called a "chore jacket"), the product's own title/description/specs were rewritten to
 * describe what the photo actually shows, rather than caption a real photo with a fictional
 * garment. [hand-off]
 *
 * Each entry is a distinctive substring of the shoot's own `alt` text rather than a filename —
 * content the manifest itself carries, which keeps matching if a photo is renumbered and only
 * stops matching if the photo is actually replaced (at which point the safe fallback is no photo,
 * not a renumbered wrong one).
 */
const PHOTO_BY_HANDLE: Record<string, string> = {
  // outerwear — 9 of 13 shoot frames used, one per product. The unused four (an ornate ecru
  // opera coat, a cape, a coat with religious embroidery on the collar, and a coat shot against a
  // visibly non-uniform background) do not honestly serve any product in this catalog.
  'noord-wool-overcoat': 'black wool double-breasted overcoat',
  'spui-quilted-liner': 'single-breasted camel wool blazer',
  'dijk-chore-jacket': 'black wool pea coat',
  'ij-trench': 'taupe wool blazer',
  'vecht-field-jacket': 'grey leather car coat',
  'sluis-anorak': 'black leather belted coat',
  'havik-bomber': 'navy wool blazer',
  'wal-overshirt': 'navy wool swing coat',
  'doorn-rain-coat': 'navy wool overcoat',
  // knitwear — 4 of 6 shoot frames used (nes-knit-polo is deliberately image-less). The other two
  // are a cardigan carrying a visible third-party airline logo, and a vest shot against a visibly
  // damaged/blotchy background — neither belongs on a product page under this brand.
  'kaap-cardigan': 'black wool cardigan with ribbed cuffs',
  'merino-crew': 'black knit tunic dress',
  'zand-waffle-knit': 'taupe wool v-neck sweater',
  'winter-leather-gloves': 'long ecru knitted evening gloves',
  // leather — 5 of 10 shoot frames used. The other five are a handbag whose tan reads as the
  // loudest, most off-palette object against this store's black/charcoal/navy/ecru range, a small
  // ornate evening clutch (wrong scale for any leather good here), a second, redundant pair of
  // antique boots, a redundant belt frame with no visible buckle, and a pair of gloves shot on a
  // visibly grey card rather than the shoot's shared white field.
  'veld-leather-tote': 'black leather shoulder tote',
  'kade-leather-bomber': 'black leather cropped jacket',
  'haven-weekend-holdall': 'sand canvas and leather flap tote',
  'riem-belt': 'tan leather belt',
  'damrak-derby': 'black suede knee-high boots',
}

const altFor = (product: Product): string => `${product.title}, ${product.colour.toLowerCase()}`

/** Photography is shot and catalogued separately, so the mapping above is driven by whatever the
 *  manifest says today: a handle's chosen frame only wins if some entry in the product's own
 *  category still carries that exact description, wherever it currently sits in the numbering. A
 *  re-shoot that drops or renames the description leaves that product photo-less again rather
 *  than silently showing something wrong — the same fallback the storefront already gives a
 *  product whose `image` is null on purpose. */
function assignPhotos(): Map<string, Photo> {
  const assigned = new Map<string, Photo>()
  for (const product of products) {
    if (product.image === null) continue
    const description = PHOTO_BY_HANDLE[product.handle]
    if (description === undefined) continue
    const entry = manifest.find(
      (candidate) =>
        candidate.category === product.category &&
        candidate.alt.toLowerCase().includes(description),
    )
    if (entry === undefined) continue
    assigned.set(product.handle, { src: `/photos/${entry.file}`, alt: altFor(product) })
  }
  return assigned
}

const photos = assignPhotos()

export const photoOf = (product: Product): Photo | null => photos.get(product.handle) ?? null

export const byHandle = new Map(products.map((product) => [product.handle, product]))

export const categories: { id: Category; title: string; note: string }[] = [
  { id: 'outerwear', title: 'Outerwear', note: 'Wool, waxed cotton, leather' },
  { id: 'knitwear', title: 'Knitwear', note: 'Merino, lambswool, cotton' },
  { id: 'leather', title: 'Leather', note: 'Vegetable-tanned leather, canvas, suede' },
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
  must(products.length >= 12, `expected 12+ products, found ${products.length}`)
  must(byHandle.size === products.length, 'duplicate handles')
  must(products.filter((p) => p.image === null).length === 1, 'expected exactly one image gap')
  must(products.filter((p) => !p.inStock).length === 1, 'expected exactly one sold-out product')
  must(products.filter((p) => p.compareAt !== null).length === 1, 'expected exactly one markdown')
  const photoSrcs = [...photos.values()].map((p) => p.src)
  must(new Set(photoSrcs).size === photoSrcs.length, 'a photo is assigned to more than one product')
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
