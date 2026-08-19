/**
 * Prerenders the VELDE storefront to static files for deployment [TASKS.md T15].
 *
 * VELDE is a `Bun.serve` on 4001, but every one of its routes is a pure function of a committed
 * `products.json` plus files on disk — no request state anywhere. So the deployed artifact is the
 * same HTML with no server under it, which is why T15 ships three static projects and not one
 * serverless function. The single casualty is `POST /cart/add`, the no-JS add-to-bag fallback,
 * which 405s in production; `assets/velde.js` intercepts the submit for everyone with JS, so this
 * is the JS-off path only [T2 QA bar: "pages still read"].
 *
 * This file lives in `tools/`, NOT in `apps/shop-velde/`, because the storefront freeze proof is
 * `git log -p apps/shop-*` [ENGINEERING §1.1]. A build tool that renders the storefront is not
 * storefront source, and putting it here keeps that grep honest.
 *
 *   bun run tools/build-velde.ts --site=https://x.vercel.app --platform=https://y.vercel.app
 *
 * Both default to the frozen localhost origins, so a bare run reproduces exactly what `dev:velde`
 * serves — which is what makes the deploy build verifiable against the local one.
 */

import { rm, mkdir, cp } from 'node:fs/promises'

const arg = (name: string, fallback: string): string =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? fallback

const SITE = arg('site', 'http://localhost:4001')
const PLATFORM = arg('platform', 'http://localhost:4003')
const OUT = `${import.meta.dir}/../dist/velde`

// Set BEFORE importing the storefront: `ORIGIN` and `PLATFORM_ORIGIN` are module-level consts, so
// they read `process.env` exactly once at evaluation. A static import would run that evaluation
// before this assignment and silently bake in localhost — the failure would be invisible until
// someone viewed source on the deployed page.
process.env.SITE_ORIGIN = SITE
process.env.PLATFORM_ORIGIN = PLATFORM

const { products, photoOf, checkCatalog, photoDir } = await import('../apps/shop-velde/catalog')
const { homePage, productPage, sitemap } = await import('../apps/shop-velde/render')

// `checkCatalog()` is the guard that stops a truncated catalog rendering half a store. It is called
// by `apps/shop-velde/server.ts:14`, so importing the renderer directly is the one VELDE entry
// point that would otherwise skip it. [TASKS.md §2: non-trivial logic leaves a runnable check]
console.log(checkCatalog())

await rm(OUT, { recursive: true, force: true })
await mkdir(`${OUT}/products`, { recursive: true })
await mkdir(`${OUT}/photos`, { recursive: true })

const written: string[] = []
const write = async (path: string, body: string): Promise<void> => {
  await Bun.write(`${OUT}/${path}`, body)
  written.push(path)
}

await write('index.html', homePage())
for (const product of products) {
  await write(`products/${product.handle}/index.html`, productPage(product))
}
await write('sitemap.xml', sitemap())

// robots.txt is a static file, not a template, so it carries the frozen origin as a literal. It is
// the third of the three `localhost:400*` occurrences in the storefront and the one the origin
// exemption cannot reach through an env var. [refuted plan, finding 5]
const robots = await Bun.file(`${import.meta.dir}/../apps/shop-velde/robots.txt`).text()
await write('robots.txt', robots.replaceAll('http://localhost:4001', SITE))

await cp(`${import.meta.dir}/../apps/shop-velde/assets`, `${OUT}/assets`, { recursive: true })

// Only the frames a product actually claims. The shoot holds 30 files and 18 products are
// photographed; publishing the rest would ship the frames `catalog.ts` documents as deliberately
// rejected — a third-party airline logo among them. [refuted plan, finding 13]
let copied = 0
for (const product of products) {
  const photo = photoOf(product)
  if (photo === null) continue
  const file = photo.src.replace(/^\/photos\//, '')
  await cp(`${photoDir}/${file}`, `${OUT}/photos/${file}`)
  copied += 1
}

// Both assertions print their count first: a check that silently collected zero cases is a failure,
// not a pass [ENGINEERING §3.1]. The second is the one that matters — it is the only thing standing
// between a mis-set env var and a deployed page whose canonical, og:url, JSON-LD and sitemap all
// point at a laptop.
const pages = written.filter((p) => p.endsWith('.html')).length
console.log(`velde → ${OUT}: ${pages} pages, ${copied} photos, site=${SITE} platform=${PLATFORM}`)
if (pages < 2) throw new Error(`expected at least a home page and one PDP, wrote ${pages}`)
if (copied === 0)
  throw new Error('no photographs were copied — the store would render as grey tiles')

// An origin is a leak only if it is one we did NOT ask for. On a bare run the defaults ARE
// localhost, so a blanket "no localhost" rule would fail the parity build this tool exists to make
// possible; on a deploy run SITE and PLATFORM are https, so every localhost match is a real leak.
const leaked: string[] = []
for (const path of written) {
  const body = await Bun.file(`${OUT}/${path}`).text()
  for (const match of body.matchAll(/https?:\/\/localhost:\d+/g)) {
    const entry = `${path}: ${match[0]}`
    if (match[0] !== SITE && match[0] !== PLATFORM && !leaked.includes(entry)) leaked.push(entry)
  }
}
console.log(`origin check — ${written.length} files scanned, ${leaked.length} leaks`)
if (leaked.length > 0) {
  throw new Error(`frozen localhost origin survived into the build:\n  ${leaked.join('\n  ')}`)
}
