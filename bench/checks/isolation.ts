import type { Browser, Page } from '@playwright/test'
import { openBrowser, readConfig } from '../browser'
import type { Check, CheckResult } from '../checks'
import type { ConfigResponse } from '../../packages/agent/src/types'

// H5 `isolation` (BENCHMARKS §1, TASKS.md T9). The claim: the same widget code renders identically
// inside two hostile host pages, because a shadow root plus a defensive reset keeps the host out.
// A difference means the host leaked in — and `ENGINEERING §1.1` forbids fixing that at the source,
// so it has to be fixed in the widget or it is not fixed.
//
// It mounts on the TWO REAL STOREFRONTS, on :4001 and :4002, because that is what BENCHMARKS §1 H5
// and T9's DoD both say and because the alternative is measuring a reproduction of the adversary
// rather than the adversary. VELDE ships a global `*, *::before, *::after` reset; KRACHT ships
// Tailwind preflight. The check reuses a server that is already listening and starts one that is
// not, the same contract `e2e/playwright.config.ts` uses.
//
// The third mount is the one that makes the first two mean anything. Measured, both real regimes
// produce byte-identical shadow computed styles — which is the finding, not a shortcut: neither
// storefront's reset targets the custom element, and a rule on `html`/`body` does not cross a
// shadow boundary at all. A check whose only cases pass by construction proves nothing, so a third
// mount injects a host rule that DOES target `mx-agent` and must be caught.

const SHOPS = [
  { name: 'velde', url: 'http://localhost:4001/', port: 4001, start: ['bun', 'run', 'dev:velde'] },
  {
    name: 'kracht',
    url: 'http://localhost:4002/',
    port: 4002,
    start: ['bun', 'run', 'dev:kracht'],
  },
] as const

/**
 * The leak vectors, stated as a test. Not strawmen: a global reset with `!important` is ordinary
 * on real merchant themes, and the shadow-cascade rule is that a NORMAL declaration in the outer
 * document beats `:host`, while an IMPORTANT one loses to an important `:host`. Both forms are
 * here, because the widget's defence has to answer both.
 *
 * The last two lines are the ones the first version of this check did not have, and they are the
 * door the `:host` reset structurally cannot close on its own: `all` does not reset CUSTOM
 * properties — which is exactly why the `--mx-*` block survives the reset in `css.ts`, and
 * equally why a merchant theme setting `--mx-accent` under a colliding name repainted nine
 * computed properties inside the shadow root while this check stayed green. Added because a
 * review pointed out that every vector here was one the fix had already been designed against;
 * the defence (an important pin on the custom properties, with the preview channel writing
 * important inline to stay above it) came second, not first.
 */
const HOSTILE_CSS = `
  mx-agent { font-size: 40px; letter-spacing: 3px; text-transform: uppercase; }
  * { color: red !important; font-family: cursive !important; direction: rtl !important; }
  mx-agent { --mx-accent: #00ff00 !important; --mx-text-primary: #ff00ff !important; }
  * { --mx-accent: #00ff00; --mx-font-body: cursive; --mx-space-4: 40px; }
`

/**
 * Inherited properties are the whole game — they are the ones that cross a shadow boundary. The
 * non-inherited ones are here too because `all: initial` resets them on the host and a regression
 * that dropped `position`/`z-index`/`pointer-events` would stop the widget being an overlay
 * without changing a single colour.
 */
const PROPERTIES = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'color',
  'textAlign',
  'textIndent',
  'textTransform',
  'textShadow',
  'whiteSpace',
  'direction',
  'visibility',
  'listStyleType',
  'cursor',
  'tabSize',
  'boxSizing',
  'display',
  'position',
  'zIndex',
  'pointerEvents',
  'padding',
  'margin',
  'borderRadius',
  'backgroundColor',
  'boxShadow',
  'width',
  'height',
]

/** `:host` plus the elements that inherit from it rather than re-stating everything themselves. */
const SELECTORS = [
  ':host',
  '.launcher',
  '.launcher-label',
  '.panel',
  '.messages',
  '.msg',
  '.chip',
  '.input',
  '.send',
  '.signature',
]

type Snapshot = Record<string, string>

/**
 * Not just "something answered". Pointed at an unrelated app on the same port, the old form said
 * yes and the check then spent 31 seconds timing out on a missing `mx-agent` with an error message
 * that named neither the port nor the shop. The marker is the storefront's own embed line, which
 * is the one string every page of it carries and the one this check cannot work without.
 */
async function listening(shop: (typeof SHOPS)[number]): Promise<boolean> {
  try {
    const response = await fetch(shop.url, { signal: AbortSignal.timeout(3000) })
    if (!response.ok) return false
    return (await response.text()).includes(`data-shop="${shop.name}"`)
  } catch {
    return false
  }
}

