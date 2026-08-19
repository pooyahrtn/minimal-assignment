/**
 * Stages the platform's two routes as static files for deployment [TASKS.md T15].
 *
 * `apps/platform/server.ts` stays exactly as it is — it is the local dev and e2e server, it owns
 * benchmark H6, and it is hot with another desk. This tool produces the deployed artifact instead,
 * because `server.ts:103`'s `rebuildBundle()` shells out `bun build` per request and there is no
 * toolchain and no writable FS on a serverless host. Building here rather than on Vercel also
 * sidesteps Root Directory: a project rooted at `apps/platform` cannot reach `../../packages`.
 *
 * THE TRAP THIS FILE EXISTS TO AVOID. The widget requests an EXTENSIONLESS path —
 * `packages/agent/src/config.ts:16` builds `/v1/config/${shop}` with no `.json`. Staging the files
 * as `velde.json` and relying on a catch-all rewrite means no file ever matches, the catch-all
 * fires for every shop, and all three brands silently render the default config: no 404, no CORS
 * error, no console warning, every automated check green. So the files are written WITHOUT an
 * extension, `content-type` is supplied by a header rule, and the rewrite is left to do only the
 * one job it is actually needed for — an unknown key falling back to the default. Vercel gives
 * "precedence to the filesystem prior to rewrites being applied", so a known key never reaches it.
 */

import { rm, mkdir } from 'node:fs/promises'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const ROOT = `${import.meta.dir}/..`
const OUT = `${ROOT}/dist/platform`
const CONFIG_DIR = `${ROOT}/apps/platform/config`
const BUNDLE = `${ROOT}/packages/agent/dist/agent.js`

// Same CORS values `apps/platform/server.ts:41-43` sends, character for character. Two
// implementations of one contract is the cost of deploying static; stating it here is what keeps
// the divergence visible rather than discovered.
const CORS = [
  { key: 'access-control-allow-origin', value: '*' },
  { key: 'access-control-allow-methods', value: 'GET, POST, OPTIONS' },
  // Vercel's documented default for static assets is already `public, max-age=0, must-revalidate`,
  // and it emits a strong ETag with 304 revalidation — which is what `cachedResponse()` hand-rolls
  // with `Bun.hash`. Set explicitly anyway: a default that happens to match is not a contract.
  { key: 'cache-control', value: 'public, max-age=0, must-revalidate' },
]

const built = await Bun.$`bun run --filter '@maximal/agent' build`.cwd(ROOT).nothrow()
if (built.exitCode !== 0) throw new Error(`agent build failed:\n${built.stderr}`)

await rm(OUT, { recursive: true, force: true })
await mkdir(`${OUT}/v1/config`, { recursive: true })

await Bun.write(`${OUT}/v1/agent.js`, Bun.file(BUNDLE))

const shops: string[] = []
for await (const name of new Bun.Glob('*.json').scan({ cwd: CONFIG_DIR })) {
  const shop = name.replace(/\.json$/, '')
  // `shop-*.json` is T7's config page writing a draft per pasted merchant URL. `.gitignore` already
  // treats them as ephemera; deploying them would publish whatever a demo happened to leave on the
  // disk of whoever ran the build, and several share the extractor's neutral fallback accent, which
  // is indistinguishable from the config-collision bug the check below exists to catch.
  if (shop.startsWith('shop-')) continue
  // Extensionless on purpose — see the header comment. This is the whole fix.
  await Bun.write(`${OUT}/v1/config/${shop}`, Bun.file(`${CONFIG_DIR}/${name}`))
  shops.push(shop)
}

await Bun.write(
  `${OUT}/vercel.json`,
  `${JSON.stringify(
    {
      headers: [
        { source: '/v1/agent.js', headers: CORS },
        {
          source: '/v1/config/(.*)',
          headers: [...CORS, { key: 'content-type', value: 'application/json; charset=utf-8' }],
        },
      ],
      // Only reached when the filesystem has no such shop. Preserves T6's "unknown shopKey returns
      // a safe default config, not a 500 — the widget must never break a merchant's page".
      rewrites: [{ source: '/v1/config/:key', destination: '/v1/config/default' }],
    },
    null,
    2,
  )}\n`,
)

const bundleBytes = (await Bun.file(`${OUT}/v1/agent.js`).bytes()).length
console.log(
  `platform → ${OUT}: agent.js ${bundleBytes}B, ${shops.length} configs [${shops.join(', ')}]`,
)
if (bundleBytes === 0) throw new Error('agent.js is empty — the widget would not mount')
if (!shops.includes('default')) throw new Error('default config missing — unknown keys would 404')
if (shops.length < 2) throw new Error(`expected the brand configs, staged only ${shops.length}`)

// The configs must be DISTINCT. If a future change reintroduces the extension trap, every shop
// resolves to the same bytes and the only visible symptom is that the brands stop looking
// different — which is exactly the failure no other check in this repo would catch.
const accents = new Map<string, string>()
for (const shop of shops) {
  const parsed: unknown = await Bun.file(`${OUT}/v1/config/${shop}`).json()
  const tokens = isRecord(parsed) ? parsed.tokens : undefined
  const css = isRecord(tokens) ? tokens.css : undefined
  const accent = isRecord(css) ? String(css['--mx-accent']) : 'unreadable'
  if (accent === 'unreadable') throw new Error(`${shop}: no tokens.css['--mx-accent'] to compare`)
  accents.set(shop, accent)
}
console.log(`accents — ${[...accents].map(([s, a]) => `${s}:${a}`).join(' ')}`)
const brands = [...accents].filter(([shop]) => shop !== 'default')
if (new Set(brands.map(([, accent]) => accent)).size !== brands.length) {
  throw new Error(
    `two brands share an accent, so the deploy cannot prove they differ: ${[...accents]}`,
  )
}
