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
const UI_DIR = `${ROOT}/apps/platform/ui`
const UI_ENTRY = `${UI_DIR}/main.ts`
const UI_INDEX = `${UI_DIR}/index.html`
const UI_CSS = `${UI_DIR}/ui.css`
const BUNDLE = `${ROOT}/packages/agent/dist/agent.js`

const arg = (name: string, fallback: string): string =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? fallback

/**
 * THE OTHER ORIGIN SURFACE, and much the larger one. Each config's `catalog` carries an absolute
 * `url` and `image` per product, built by `tools/build-config.ts` against the storefront's own
 * origin — 119 `http://localhost` URLs across the four files. The widget renders those directly, so
 * on a deployed page every product card requests its photograph from the shopper's OWN machine:
 * the browser blocks it as a cross-origin failure, the card shows a blank tile, and the "see the
 * piece" CTA is a dead link. The storefront HTML was clean and I checked only that, which is why
 * this shipped once — the payload is not the page.
 *
 * Keyed by PORT rather than by shop, because a config's catalog can point at a storefront that is
 * not its own: HELDER has no store of its own and borrows VELDE's.
 */
const repoint = (body: string): string =>
  body.replaceAll(
    /http:\/\/localhost:(\d+)/g,
    (whole, port: string) => ORIGIN_BY_PORT[port] ?? whole,
  )

const ORIGIN_BY_PORT: Record<string, string> = {
  '4001': arg('velde', 'http://localhost:4001'),
  '4002': arg('kracht', 'http://localhost:4002'),
}

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
  const repointed = repoint(await Bun.file(`${CONFIG_DIR}/${name}`).text())
  // Extensionless on purpose — see the header comment. This is the whole fix.
  await Bun.write(`${OUT}/v1/config/${shop}`, repointed)
  shops.push(shop)
}

/**
 * T7's configuration page, staged as three static files. It was built, committed and demoed on
 * localhost, and then never deployed at all — `maximal.releashed.io/` answered 404 for as long as
 * the platform has been live — because this tool staged "the platform's two routes" and nobody
 * re-read that sentence after T7 landed.
 *
 * `main.js` is built HERE rather than left to `server.ts:handleUiMainJs`, which builds it in
 * process on demand: on Vercel that route is never reached, because a static file beats a rewrite.
 * Same `Bun.build` call, so the deployed bytes and the dev bytes come off the same builder.
 */
const ui = await Bun.build({ entrypoints: [UI_ENTRY], target: 'browser', format: 'esm' })
if (!ui.success) throw new Error(`config page ui build failed:\n${ui.logs.join('\n')}`)
const uiBundle = ui.outputs[0]
if (uiBundle === undefined) throw new Error('config page ui build produced no output')
await mkdir(`${OUT}/ui`, { recursive: true })
// Through `repoint` for the same reason the configs are: the page's "try the VELDE store" buttons
// fill the URL field with `http://localhost:4001`, so deployed they would hand the reviewer a dead
// link to their own machine. The blanket origin check below is what caught this — it was written
// against the config payload and found the surface nobody had named. [TASKS §0 #11]
await Bun.write(`${OUT}/index.html`, repoint(await Bun.file(UI_INDEX).text()))
await Bun.write(`${OUT}/ui/ui.css`, Bun.file(UI_CSS))
// Through `repoint` too, and for a sharper reason than index.html's: `preview.ts`'s STOREFRONTS
// map is the iframe target, so deployed this framed the reviewer's own machine — a dead pane, and
// every control's only feedback surface with it.
await Bun.write(`${OUT}/ui/main.js`, repoint(await uiBundle.text()))

// Copied, not authored. Vercel reads `vercel.json` from the project ROOT when it builds from git,
// and from the upload root when `vercel deploy dist/platform` uploads a prebuilt directory — two
// consumers, and a second copy here would be a contract that drifts. The root file is the
// definition; the CORS list above documents what it must contain and is asserted against it below.
await Bun.write(`${OUT}/vercel.json`, Bun.file(`${ROOT}/vercel.json`))

const shipped: unknown = await Bun.file(`${OUT}/vercel.json`).json()
const headerRules = isRecord(shipped) && Array.isArray(shipped.headers) ? shipped.headers : []
for (const { key, value } of CORS) {
  const everywhere = headerRules.every(
    (rule) =>
      isRecord(rule) &&
      Array.isArray(rule.headers) &&
      rule.headers.some((h) => isRecord(h) && h.key === key && h.value === value),
  )
  if (!everywhere || headerRules.length === 0) {
    throw new Error(
      `vercel.json does not set ${key}: ${value} on every /v1 route — the deployed platform would diverge from apps/platform/server.ts`,
    )
  }
}

const bundleBytes = (await Bun.file(`${OUT}/v1/agent.js`).bytes()).length
const uiBytes = (await Bun.file(`${OUT}/ui/main.js`).bytes()).length
console.log(
  `platform → ${OUT}: agent.js ${bundleBytes}B, ui ${uiBytes}B, ${shops.length} configs [${shops.join(', ')}]`,
)
if (uiBytes === 0) throw new Error('the config page bundle is empty — the page would not render')
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

// Blanket, over every byte staged — not over the fields someone thought to name. The first version
// of this tool asserted the configs were DISTINCT and said nothing about what was IN them, so 119
// localhost URLs went out under a green check. An allow-list of surfaces to inspect is a list of
// the failures already imagined; scanning the whole output is the only version that catches the
// next one. Deploy mode = any origin is remote, and then no localhost may survive anywhere.
const deploying = Object.values(ORIGIN_BY_PORT).some((origin) => !origin.includes('localhost'))
if (deploying) {
  const leaks: string[] = []
  for await (const name of new Bun.Glob('**/*').scan({ cwd: OUT })) {
    const body = await Bun.file(`${OUT}/${name}`).text()
    const found = [...new Set([...body.matchAll(/https?:\/\/localhost:\d+/g)].map((m) => m[0]))]
    if (found.length > 0)
      leaks.push(`${name}: ${found.join(', ')} (${body.split('localhost').length - 1}x)`)
  }
  console.log(`origin check — ${leaks.length} file(s) still carrying a localhost origin`)
  if (leaks.length > 0) {
    throw new Error(
      `a frozen localhost origin survived into the deployed payload:\n  ${leaks.join('\n  ')}`,
    )
  }
}
const brands = [...accents].filter(([shop]) => shop !== 'default')
if (new Set(brands.map(([, accent]) => accent)).size !== brands.length) {
  throw new Error(
    `two brands share an accent, so the deploy cannot prove they differ: ${[...accents]}`,
  )
}
