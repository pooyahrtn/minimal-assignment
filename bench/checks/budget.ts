import { chromium } from '@playwright/test'
import type { Check } from '../checks'
import { serve } from '../../apps/platform/server'
import { isConfigResponse } from '../../packages/agent/src/config'

// H6 (BENCHMARKS §1, TASKS.md T6). Two pinned-cap measurements on the artifact that actually
// ships [ENGINEERING §3.13]: the gzipped `agent.js` bundle, and config-fetch-to-first-paint in a
// real cross-origin browser load. Plus the mechanical proof of T6 DoD boxes 1 and 2 (unknown-key
// fallback, CORS header) over real HTTP against an ephemeral instance of the real server.

const REPO_ROOT = `${import.meta.dir}/../..`
const BUNDLE_PATH = `${REPO_ROOT}/packages/agent/dist/agent.js`
const MAP_PATH = `${BUNDLE_PATH}.map`

/**
 * measured gzip size = 16409 bytes (bun bench budget, 2026-08-19, real build of packages/agent —
 * stable across repeat builds). 18 kB, which is measured + ~12% headroom.
 *
 * RATCHETED UP from 15975 (= 12288 × 1.3, against a 12146-byte measurement) when the abstention
 * chip state landed. [BENCHMARKS §4.1: ratchets up only, never down]
 *
 * The headroom is deliberately TIGHTER than the 30% the first cap used, and that is the lesson
 * this raise records rather than a number picked to fit. Between the two measurements the bundle
 * grew 12146 → 15915 — 31%, consuming essentially the whole allowance — and nothing said a word,
 * because a cap only speaks at its boundary. The first thing that then asked for bytes inherited
 * the entire accumulated drift as its own bill, which is a bad way to find out. 12% means the
 * next drift is caught while it is still small enough to argue about.
 *
 * This is a REGRESSION detector, not a product limit: 16 kB gzipped buys brand-token derivation,
 * an FSM, a shadow-root shell and six block renderers, and a merchant's page will not feel it.
 * Raise it again when something real needs the room — and re-measure rather than reason.
 */
const GZIP_CAP_BYTES = 18432

/**
 * measured config-fetch-to-first-paint = 14-22 ms across repeat runs (bun bench budget,
 * 2026-08-19, local headless Chromium). Browser timing is noisy and this is a HARD gate, so the
 * cap is measured+100% or measured+400ms, whichever is larger — 400ms dominates by a wide margin
 * at this magnitude, which is exactly the headroom a HARD gate needs against CI/laptop jitter.
 * [task spec F]
 */
const PAINT_CAP_MS = 400

const HOST_URL = 'http://mx-budget-host.invalid/'

function hostPage(agentJsOrigin: string): string {
  // The one real embed line, per PRINCIPLES §5 / e2e/agent.spec.ts's comment — nothing else on
  // the page, so the only resources loaded are the ones the widget itself requests.
  return `<!doctype html><html><body><script src="${agentJsOrigin}/v1/agent.js" data-shop="velde" async></script></body></html>`
}

/**
 * Counts every assertion actually made, so `count` in the CheckResult is never a guess.
 *
 * H6 keeps the throw-on-first-failure protocol rather than collecting into `failures`, and that is
 * deliberate: the asserter is threaded through a bundle build, a `fetch` contract check and a
 * Playwright paint measurement, and each stage's numbers are only meaningful if the one before it
 * held. Made non-fatal, `assert(widgetStampMs !== null)` would fall through to
 * `widgetStampMs ?? 0`, and `0 - configResponseEndMs` is a large negative that then *passes* the
 * paint cap — a phantom pass, which is worse than the thing the change was meant to fix.
 *
 * Exported so `bench/fault.test.ts` can prove a false assertion actually throws, rather than the
 * suite resting on the belief that it does [COMPLAINS #2].
 */
export function makeAsserter(): {
  assert: (condition: boolean, message: string) => void
  count: number
} {
  const state = { count: 0 }
  return {
    assert(condition: boolean, message: string): void {
      state.count++
      if (!condition) throw new Error(`H6 budget: ${message}`)
    },
    get count() {
      return state.count
    },
  }
}

