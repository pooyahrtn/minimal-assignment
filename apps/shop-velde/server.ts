import { checkCatalog, photoDir } from './catalog'
import { homePage, productBy, productPage, sitemap } from './render'

const html = (body: string) =>
  new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } })

const file = (path: string) => {
  const asset = Bun.file(path)
  return asset
    .exists()
    .then((found) => (found ? new Response(asset) : new Response('', { status: 404 })))
}

console.log(checkCatalog())

const server = Bun.serve({
  port: 4001,
  routes: {
    '/': () => html(homePage()),
    '/products/:handle': (request) => {
      const product = productBy(request.params.handle)
      return product ? html(productPage(product)) : new Response('Not found', { status: 404 })
    },
    '/assets/:name': (request) => file(`${import.meta.dir}/assets/${request.params.name}`),
    '/photos/:name': (request) => file(`${photoDir}/${request.params.name}`),
    // A real store publishes one for its own reasons, which is the whole test for what belongs
    // here [PRINCIPLES §4, the Google test]. The crawler directive inside it is why T2's proof
    // grep excludes that one file — see DECISIONS-LOG, Brands & storefronts.
    '/robots.txt': () => file(`${import.meta.dir}/robots.txt`),
    '/sitemap.xml': () =>
      new Response(sitemap(), { headers: { 'content-type': 'application/xml; charset=utf-8' } }),
    // No-script fallback for the add-to-bag form: bounce back with the drawer open.
    '/cart/add': {
      POST: (request) =>
        Response.redirect(`${request.headers.get('referer') ?? '/'}#CartDrawer`, 303),
    },
  },
  fetch: () => new Response('Not found', { status: 404 }),
})

console.log(`velde — ${server.url}`)
