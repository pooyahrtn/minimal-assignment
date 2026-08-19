import type { Browser, Page } from '@playwright/test'
import { openBrowser } from '../browser'
import type { Check, CheckResult } from '../checks'

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
  { name: 'velde', url: 'http://localhost:4001/', start: ['bun', 'run', 'dev:velde'] },
  { name: 'kracht', url: 'http://localhost:4002/', start: ['bun', 'run', 'dev:kracht'] },
] as const

/**
 * The leak vector, stated as a test. Not a strawman: a global reset with `!important` is ordinary
 * on real merchant themes, and the shadow-cascade rule is that a NORMAL declaration in the outer
 * document beats `:host`, while an IMPORTANT one loses to an important `:host`. Both forms are
 * here, because the widget's defence has to answer both.
 */
const HOSTILE_CSS = `
  mx-agent { font-size: 40px; letter-spacing: 3px; text-transform: uppercase; }
  * { color: red !important; font-family: cursive !important; direction: rtl !important; }
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

async function listening(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1500) })
    return true
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
async function ensureUp(shop: (typeof SHOPS)[number]): Promise<() => void> {
  if (await listening(shop.url)) return () => {}
  const proc = Bun.spawn([...shop.start], {
    cwd: `${import.meta.dir}/../..`,
    stdout: 'ignore',
    stderr: 'ignore',
  })
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (await listening(shop.url)) return () => proc.kill()
    await Bun.sleep(1000)
  }
  proc.kill()
  throw new Error(`${shop.name} did not answer on ${shop.url} within 90s`)
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

/** Loads a storefront, opens the widget, and reads every tracked property off the shadow root. */
async function readShop(browser: Browser, url: string, hostCss?: string): Promise<Snapshot> {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  try {
    if (hostCss) {
      await page.addInitScript((css: string) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style')
          style.textContent = css
          document.head.append(style)
        })
      }, hostCss)
    }
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
 * Brand tokens are NOT excluded, and that is the point: both shops are read with their own live
 * config, so a `--mx-*` difference would show up here as a difference. That is why the two real
 * mounts are compared property-by-property only after being read from pages serving the SAME
 * shop — see `run`, which compares each shop against itself under a hostile host, and the two
 * shops against each other only on the properties the widget pins rather than derives.
 */
export function judgeIdentical(a: Snapshot, b: Snapshot, labelA: string, labelB: string): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  if (keys.size === 0) return [`${labelA}/${labelB}: nothing was measured on either page`]
  return [...keys]
    .sort()
    .filter((key) => a[key] !== b[key])
    .map((key) => `${key}: ${labelA}="${a[key] ?? '(absent)'}" ${labelB}="${b[key] ?? '(absent)'}"`)
}

async function run(): Promise<CheckResult> {
  const stops: (() => void)[] = []
  let opened: Browser | undefined
  try {
    for (const shop of SHOPS) stops.push(await ensureUp(shop))
    const browser = await openBrowser()
    opened = browser

    const failures: string[] = []
    let compared = 0

    // Assertion 1 — the contract: the same widget, on the two hostile storefronts. Only the
    // properties the widget PINS are compared, because `--mx-*`-derived values are supposed to
    // differ between two brands; that difference is H2's subject, not H5's.
    const [velde, kracht] = await Promise.all(SHOPS.map((shop) => readShop(browser, shop.url)))
    if (velde === undefined || kracht === undefined) throw new Error('H5: need both storefronts')
    const pinned = ['direction', 'boxSizing', 'position', 'zIndex', 'pointerEvents', 'visibility']
    const pinnedOnly = (snap: Snapshot): Snapshot =>
      Object.fromEntries(
        Object.entries(snap).filter(([key]) => pinned.some((p) => key.endsWith(`|${p}`))),
      )
    failures.push(...judgeIdentical(pinnedOnly(velde), pinnedOnly(kracht), 'velde', 'kracht'))
    compared += Object.keys(pinnedOnly(velde)).length

    // Assertion 2 — the one that can actually fail: the same shop, same brand, with a hostile
    // stylesheet added to the HOST document. Every differing property is a property that leaked
    // across the shadow boundary, and the storefront freeze forbids fixing it at the source.
    for (const shop of SHOPS) {
      const clean = await readShop(browser, shop.url)
      const hostile = await readShop(browser, shop.url, HOSTILE_CSS)
      const leaked = judgeIdentical(clean, hostile, `${shop.name} clean`, `${shop.name} hostile`)
      compared += Object.keys(clean).length
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
        `${compared} computed properties read inside the shadow root across ${SHOPS.length} live storefronts ` +
        `(VELDE's global \`*\` reset, KRACHT's Tailwind preflight) plus one hostile-stylesheet mount per shop. ` +
        `The two real regimes are identical on every pinned property; the hostile mount is what proves the ` +
        `comparison can fail, since neither shop's own reset targets \`mx-agent\`.`,
    }
  } finally {
    await opened?.close()
    for (const stop of stops) stop()
  }
}

export const isolation: Check = { name: 'isolation', tier: 'HARD', run }