/**
 * Reuse a running storefront, start one that is not — and leave a server this check started
 * running only for the life of the check. `apps/shop-velde/server.ts` calls `Bun.serve` at module
 * scope with a hardcoded port and exports no factory, and turning it into one would be a
 * storefront-source edit, which is the one thing this task may not do [ENGINEERING §1.1]. So it is
 * spawned as a subprocess, exactly as `e2e/playwright.config.ts` does.
 */
async function ensureUp(shop: (typeof SHOPS)[number]): Promise<() => Promise<void>> {
  if (await listening(shop)) return async () => {}
  const proc = Bun.spawn([...shop.start], {
    cwd: `${import.meta.dir}/../..`,
    stdout: 'ignore',
    stderr: 'ignore',
  })
  /*
   * Killed by PORT, not by the pid we hold. `bun run dev:velde` and `next dev` both fork, so the
   * process actually holding the socket is a child of the one `Bun.spawn` returns — measured:
   * after `proc.kill()` the port was still listening, and the NEXT `bun bench` would have
   * "reused" an orphan from the previous one. Only the port this check started is touched.
   */
  const stop = async (): Promise<void> => {
    proc.kill()
    await Bun.$`lsof -ti tcp:${shop.port}`
      .quiet()
      .nothrow()
      .then(async (found) => {
        const pids = found.stdout.toString().trim().split('\n').filter(Boolean)
        for (const pid of pids) await Bun.$`kill ${pid}`.quiet().nothrow()
      })
  }
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (await listening(shop)) return stop
    await Bun.sleep(1000)
  }
  await stop()
  throw new Error(
    `${shop.name} did not answer on ${shop.url} within 90s. Start it with \`${shop.start.join(' ')}\`.`,
  )
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(
    (args: { properties: string[]; selectors: string[] }) => {
      const host = document.querySelector('mx-agent')
      const root = host instanceof HTMLElement ? host.shadowRoot : null
      if (!(host instanceof HTMLElement) || !root) return {}
      const nodeFor = (selector: string): Element | null =>
        selector === ':host' ? host : root.querySelector(selector)
      const entries = args.selectors.flatMap((selector) => {
        const node = nodeFor(selector)
        if (!(node instanceof HTMLElement)) {
          return [[`${selector}|ABSENT`, 'this selector rendered nothing'] as const]
        }
        const style = getComputedStyle(node)
        return args.properties.map(
          (property) => [`${selector}|${property}`, Reflect.get(style, property) ?? ''] as const,
        )
      })
      return Object.fromEntries(entries)
    },
    { properties: PROPERTIES, selectors: SELECTORS },
  )
}

/**
 * Builds the widget from THIS tree, the same command and flags the platform server shells out to
 * on every `/v1/agent.js` request [ENGINEERING §3.13 — assert against the artifact that ships].
 */
async function buildWidget(): Promise<string> {
  const root = `${import.meta.dir}/../..`
  const built = await Bun.$`bun run --filter '@maximal/agent' build`.cwd(root).quiet().nothrow()
  if (built.exitCode !== 0) {
    throw new Error(`agent bundle failed to build:\n${built.stderr.toString()}`)
  }
  return Bun.file(`${root}/packages/agent/dist/agent.js`).text()
}

type ShopRead = {
  url: string
  hostCss?: string
  /** Forced onto the page, so assertion 1 can hold the brand still and change only the host. */
  config?: ConfigResponse
}

/** Loads a storefront, opens the widget, and reads every tracked property off the shadow root. */
async function readShop(browser: Browser, bundle: string, read: ShopRead): Promise<Snapshot> {
  const { url, hostCss, config } = read
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  try {
    // The widget under test is the one in this working copy, never whatever `:4003` is serving.
    await page.route('**/v1/agent.js', (route) =>
      route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: bundle }),
    )
    if (config) {
      await page.route('**/v1/config/**', (route) =>
        route.fulfill({
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(config),
        }),
      )
    }
    if (hostCss) {
      await page.addInitScript((css: string) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style')
          style.textContent = css
          document.head.append(style)
        })
      }, hostCss)
    }
    // `localStorage` caches the config per shop key, so a forced payload would lose to a cached
    // real one on the second visit. A fresh context per read would be heavier; clearing is enough.
    await page.addInitScript(() => {
      try {
        localStorage.clear()
      } catch {
        /* a storefront that blocks storage is the widget's problem, not this check's */
      }
    })
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForSelector('mx-agent', { timeout: 30_000 })
    // Opened, because half the surface only exists once the panel is up.
    await page.evaluate(() => {
      const host = document.querySelector('mx-agent')
      const launcher =
        host instanceof HTMLElement ? host.shadowRoot?.querySelector('.launcher') : null
      if (launcher instanceof HTMLElement) launcher.click()
    })
    await page.waitForTimeout(300)
    return await snapshot(page)
  } finally {
    await page.close()
  }
}

