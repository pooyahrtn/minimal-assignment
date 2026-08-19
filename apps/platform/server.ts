/**
 * The real T6 platform origin: `/v1/config/:shopKey` and `/v1/agent.js`, both cross-origin,
 * both cached, neither able to 500 a merchant's page. Replaces the `tools/serve-platform.ts`
 * stub — this file is the router the stub's comment said T6 would build.
 *
 * PORT 4003 IS FROZEN: both storefronts carry a literal `<script src="http://localhost:4003/...">`
 * and `ENGINEERING.md §1.1` forbids editing storefront source, so the port cannot move here either.
 */

const root = `${import.meta.dir}/../..`
const BUNDLE = `${root}/packages/agent/dist/agent.js`
const CONFIG_DIR = `${import.meta.dir}/config`

/**
 * A closed set, not a path segment: `/v1/config/../../etc/passwd` never reaches the filesystem,
 * because the key is only ever used as a Set lookup, never interpolated into a path. Enumerated
 * once at startup from the files that actually exist, rather than a hand-maintained list that
 * drifts from `config/` — the DoD's "unknown shopKey never breaks the page" needs `default.json`
 * to always be one of these, so it's the one shop key requirement here rather than an assumption.
 */
const SHOPS = new Set(
  (await Array.fromAsync(new Bun.Glob('*.json').scan({ cwd: CONFIG_DIR }))).map((name) =>
    name.replace(/\.json$/, ''),
  ),
)
if (!SHOPS.has('default')) throw new Error(`${CONFIG_DIR}/default.json is missing`)

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  // The embed fetches with `credentials: 'omit'`, so `*` is legal and no allow-credentials
  // pairing is needed. A merchant-scoped origin list is out of scope (T6 DoD: "Not in scope").
}

/**
 * Every response — hits, misses, 304s — carries a strong ETag of the exact bytes served, plus
 * `max-age=0, must-revalidate`. The embed script is a binary we cannot recall [ENGINEERING §2.1]:
 * a merchant's browser holds it indefinitely, so a fix only reaches them on the next revalidation.
 * `max-age=0` forces that revalidation on every load instead of trusting a TTL; `must-revalidate`
 * stops a browser from serving stale bytes if the revalidation fails offline. A 304 costs one
 * round trip with no body, so this is cheap on the common case where nothing changed. Commit
 * `6dcb6f1` is the bug this exists to prevent: a long-lived server serving a bundle older than
 * source. No `stale-while-revalidate` — that would let a request serve last build's bytes anyway.
 */
// `Uint8Array<ArrayBuffer>`, not the bare `Uint8Array<ArrayBufferLike>` a plain annotation infers:
// `Bun.file().bytes()` returns the concrete form, and only that satisfies `BodyInit` on this
// TS/lib pair (5.9's `BufferSource` wants `ArrayBufferView<ArrayBuffer>` specifically).
function cachedResponse(
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
  request: Request,
): Response {
  const etag = `"${Bun.hash(bytes).toString(16)}"`
  const headers = {
    ...CORS,
    etag,
    'cache-control': 'public, max-age=0, must-revalidate',
  }
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(bytes, { headers: { ...headers, 'content-type': contentType } })
}

/**
 * `dist/` is gitignored and rebuilt from source, so a long-lived server (Playwright reuses one)
 * will happily serve a bundle from before the last source change — the exact drift T12 caught in
 * `6dcb6f1`. Rebuild on request instead of trusting whoever last remembered to. 8ms, and only on
 * page load. Shells out to the package's own build script so the flags — including "no source
 * map" — have one definition. [ENGINEERING §3.13]
 */
async function rebuildBundle(): Promise<void> {
  await Bun.$`bun run --filter '@maximal/agent' build`.cwd(root).quiet()
}

export function serve(port = 4003) {
  return Bun.serve({
    port,
    async fetch(request) {
      const { pathname } = new URL(request.url)
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

      if (pathname === '/v1/agent.js') {
        await rebuildBundle()
        const bytes = await Bun.file(BUNDLE).bytes()
        return cachedResponse(bytes, 'text/javascript; charset=utf-8', request)
      }

      if (pathname.startsWith('/v1/config/')) {
        const requested = pathname.slice('/v1/config/'.length)
        // Unknown or unsafe key -> the default config, always 200. The widget must never see a
        // 404/500 from its own config fetch [TASKS.md T6 DoD].
        const shop = SHOPS.has(requested) ? requested : 'default'
        const bytes = await Bun.file(`${CONFIG_DIR}/${shop}.json`).bytes()
        return cachedResponse(bytes, 'application/json; charset=utf-8', request)
      }

      return new Response('not found\n', { status: 404, headers: CORS })
    },
  })
}

if (import.meta.main) {
  const server = serve()
  console.log(`platform API on http://localhost:${server.port}`)
  console.log(`  /v1/agent.js            -> ${BUNDLE}`)
  console.log(`  /v1/config/{${[...SHOPS].join(',')}} -> ${CONFIG_DIR}/*.json`)
}