async function buildBundle(): Promise<void> {
  // Same build the platform server itself shells out to on every `/v1/agent.js` request — one
  // definition of the flags, including "no source map". [server.ts, ENGINEERING §3.13]
  await Bun.$`bun run --filter '@maximal/agent' build`.cwd(REPO_ROOT).quiet()
}

async function measureBundle(
  assert: (condition: boolean, message: string) => void,
): Promise<number> {
  await buildBundle()
  const bytes = await Bun.file(BUNDLE_PATH).bytes()
  const text = new TextDecoder().decode(bytes)
  assert(!text.includes('sourceMappingURL'), 'agent.js bytes contain a sourceMappingURL comment')
  assert(!(await Bun.file(MAP_PATH).exists()), `${MAP_PATH} exists — the bundle must ship alone`)
  const gzipped = Bun.gzipSync(bytes)
  assert(
    gzipped.byteLength <= GZIP_CAP_BYTES,
    `gzipped agent.js is ${gzipped.byteLength}B, over the ${GZIP_CAP_BYTES}B cap`,
  )
  return gzipped.byteLength
}

async function checkConfigContract(
  origin: string,
  assert: (condition: boolean, message: string) => void,
): Promise<void> {
  // T6 DoD box 1: an unknown shopKey never 404s or breaks the page — it falls back to a real,
  // parseable config, always 200.
  const unknownResponse = await fetch(`${origin}/v1/config/nonsense`)
  assert(unknownResponse.status === 200, `/v1/config/nonsense returned ${unknownResponse.status}`)
  const unknownBody: unknown = await unknownResponse.json()
  assert(isConfigResponse(unknownBody), '/v1/config/nonsense body is not a valid ConfigResponse')

  // T6 DoD box 2: the config endpoint answers cross-origin.
  const corsResponse = await fetch(`${origin}/v1/config/velde`, {
    headers: { Origin: 'https://velde.example' },
  })
  assert(
    corsResponse.headers.get('access-control-allow-origin') !== null,
    '/v1/config/velde is missing access-control-allow-origin',
  )
}

type PaintMeasurement = { widgetStampMs: number; configResponseEndMs: number }

/**
 * Config-fetch-to-first-paint, measured from OUTSIDE the widget [task spec E]: no instrumentation
 * added to boot.ts. A MutationObserver installed via `addInitScript` (same pattern as
 * e2e/agent.spec.ts ~L186) stamps `performance.now()` the instant `<mx-agent>` first appears in
 * the DOM; the config fetch's own Resource Timing entry gives `responseEnd` independently.
 */
