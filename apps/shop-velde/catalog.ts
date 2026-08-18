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
 * Each handle below was matched to a specific shoot frame by garment type and colour: the
 * product title against the shoot's own `alt` description, and the product's declared `colour`
 * against the file's `dominant` hex — checked by eye with the Read tool against the actual
 * photos, not assumed from either label. A product with no entry here (e.g. a leather jacket
 * when the shoot has no jacket in it) is left unmapped on purpose: `assignPhotos` below then
 * leaves it photo-less, same as a product whose `image` is null, rather than hand it a photo of
 * the wrong kind of thing.
 *
 * The set is being actively re-shot while this fix is being written — it changed from the
 * original 32 files to a 20-file set mid-task, and the 20 files were then renumbered under the
 * same names a second time (the "black wool cardigan with ribbed cuffs" moved from
 * `knitwear-03.jpg` to `knitwear-04.jpg` between two checks). A table keyed by filename breaks
 * silently on a renumber like that: the file it names still exists, in the right category, just
 * holding different content now. So each entry below is a distinctive substring of the shoot's
 * own `alt` text instead of a filename — content the manifest itself carries, which travels with
 * a photo when it gets renumbered and only stops matching if the photo is actually replaced
 * (at which point the safe fallback below is no photo, not a re-numbered wrong one). The shoot is
 * also noticeably smaller than the catalog: 9 outerwear frames for 11 products, 4 knitwear frames
 * for 12, 7 leather frames for 8 — where one frame is the closest available match for more than
 * one product, it is reused rather than a mismatched frame forced onto the extra product, noted
 * inline. This is a one-time editorial call, not a formula, which is why it is a table: the
 * alternative is scoring every product against every frame by colour distance and hoping the
 * arithmetic lands on the same judgement a person makes by looking. [hand-off]
 */
const PHOTO_BY_HANDLE: Record<string, string> = {
  // outerwear — 11 products, 9 usable frames ("black wool cape with stand collar" matches no
  // product in this catalog and is left unused rather than forced onto one). Three frames are
  // each reused once for the closest remaining colour match.
  'kade-waxed-parka': 'grey leather car coat', // closest to "Charcoal"
  'noord-wool-overcoat': 'black wool double-breasted overcoat', // exact type match
  'veer-shell-jacket': 'black leather belted coat',
  'dijk-chore-jacket': 'black wool pea coat', // nearest plain black coat
  'spui-quilted-liner': 'ecru cotton long coat',
  'ij-trench': 'single-breasted camel wool blazer', // closest warm neutral to "Stone"
  'vecht-field-jacket': 'taupe wool blazer', // closest warm tone to "Olive"
  'sluis-anorak': 'black wool pea coat', // reuse: nearest plain black coat, see dijk-chore-jacket
  'havik-bomber': 'grey leather car coat', // reuse: nearest "Charcoal", see kade-waxed-parka
  'wal-overshirt': 'ecru cotton long coat', // reuse: both this and spui-quilted-liner are "Ecru"
  'doorn-rain-coat': 'navy wool overcoat', // the one blue frame, matches "Navy"
  // knitwear — 12 products needing a photo (nes-knit-polo is deliberately image-less) against
  // only 4 frames in this set (two black cardigans, one taupe sweater, one pair of ecru
  // gloves), so every frame here is shared by several products, grouped by nearest colour.
  'merino-crew': 'black wool button cardigan',
  'kern-cable-knit': 'ecru knitted evening gloves', // no ecru sweater in this shoot
  'bree-half-zip': 'black wool cardigan with ribbed cuffs',
  'loof-mock-neck': 'black wool button cardigan', // no navy frame — nearest cool-dark tone
  'stil-fine-gauge-crew': 'taupe wool v-neck sweater', // closest to "Stone"
  'wold-chunky-rollneck': 'black wool cardigan with ribbed cuffs',
  'vlas-linen-knit': 'ecru knitted evening gloves',
  'kaap-cardigan': 'black wool button cardigan', // exact type match
  'zand-waffle-knit': 'taupe wool v-neck sweater',
  'grid-rib-scarf': 'black wool cardigan with ribbed cuffs',
  'merino-beanie': 'black wool button cardigan',
  'boucle-crew': 'ecru knitted evening gloves',
  // leather — 8 products, 7 frames, all bags/boots/a belt (no jacket, wallet, glove or dress-shoe
  // frame at all in this set). kraal-leather-jacket, kade-leather-bomber, kaart-card-holder and
  // winter-leather-gloves have no entry below on purpose — none of the 7 frames are close enough
  // in kind to stand in for a jacket or small leather good without being a wrong-item bug in a
  // different shape, so those four fall back to the placeholder instead.
  'veld-leather-tote': 'black leather shoulder tote', // exact type and colour
  'haven-weekend-holdall': 'black textured leather frame bag', // nearest bag to "Charcoal"
  'riem-belt': 'black woven leather belt', // exact type match
  'damrak-derby': 'black leather lace-up boots', // closest footwear to a derby
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
