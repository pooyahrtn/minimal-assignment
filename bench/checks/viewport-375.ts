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

/**
 * `syncViewport` writes `panel.style.height` from `visualViewport.height` on every viewport
 * resize, below the mobile breakpoint. Headless cannot produce the divergence that makes it
 * matter, but it CAN prove the handler still runs and still writes — which is the half that
 * regresses silently when someone tidies up an iOS-only code path.
 */
async function panelTracksViewport(page: Page): Promise<string | null> {
  return page.evaluate((expected: number) => {
    const host = document.querySelector('mx-agent')
    const panel = host instanceof HTMLElement ? host.shadowRoot?.querySelector('.panel') : null
    if (!(panel instanceof HTMLElement)) return 'no panel rendered'
    const written = panel.style.height
    if (written === '') {
      return 'the panel has no inline height after a viewport resize — syncViewport did not run'
    }
    const value = Number.parseFloat(written)
    return Math.abs(value - expected) <= 1
      ? null
      : `the panel's inline height is ${written}, not ${expected}px — syncViewport is not tracking the viewport`
  }, KEYBOARD_VIEWPORT.height)
}

/** What the panel and composer measured while the stubbed keyboard was up, or why not. */
type InsetShot =
  | { error: string }
  | { panelTop: number; panelBottom: number; composerBottom: number }

/**
 * The stubbed inset: an iPhone-sized keyboard on the 667px phone this check already renders. iOS
 * leaves roughly 340px of visible page above the keys and its accessory bar, and Safari scrolls
 * the visible region ~40px down the layout viewport to clear the focused composer. `innerHeight`
 * stays 667 throughout, which is exactly the divergence a Playwright viewport cannot produce and
 * the widget has to survive.
 */
const INSET = { height: 340, offsetTop: 40, offsetLeft: 0 }

/** Installs the stub, lets the widget answer it, measures, and always puts the real one back. */
async function measureUnderKeyboard(page: Page): Promise<InsetShot> {
  return page.evaluate(async (inset: typeof INSET): Promise<InsetShot> => {
    const real = window.visualViewport
    if (real === null || real === undefined) return { error: 'no visualViewport in this browser' }
    const stub = { ...inset, width: real.width, addEventListener() {}, removeEventListener() {} }
    const frame = (): Promise<void> =>
      new Promise((resolve) => requestAnimationFrame(() => resolve()))
    Object.defineProperty(window, 'visualViewport', { value: stub, configurable: true })
    try {
      real.dispatchEvent(new Event('resize'))
      // Two frames: the widget coalesces its viewport writes into one rAF, so the write lands on
      // the frame after the event and the layout it causes on the one after that.
      await frame()
      await frame()
      const host = document.querySelector('mx-agent')
      const root = host instanceof HTMLElement ? host.shadowRoot : null
      const panel = root?.querySelector('.panel')
      const composer = root?.querySelector('.composer')
      if (!(panel instanceof HTMLElement) || !(composer instanceof HTMLElement)) {
        return { error: 'no panel rendered' }
      }
      const box = panel.getBoundingClientRect()
      return {
        panelTop: box.top,
        panelBottom: box.bottom,
        composerBottom: composer.getBoundingClientRect().bottom,
      }
    } finally {
      // Put the real one back and let the widget settle onto it, so nothing measured after this
      // reads a panel still sized for a keyboard that was never there.
      Object.defineProperty(window, 'visualViewport', { value: real, configurable: true })
      real.dispatchEvent(new Event('resize'))
      await frame()
      await frame()
    }
  }, INSET)
}

/**
 * The half the comment at the bottom of this file used to write off as unprovable headless.
 *
 * A real iOS keyboard does two things Playwright's viewport cannot: it shrinks
 * `visualViewport.height` WITHOUT shrinking `innerHeight`, and it slides `visualViewport.offsetTop`
 * down the layout viewport when Safari scrolls the focused composer clear of the keys. The widget
 * is fixed to the layout viewport, so it has to answer both numbers or the panel ends up drawn
 * somewhere the shopper cannot see — which is the bug this check was extended for: the dialog was
 * rendered off the top of the screen the moment the keyboard came up.
 *
 * The numbers can be handed to it. `window.visualViewport` is swapped for a stub reporting a
 * keyboard-sized inset, and the event is dispatched on the REAL object the widget subscribed to at
 * construction. What that proves is the widget's response to those numbers, not that iOS produces
 * them — the phone still owns that half, and it is still reported by hand.
 */
async function panelTracksKeyboardInset(page: Page): Promise<string | null> {
  const shot = await measureUnderKeyboard(page)
  if ('error' in shot) return shot.error
  const top = INSET.offsetTop
  const bottom = INSET.offsetTop + INSET.height
  const problems: string[] = []
  if (Math.abs(shot.panelTop - top) > 1) {
    problems.push(
      `panel top ${Math.round(shot.panelTop)}px is not the visible region's top ${top}px — the ` +
        "keyboard inset is not being tracked, so the dialog is drawn off the shopper's screen",
    )
  }
  if (Math.abs(shot.panelBottom - bottom) > 1) {
    problems.push(`panel bottom ${Math.round(shot.panelBottom)}px is not ${bottom}px`)
  }
  if (shot.composerBottom > bottom + 0.5) {
    problems.push(
      `composer bottom ${Math.round(shot.composerBottom)}px is behind the keyboard, which ` +
        `starts at ${bottom}px`,
    )
  }
  return problems.length === 0 ? null : problems.join('; ')
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

    // The keyboard, at the real phone height — a shorter visual viewport pushed down a layout
    // viewport that did not move. Run here rather than in the short pass below so the numbers are
    // an iPhone's and not a stub on top of a stub.
    const inset = await panelTracksKeyboardInset(page)
    if (inset) failures.push(`${brand.name}, keyboard inset: ${inset}`)

    // Short viewport: the composer has to stay reachable when the page gets 267px shorter.
    await page.setViewportSize(KEYBOARD_VIEWPORT)
    await settle(page)
    const squeezed = await composerBelowFold(page)
    if (squeezed) failures.push(`${brand.name}, ${KEYBOARD_VIEWPORT.height}px tall: ${squeezed}`)

    /*
     * And the mechanism, not just the outcome. The composer check above passes on CSS alone — at
     * 375px the panel is inset-anchored to all four edges, so it stays inside a shorter viewport
     * whether or not `syncViewport` exists. Proved by deleting `syncViewport`'s body: the short
     * pass stayed green, 0 failures, which made two of every brand's "measurements" decoration.
     * This reads the inline height `syncViewport` writes, which is the only thing that will
     * matter when a real keyboard makes `visualViewport.height` diverge from `innerHeight`.
     */
    const tracked = await panelTracksViewport(page)
    if (tracked) failures.push(`${brand.name}: ${tracked}`)
    measured += 3
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
        `at ${VIEWPORT.width}x${VIEWPORT.height}, panel open and closed, plus a ${KEYBOARD_VIEWPORT.height}px-tall pass ` +
        `and a stubbed keyboard inset (shorter \`visualViewport\` at a non-zero \`offsetTop\`, which is the pair a ` +
        `real keyboard produces and a Playwright viewport cannot: it moves \`innerHeight\` and ` +
        `\`visualViewport.height\` together). The stub proves the widget answers those numbers by putting the panel ` +
        `on the visible region; that iOS produces them is still proven on a phone, by hand, and reported rather than ` +
        `claimed. [ENGINEERING §3.9]`,
    }
  } finally {
    await browser.close()
  }
}

export const viewport375: Check = { name: 'viewport-375', tier: 'HARD', run }