async function measurePaint(
  origin: string,
  assert: (condition: boolean, message: string) => void,
): Promise<PaintMeasurement> {
  let browser: Awaited<ReturnType<typeof chromium.launch>>
  try {
    // `HOST_URL` is fulfilled via `page.route`, not a real socket, so Chromium classifies its
    // address space as `unknown` rather than `public` or `local` — Private/Local Network Access
    // then blocks the widget's real fetch to the loopback platform server with a permission
    // prompt that never resolves in headless automation. Disabling the PNA/LNA feature set is the
    // only way to keep the mocked-origin cross-origin proof the task asks for (measured live:
    // without these flags `waitForFunction` times out at 30s on `net::ERR_FAILED`, "Permission
    // was denied for this request to access the `unknown` address space").
    browser = await chromium.launch({
      args: [
        '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,' +
          'PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests,' +
          'PrivateNetworkAccessForNavigations,PrivateNetworkAccessForWorkers,' +
          'PrivateNetworkAccessPermissionPrompt',
      ],
    })
  } catch (error) {
    throw new Error(
      'H6 budget: Chromium is not installed for Playwright. Run `bunx playwright install chromium` ' +
        `and retry.\n${error instanceof Error ? error.message : String(error)}`,
    )
  }

  try {
    const page = await browser.newPage()
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (document.querySelector('mx-agent') !== null) {
          Reflect.set(window, '__mxWidgetStampMs', performance.now())
          observer.disconnect()
        }
      })
      observer.observe(document, { childList: true, subtree: true })
    })

    await page.route(HOST_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: hostPage(origin) }),
    )
    await page.goto(HOST_URL)
    await page.waitForFunction(() => Reflect.get(window, '__mxWidgetStampMs') !== undefined)

    const widgetStampMs = await page.evaluate<number | null>(() => {
      const value = Reflect.get(window, '__mxWidgetStampMs')
      return typeof value === 'number' ? value : null
    })
    const configResponseEndMs = await page.evaluate<number | null>(() => {
      // `getEntriesByType` types its result as the base `PerformanceEntry`, which has no
      // `responseEnd` — narrow at runtime instead of casting. [ENGINEERING §1.4]
      function isResourceTiming(entry: PerformanceEntry): entry is PerformanceResourceTiming {
        return typeof Reflect.get(entry, 'responseEnd') === 'number'
      }
      const entry = performance
        .getEntriesByType('resource')
        .find((e) => e.name.includes('/v1/config/'))
      return entry && isResourceTiming(entry) ? entry.responseEnd : null
    })

    /*
     * Prove the FETCHED payload was consumed, not just that a widget appeared. `loadConfig` falls
     * back to the bundled `FALLBACK` on any failure — a 500, a wrong path, a malformed body — and
     * that fallback still mounts a widget, still leaves a `/v1/config/` resource-timing entry, and
     * still logs no CORS error. Every other assertion here would pass on a broken endpoint.
     * The discriminator is the catalog: `FALLBACK` ships EMPTY by design, so a cached config with
     * products in it can only have come off the wire.
     */
    const cachedCatalogSize = await page.evaluate<number>(() => {
      const raw = localStorage.getItem('mx-config-velde')
      if (raw === null) return -1
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) return -1
      const catalog = Reflect.get(parsed, 'catalog')
      return Array.isArray(catalog) ? catalog.length : -1
    })
    assert(
      cachedCatalogSize > 0,
      `the widget did not consume the fetched config (cached catalog size ${cachedCatalogSize}) — it silently fell back to the bundled one, so this would pass against a broken endpoint`,
    )

    assert(widgetStampMs !== null, 'mx-agent never appeared in the DOM')
    assert(configResponseEndMs !== null, 'no /v1/config/ resource timing entry was recorded')
    assert(
      !consoleErrors.some((text) => /cors/i.test(text)),
      `a console error mentioned CORS: ${consoleErrors.find((text) => /cors/i.test(text))}`,
    )

    const safeStamp = widgetStampMs ?? 0
    const safeConfigEnd = configResponseEndMs ?? 0
    return { widgetStampMs: safeStamp, configResponseEndMs: safeConfigEnd }
  } finally {
    await browser.close()
  }
}

export const budget: Check = {
  name: 'budget',
  tier: 'HARD',
  run: async () => {
    // Not destructured: `count` is a live getter, and destructuring it here would copy today's
    // 0 forever rather than reading the running total at return time.
    const asserter = makeAsserter()
    const { assert } = asserter
    const gzipBytes = await measureBundle(assert)

    const server = serve(0)
    try {
      const origin = `http://localhost:${server.port}`
      await checkConfigContract(origin, assert)
      const { widgetStampMs, configResponseEndMs } = await measurePaint(origin, assert)
      const paintDeltaMs = widgetStampMs - configResponseEndMs
      assert(
        paintDeltaMs <= PAINT_CAP_MS,
        `config-fetch-to-first-paint is ${paintDeltaMs.toFixed(1)}ms, over the ${PAINT_CAP_MS}ms cap`,
      )

      const detail =
        `gzipped agent.js: ${gzipBytes}B (cap ${GZIP_CAP_BYTES}B). ` +
        `config-fetch-to-first-paint: ${paintDeltaMs.toFixed(1)}ms (cap ${PAINT_CAP_MS}ms), ` +
        `widget stamped at ${widgetStampMs.toFixed(1)}ms.`

      return { count: asserter.count, detail }
    } finally {
      server.stop()
    }
  },
}