/**
 * The judgement, exported so `bench/fault.test.ts` can hand it two snapshots that differ and prove
 * it says so without booting two storefronts.
 *
 * Nothing is excluded here, and that is the point: every tracked property is compared, including
 * every token-derived one. The caller is what holds the brand constant — assertion 1 forces one
 * config onto both storefronts, assertion 2 reads the same shop twice — so a `--mx-*` difference
 * IS a leak rather than two brands being two brands. The one exclusion lives in `run` as
 * `HOST_DEPENDENT`, named and reasoned, because an exclusion list is how an assertion quietly
 * stops asserting.
 */
export function judgeIdentical(a: Snapshot, b: Snapshot, labelA: string, labelB: string): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  if (keys.size === 0) return [`${labelA}/${labelB}: nothing was measured on either page`]
  return [...keys]
    .sort()
    .filter((key) => a[key] !== b[key])
    .map((key) => `${key}: ${labelA}="${a[key] ?? '(absent)'}" ${labelB}="${b[key] ?? '(absent)'}"`)
}

/**
 * Properties whose value legitimately depends on the HOST rather than on the widget, and are
 * therefore excluded from the cross-host comparison — with the reason, because an exclusion list
 * is how a real assertion quietly becomes a tautology.
 *
 * Exactly one entry, and it is the widget doing its job: `clearStickyBar` lifts the launcher and
 * the panel clear of whatever the storefront has pinned to the bottom edge, and the two shops pin
 * bars of different heights (VELDE 156.562px, KRACHT 143px). A widget that produced the SAME
 * margin on both would be ignoring the host, which is the opposite defect.
 */
const HOST_DEPENDENT = ['.launcher|margin', '.panel|margin']

async function run(): Promise<CheckResult> {
  const stops: (() => Promise<void>)[] = []
  let opened: Browser | undefined
  try {
    for (const shop of SHOPS) stops.push(await ensureUp(shop))
    const bundle = await buildWidget()
    const browser = await openBrowser()
    opened = browser

    const failures: string[] = []
    let compared = 0

    /*
     * Assertion 1 — the DoD's literal sentence: the same widget, on the two hostile storefronts,
     * identical inside the shadow root.
     *
     * ONE brand config is forced onto BOTH shops. The first version of this check compared the
     * two shops each running its own brand, which meant every token-derived property differed by
     * design — so it fell back to comparing six properties that are pinned `!important` on
     * `:host` and cannot move whatever the host does. It compared 54 constants and could not
     * fail; a review injected a one-sided leak and the count stayed at zero. Holding the brand
     * still is the only way the sentence means anything.
     */
    const shared = await readConfig('apps/platform/config/velde.json')
    const crossHost = await Promise.all(
      SHOPS.map((shop) => readShop(browser, bundle, { url: shop.url, config: shared })),
    )
    const [onVelde, onKracht] = crossHost
    if (onVelde === undefined || onKracht === undefined)
      throw new Error('H5: need both storefronts')
    const drop = (snap: Snapshot): Snapshot =>
      Object.fromEntries(Object.entries(snap).filter(([key]) => !HOST_DEPENDENT.includes(key)))
    failures.push(
      ...judgeIdentical(drop(onVelde), drop(onKracht), 'on velde', 'on kracht').map(
        (row) => `same config, different host: ${row}`,
      ),
    )
    compared += Object.keys(drop(onVelde)).length

    /*
     * Assertion 2 — the same shop, same brand, with a hostile stylesheet added to the HOST
     * document. Every differing property is one that crossed the shadow boundary, and
     * `ENGINEERING §1.1` forbids fixing that at the source.
     */
    for (const shop of SHOPS) {
      const config = await readConfig(`apps/platform/config/${shop.name}.json`)
      const clean = await readShop(browser, bundle, { url: shop.url, config })
      const hostile = await readShop(browser, bundle, {
        url: shop.url,
        config,
        hostCss: HOSTILE_CSS,
      })
      const leaked = judgeIdentical(clean, hostile, `${shop.name} clean`, `${shop.name} hostile`)
      compared += Object.keys(clean).length + Object.keys(hostile).length
      if (leaked.length > 0) {
        failures.push(
          `${shop.name}: ${leaked.length} propert(ies) leaked in from the host page — ${leaked
            .slice(0, 6)
            .join(' · ')}${leaked.length > 6 ? ` · …and ${leaked.length - 6} more` : ''}`,
        )
      }
    }

    return {
      count: compared,
      failures,
      detail:
        `${compared} computed properties compared inside the shadow root. One config forced onto both ` +
        `live storefronts (VELDE's global \`*\` reset, KRACHT's Tailwind preflight), then each shop ` +
        `read again with a hostile stylesheet on the host document. \`/v1/agent.js\` is served from ` +
        `this working copy, not from :4003, so the check measures the tree it runs in. Excluded from ` +
        `the cross-host comparison: ${HOST_DEPENDENT.join(', ')} — the deliberate sticky-bar lift, ` +
        `which differs because the two shops pin bars of different heights.`,
    }
  } finally {
    await opened?.close()
    for (const stop of stops) await stop()
  }
}

export const isolation: Check = { name: 'isolation', tier: 'HARD', run }
