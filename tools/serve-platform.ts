/**
 * The platform origin, as a deliberately dumb static stub: two files off disk with CORS headers.
 * T6 builds the real `/v1/config` — a router, an edge cache, per-merchant records, validation.
 * None of that is here, on purpose. What IS real is the shape the widget depends on: the config
 * arrives cross-origin (storefronts run on 4001/4002, this is 4003), the derived tokens and the
 * catalog come off the wire, and `agent.js` is served from the same origin it reads its config
 * from — which is what makes `configUrl()`'s "resolve against my own src" behaviour testable.
 */

const root = `${import.meta.dir}/..`
const BUNDLE = `${root}/packages/agent/dist/agent.js`
const CONFIG_DIR = `${import.meta.dir}/config`

/** A closed set, not a path segment: `/v1/config/../../etc/passwd` never reaches the filesystem. */
const SHOPS = new Set(['velde', 'kracht'])

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  // The embed fetches with `credentials: 'omit'`, so `*` is legal and no allow-credentials pairing
  // is needed. A merchant-scoped origin list is T6's problem.
  'cache-control': 'no-store',
}

async function serveFile(path: string, type: string): Promise<Response> {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    return new Response(`not built: ${path}\n`, { status: 404, headers: CORS })
  }
  return new Response(file, { headers: { ...CORS, 'content-type': type } })
}

const server = Bun.serve({
  port: 4003,
  async fetch(request) {
    const { pathname } = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (pathname === '/v1/agent.js') return serveFile(BUNDLE, 'text/javascript; charset=utf-8')
    const shop = pathname.startsWith('/v1/config/') ? pathname.slice('/v1/config/'.length) : ''
    if (SHOPS.has(shop)) {
      return serveFile(`${CONFIG_DIR}/${shop}.json`, 'application/json; charset=utf-8')
    }
    return new Response('not found\n', { status: 404, headers: CORS })
  },
})

console.log(`platform stub on http://localhost:${server.port}`)
console.log(`  /v1/agent.js            -> ${BUNDLE}`)
console.log(`  /v1/config/{${[...SHOPS].join(',')}} -> ${CONFIG_DIR}/*.json`)
