/**
 * The deployed platform's dynamic half — the routes that cannot be a file on a CDN:
 * `POST /v1/extract`, `POST /v1/config`, `GET /v1/published/:key`, `GET /v1/font.css`, and
 * `GET /v1/config/<a minted key>`. Everything static (`/`, `/ui/*`, `/v1/agent.js`, the four
 * committed brand configs) is staged by `tools/build-platform.ts` and served by the CDN, which
 * Vercel resolves BEFORE rewrites — so this function only ever sees what no file answered.
 *
 * A wrapper, not a second implementation. `apps/platform/server.ts` owns the routing table, the
 * SSRF guard on `/v1/extract`, the body caps and the shop-key rules; forking any of that into an
 * API written for deployment is how the two drift, and the security half is the half you do not
 * find out has drifted. The Bun runtime (`bunVersion` in vercel.json) is what lets that file run
 * here unchanged — it is written against `Bun.file`, `Bun.hash` and `Bun.Glob`.
 *
 * `PLATFORM_API` gates it: `vercel.json` sits at the repo root and the VELDE storefront project is
 * rooted there too, so this function is built into that deployment as well. It is set on
 * `maximal-platform` only [tools/deploy.sh], and without it this answers 404 like any other
 * unrouted path.
 */
import { handleRequest } from '../apps/platform/server'

/**
 * Exported per HTTP method, not as a `default`. A default export is invoked with Node's
 * `(req, res)` — `req.headers` is then a plain object and `req.url` a bare path, and the router
 * dies on `new URL()` before it matches anything. The named-method form is what selects the Web
 * handler signature, which is the one `server.ts` is written against.
 */
async function handler(request: Request): Promise<Response> {
  if (process.env.PLATFORM_API === undefined) {
    return new Response('not found\n', { status: 404 })
  }
  // Belt and braces: whichever signature is selected, the router needs an absolute URL. `POST
  // /v1/config` echoes `url.origin` back inside the snippet it mints, so this has to be the host
  // the caller actually used — the platform answers on `maximal.releashed.io`, on the project's
  // `*.vercel.app` default domain and on every preview URL.
  if (request.url.startsWith('http')) return handleRequest(request)
  const host = request.headers.get('host')
  if (host === null) return new Response('no host header\n', { status: 400 })
  return handleRequest(new Request(`https://${host}${request.url}`, request))
}

export const GET = handler
export const POST = handler
export const OPTIONS = handler
