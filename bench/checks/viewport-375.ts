import type { Browser, Page } from '@playwright/test'
import { HELDER, KRACHT, VELDE } from '@maximal/tokens'
import type { MerchantTokens } from '@maximal/tokens'
import { buildGallery, mount, openBrowser, readConfig } from '../browser'
import type { Check, CheckResult } from '../checks'
import { judgeOutsideViewport, judgeOverflow, measureList } from '../overflow'

// H4 `viewport-375` (BENCHMARKS §1, TASKS.md T9). 375px is not a responsive afterthought in this
// project, it is the default development viewport [PRINCIPLES §1.3] — so it gets a gate rather
// than a habit.
//
// Three brands, not two. HELDER is the pale-yellow clamp brand: its derived `textMuted` is the one
// hue-tinted olive in the set and its type ramp is the widest, so it is the brand most likely to
// push a line past the edge. A 375px gate that only ever sees the two brands the layout was drawn
// against is a gate that agrees with its author.
//
// H2 also measures overflow, at 375 x 5600, and that is a different question: it renders tall so a
// screenshot can hold every block at once. This one renders the real phone, 375 x 667, where the
// message list scrolls and the panel is inset to all four edges.

const VIEWPORT = { width: 375, height: 667 }

/** One frame, so a viewport change has actually been laid out before anything is measured. */
const settle = (page: Page): Promise<unknown> =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))))

/**
 * A viewport the height of a phone with the software keyboard up. Playwright cannot produce a real
 * keyboard inset — see the `detail` string — but it can produce the short viewport, which is what
 * the composer has to survive.
 */
const KEYBOARD_VIEWPORT = { width: 375, height: 400 }

type Brand = { name: string; merchant: MerchantTokens; configPath: string }

const BRANDS: Brand[] = [
  { name: 'velde', merchant: VELDE, configPath: 'apps/platform/config/velde.json' },
  { name: 'kracht', merchant: KRACHT, configPath: 'apps/platform/config/kracht.json' },
  { name: 'helder', merchant: HELDER, configPath: 'apps/platform/config/helder.json' },
]

/**
 * The composer is the one control a shopper types into, so it is the one that must never end up
 * under the fold. Measured against the LIVE viewport rather than the nominal one, because the
 * whole point of the short-viewport pass is that the two disagree.
 */
async function composerBelowFold(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const host = document.querySelector('mx-agent')
    const root = host instanceof HTMLElement ? host.shadowRoot : null
    const composer = root?.querySelector('.composer')
    if (!(composer instanceof HTMLElement)) return 'no composer rendered'
    const box = composer.getBoundingClientRect()
    const fold = window.visualViewport?.height ?? window.innerHeight
    if (box.bottom <= fold + 0.5) return null
    return `composer bottom ${Math.round(box.bottom)}px is below the fold at ${Math.round(fold)}px`
  })
}

/** The closed state is a surface too, and it is the one every shopper sees first. */
async function launcherOutsideViewport(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const host = document.querySelector('mx-agent')
    const root = host instanceof HTMLElement ? host.shadowRoot : null
    const launcher = root?.querySelector('.launcher')
    if (!(launcher instanceof HTMLElement)) return 'no launcher rendered'
    const box = launcher.getBoundingClientRect()
    const outside = Math.max(
      0,
      -box.left,
      -box.top,
      box.right - document.documentElement.clientWidth,
      box.bottom - window.innerHeight,
    )
    return outside > 0.5 ? `launcher sticks ${Math.round(outside)}px outside the viewport` : null
  })
}

/** One brand, both surfaces. Returns what it found rather than throwing at the first thing. */
async function measureBrand(
  browser: Browser,
  bundle: string,
  brand: Brand,
): Promise<{ failures: string[]; measured: number }> {
  const failures: string[] = []
  let measured = 0
  const config = await readConfig(brand.configPath)

  const page = await mount(browser, bundle, config, { viewport: VIEWPORT })
  try {
    const measurements = await measureList(page)
    measured += measurements.length
    if (measurements.length === 0) {
      return { failures: [`${brand.name}: nothing rendered at ${VIEWPORT.width}px`], measured }
    }

    for (const row of judgeOverflow(measurements)) {
      failures.push(
        `${brand.name}: horizontal overflow — ${row.element} ${row.scrollWidth}>${row.clientWidth}`,
      )
    }
    for (const row of judgeOutsideViewport(measurements)) failures.push(`${brand.name}: ${row}`)

    const composer = await composerBelowFold(page)
    if (composer) failures.push(`${brand.name}, panel open: ${composer}`)

    // Short viewport: the composer has to stay reachable when the page gets 267px shorter.
    await page.setViewportSize(KEYBOARD_VIEWPORT)
    await settle(page)
    const squeezed = await composerBelowFold(page)
    if (squeezed) failures.push(`${brand.name}, ${KEYBOARD_VIEWPORT.height}px tall: ${squeezed}`)
    measured += 2
  } finally {
    await page.close()
  }

  // The closed state, on its own page so the open one is not reused mid-realm.
  const closed = await mount(browser, bundle, config, { viewport: VIEWPORT })
  try {
    await closed.evaluate(() => {
      const host = document.querySelector('mx-agent')
      const close = host instanceof HTMLElement ? host.shadowRoot?.querySelector('.close') : null
      if (close instanceof HTMLElement) close.click()
    })
    await settle(closed)
    const stray = await launcherOutsideViewport(closed)
    if (stray) failures.push(`${brand.name}, panel closed: ${stray}`)
    measured += 1
  } finally {
    await closed.close()
  }

  return { failures, measured }
}

async function run(): Promise<CheckResult> {
  const bundle = await buildGallery()
  const browser: Browser = await openBrowser()
  const failures: string[] = []
  let measured = 0

  try {
    for (const brand of BRANDS) {
      const result = await measureBrand(browser, bundle, brand)
      failures.push(...result.failures)
      measured += result.measured
    }

    return {
      count: measured,
      failures,
      detail:
        `${measured} measurements across ${BRANDS.length} brands (${BRANDS.map((b) => b.name).join(', ')}) ` +
        `at ${VIEWPORT.width}x${VIEWPORT.height}, panel open and closed, plus a ${KEYBOARD_VIEWPORT.height}px-tall pass. ` +
        `Named gap: a real software-keyboard inset cannot be produced headless — Playwright's viewport moves ` +
        `\`innerHeight\` and \`visualViewport.height\` together, while a keyboard moves only the second. This covers ` +
        `the short-viewport half of BENCHMARKS' "composer above the keyboard inset"; the inset half is proven on a ` +
        `phone, by hand, and is reported rather than claimed. [ENGINEERING §3.9]`,
    }
  } finally {
    await browser.close()
  }
}

export const viewport375: Check = { name: 'viewport-375', tier: 'HARD', run }
