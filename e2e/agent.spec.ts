import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { isOccludedAtCenter, isStruckThrough } from './dom'

// The widget half of T12. Both storefronts carry exactly one identical line —
// `<script src=".../v1/agent.js" data-shop="velde|kracht" async></script>` — that mounts
// `<mx-agent>` with an OPEN shadow root [PRINCIPLES §5]. Playwright's locators pierce an open
// shadow root automatically, so every selector below is a role/text/CSS query reachable the same
// way a shopper reaches it — never a `data-testid`, inside the widget's DOM either, even though
// nothing here is storefront markup and the freeze [ENGINEERING §1.1] wouldn't forbid one there.
//
// Handles, launcher names, chip labels and opening messages were read out of
// packages/agent/src/{brain/*.json,widget.ts,css.ts} and tools/build-config.ts's SHOPS map — none
// are guessed. [ENGINEERING §3.1]

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

type Brand = {
  readonly name: 'velde' | 'kracht'
  readonly base: string
  readonly pdp: string
  /** The widget's accessible name, as computed by the browser — see the hand-off note on why this
   *  is sentence case for VELDE even though the rendered pixels are tracked caps. */
  readonly launcherName: string
  readonly panelName: string
  readonly composerPlaceholder: string
  readonly opening: string
  readonly stickyButtonName: string
  readonly cookieAccept: (page: Page) => Locator
}

const VELDE: Brand = {
  name: 'velde',
  base: 'http://localhost:4001',
  pdp: '/products/noord-wool-overcoat',
  launcherName: 'Help me choose',
  panelName: 'VELDE',
  composerPlaceholder: 'What is it for?',
  opening:
    'I need a jacket I can wear to the office and on the bike. Black, nothing shiny, and ideally under €250.',
  stickyButtonName: 'Add to bag',
  cookieAccept: (page) =>
    page.getByRole('region', { name: 'Cookie notice' }).getByRole('button', { name: 'Accept all' }),
}

const KRACHT: Brand = {
  name: 'kracht',
  base: 'http://localhost:4002',
  pdp: '/product/whey-classic-1kg-chocolate',
  launcherName: 'Ask Joep',
  panelName: 'Joep',
  composerPlaceholder: 'Tell me what you need',
  opening: "I'm after a protein shake with no sweeteners, lactose-free, and ideally under €30.",
  stickyButtonName: 'In my basket',
  cookieAccept: (page) => page.getByRole('button', { name: 'Accept all' }),
}

const BRANDS = [VELDE, KRACHT] as const

// --- helpers over the widget's own DOM ----------------------------------------------------------

function launcherOf(page: Page, brand: Brand): Locator {
  return page.getByRole('button', { name: brand.launcherName, exact: true })
}

function panelOf(page: Page, brand: Brand): Locator {
  return page.getByRole('dialog', { name: brand.panelName })
}

function composerOf(page: Page, brand: Brand): Locator {
  return page.getByRole('textbox', { name: brand.composerPlaceholder, exact: true })
}

async function openPanel(page: Page, brand: Brand): Promise<void> {
  await launcherOf(page, brand).click()
  await expect(panelOf(page, brand)).toBeVisible()
}

async function ask(page: Page, brand: Brand, text: string): Promise<void> {
  const composer = composerOf(page, brand)
  await composer.fill(text)
  await composer.press('Enter')
}

/** `document.activeElement` stops at the shadow HOST for anything inside an open shadow root, so
 *  the only correct "is this focused" check reads the root the element itself belongs to. */
async function isFocused(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    const root = el.getRootNode()
    return root instanceof ShadowRoot ? root.activeElement === el : document.activeElement === el
  })
}

/** Presses Tab until `target` is focused or `limit` presses are exhausted — this proves reachability
 *  by actually tabbing through the real page (nav, product grid, footer and all), not by calling
 *  `.focus()` and asserting the tautology. */
async function tabUntilFocused(page: Page, target: Locator, limit = 200): Promise<boolean> {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab')
    if (await isFocused(target)) return true
  }
  return false
}

/** True while focus sits anywhere inside the open panel's own shadow subtree. */
async function focusIsInsidePanel(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const host = document.querySelector('mx-agent')
    const root = host?.shadowRoot ?? null
    if (root === null) return false
    const active = root.activeElement
    const panel = root.querySelector('.panel')
    if (active === null || panel === null) return false
    return panel.contains(active)
  })
}

type Box = { x: number; y: number; width: number; height: number }

/** Standard axis-aligned bounding-box intersection test. */
function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

// --- KRACHT catalog, read straight off disk so the graded-flow price is DERIVED, never hardcoded -

type CatalogEntry = { title: string; price: number; tags: string[] }

/** Same runtime-guard shape as packages/agent/src/brain/catalog.ts's `isProduct` — no `as`. */
function isCatalogEntry(value: unknown): value is CatalogEntry {
  if (typeof value !== 'object' || value === null) return false
  const title = Reflect.get(value, 'title')
  const price = Reflect.get(value, 'price')
  const tags = Reflect.get(value, 'tags')
  return (
    typeof title === 'string' &&
    typeof price === 'number' &&
    Array.isArray(tags) &&
    tags.every((tag) => typeof tag === 'string')
  )
}

function readCatalog(fileName: string): CatalogEntry[] {
  const raw = readFileSync(join(repoRoot, 'packages/agent/src/brain', fileName), 'utf-8')
  const data: unknown = JSON.parse(raw)
  if (!Array.isArray(data)) throw new Error(`${fileName}: catalog must be a JSON array`)
  return data.map((entry) => {
    if (!isCatalogEntry(entry)) {
      throw new Error(`${fileName}: not a valid catalog entry: ${JSON.stringify(entry)}`)
    }
    return entry
  })
}

/** The widget formats money with `Intl.NumberFormat(undefined, …)` (packages/agent/src/converse.ts
 *  `money()`), which follows the BROWSER's locale — €32.95 in one, € 32,95 in another. Matching the
 *  digits with either decimal separator is what stays correct across that, rather than hardcoding
 *  one rendering. */
function priceDigits(price: number): RegExp {
  const [whole, cents] = price.toFixed(2).split('.')
  return new RegExp(`${whole}[.,]${cents}`)
}

const krachtCatalog = readCatalog('catalog.kracht.json')
const cheapestKrachtMatch = krachtCatalog
  .filter((p) => p.tags.includes('no-sweeteners') && p.tags.includes('lactose-free'))
  .sort((a, b) => a.price - b.price)[0]
if (cheapestKrachtMatch === undefined) {
  throw new Error(
    'no KRACHT product carries both no-sweeteners and lactose-free — the graded-flow spec assumes one exists',
  )
}

// ---------------------------------------------------------------------------------------------

test.describe('one line, a branded widget', () => {
  test('the launcher exists on a storefront page, named per brand, with geometry that differs between brands', async ({
    page,
  }) => {
    await page.goto(`${VELDE.base}${VELDE.pdp}`)
    const veldeLauncher = launcherOf(page, VELDE)
    await expect(veldeLauncher).toBeVisible()
    const veldeRadius = await veldeLauncher.evaluate((el) => getComputedStyle(el).borderRadius)

    await page.goto(`${KRACHT.base}${KRACHT.pdp}`)
    const krachtLauncher = launcherOf(page, KRACHT)
    await expect(krachtLauncher).toBeVisible()
    const krachtRadius = await krachtLauncher.evaluate((el) => getComputedStyle(el).borderRadius)

    // A launcher that merely exists proves nothing: the two accessible names above (asserted via
    // `launcherOf`, which locates by exact name) already differ by construction, but a name is
    // just a string a merchant could paste. `border-radius` is a genuine rendering decision —
    // KRACHT's launcher is a pill (999px), VELDE's is square (radius token '0' -> 0px) — so a
    // mismatch here means the token pipeline, not just the copy, is actually brand-specific.
    expect(veldeRadius).not.toBe(krachtRadius)
  })
})

test.describe('no unbranded flash', () => {
  for (const brand of BRANDS) {
    test(`${brand.name}: the launcher already carries its final geometry the instant it exists`, async ({
      page,
    }) => {
      // Captured on the very DOM mutation that first inserts `<mx-agent>` into the page. Its
      // shadow root (stylesheet, launcher, panel) is built synchronously inside the MxAgent
      // constructor — BEFORE boot.ts appends it to <body> — so the moment the element becomes
      // observable at all is also the moment it is fully styled. `addInitScript` runs before any
      // of the page's own scripts, on every navigation, which is what lets this observer exist
      // before the widget's script does.
      //
      // What this proves: there is no moment where `<mx-agent>` exists in the DOM without its
      // final brand geometry already applied — first-observed === settled, not "eventually equal".
      // What it does NOT prove: that the browser never composited an unbranded frame before this
      // mutation ran. A frame painted and discarded without a DOM mutation is invisible to any
      // Playwright assertion — showing THAT would need a trace/video, and reading one is a human
      // step, not something this test can assert.
      await page.addInitScript(() => {
        const radiusOf = (): string | null => {
          const host = document.querySelector('mx-agent')
          const launcher = host?.shadowRoot?.querySelector('.launcher')
          return launcher instanceof HTMLElement ? getComputedStyle(launcher).borderRadius : null
        }
        const existing = radiusOf()
        if (existing !== null) {
          Reflect.set(window, '__mxFirstLauncherRadius', existing)
          return
        }
        const observer = new MutationObserver(() => {
          const radius = radiusOf()
          if (radius !== null) {
            Reflect.set(window, '__mxFirstLauncherRadius', radius)
            observer.disconnect()
          }
        })
        // `document`, not `document.documentElement`: at the point an init script runs, the
        // navigation has not parsed an <html> element yet, so `documentElement` is still null and
        // observing it is a silent no-op. `document` itself always exists.
        observer.observe(document, { childList: true, subtree: true })
      })

      await page.goto(`${brand.base}${brand.pdp}`)
      const launcher = launcherOf(page, brand)
      await expect(launcher).toBeVisible()
      const settled = await launcher.evaluate((el) => getComputedStyle(el).borderRadius)
      const first = await page.evaluate((): string | null => {
        const value = Reflect.get(window, '__mxFirstLauncherRadius')
        return typeof value === 'string' ? value : null
      })
      expect(first).not.toBeNull()
      expect(first).toBe(settled)
    })
  }
})

test.describe('the graded flow — KRACHT reaches the obstacle', () => {
  test('the verbatim opening message produces >=3 chips and an obstacle naming the blocking constraint and a real, catalog-derived price', async ({
    page,
  }) => {
    await page.goto(`${KRACHT.base}${KRACHT.pdp}`)
    await openPanel(page, KRACHT)
    await ask(page, KRACHT, KRACHT.opening)

    const chips = page.locator('.chip')
    await expect.poll(() => chips.count()).toBeGreaterThanOrEqual(3)

    const obstacle = page.locator('.msg[data-from="agent"]').last()
    await expect(obstacle).toContainText('under €30')
    // Cheapest KRACHT product carrying both `no-sweeteners` and `lactose-free`, computed from
    // catalog.kracht.json above — not the literal "€32.95" a prior merchandising pass happened to
    // produce. [ENGINEERING §2.3 self-check requirement: re-derive, don't hardcode.]
    await expect(obstacle).toHaveText(priceDigits(cheapestKrachtMatch.price))
  })
})

test.describe('drop and restore the blocking chip — KRACHT', () => {
  test('dropping the blocking chip strikes it through in place without evicting it, and surfaces results; restoring brings the obstacle back', async ({
    page,
  }) => {
    await page.goto(`${KRACHT.base}${KRACHT.pdp}`)
    await openPanel(page, KRACHT)
    await ask(page, KRACHT, KRACHT.opening)

    const chips = page.locator('.chip')
    await expect.poll(() => chips.count()).toBeGreaterThanOrEqual(3)
    const chipCountBefore = await chips.count()

    const dropButton = page.getByRole('button', { name: 'Drop under €30', exact: true })
    await expect(dropButton).toBeVisible()
    await dropButton.click()

    // The chip row is replaced wholesale on every update [ENGINEERING §2.10], so the dropped chip
    // is a NEW element — locate it by its new aria-label rather than holding a stale reference.
    const droppedChip = page.getByRole('button', { name: 'Put under €30 back', exact: true })
    await expect(droppedChip).toBeVisible()
    expect(await isStruckThrough(droppedChip)).toBe(true)
    // Struck through, never evicted: the row is both the brief and the receipt.
    await expect(chips).toHaveCount(chipCountBefore)

    await expect(page.getByText("Here's what fits:", { exact: true })).toBeVisible()
    await expect(page.getByText(cheapestKrachtMatch.title, { exact: false })).toBeVisible()

    await droppedChip.click()
    const restoredChip = page.getByRole('button', { name: 'Drop under €30', exact: true })
    await expect(restoredChip).toBeVisible()
    expect(await isStruckThrough(restoredChip)).toBe(false)
    await expect(chips).toHaveCount(chipCountBefore)

    const obstacleAgain = page.locator('.msg[data-from="agent"]').last()
    await expect(obstacleAgain).toContainText('under €30')
    await expect(obstacleAgain).toHaveText(priceDigits(cheapestKrachtMatch.price))
  })
})

test.describe('VELDE resolves happily', () => {
  test('the verbatim opening message returns a non-empty recommendation and no obstacle sentence', async ({
    page,
  }) => {
    await page.goto(`${VELDE.base}${VELDE.pdp}`)
    await openPanel(page, VELDE)
    await ask(page, VELDE, VELDE.opening)

    // greeting + "Matches:" lead-in + at least one product line, with no clarify/obstacle wording
    // ever taking one of those slots.
    const agentMessages = page.locator('.msg[data-from="agent"]')
    await expect.poll(() => agentMessages.count()).toBeGreaterThanOrEqual(3)
    await expect(page.getByText('Matches:', { exact: true })).toBeVisible()

    // The asymmetry is deliberate: VELDE's catalog clears jacket + office-ready + bike-ready +
    // black + matte finish + under €250 all at once, KRACHT's has nothing under both
    // `no sweeteners` and `lactose-free` AND under €30 — that gap is the whole point of the demo,
    // and this pins the happy side of it down.
    await expect(page.getByText('No match on all of it', { exact: false })).toHaveCount(0)
  })
})

test.describe('keyboard', () => {
  for (const brand of BRANDS) {
    test(`${brand.name}: Tab reaches the launcher, Enter opens the panel, Tab is trapped inside, Esc closes and returns focus`, async ({
      page,
    }) => {
      await page.goto(`${brand.base}${brand.pdp}`)
      const launcher = launcherOf(page, brand)
      await expect(launcher).toBeVisible()

      expect(await tabUntilFocused(page, launcher)).toBe(true)

      await page.keyboard.press('Enter')
      const panel = panelOf(page, brand)
      await expect(panel).toBeVisible()
      expect(await focusIsInsidePanel(page)).toBe(true)

      // More Tabs than the panel has focusable stops right after opening (close button, composer
      // input, send button — no chips sent yet), so this exercises both edges of the trap.
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('Tab')
        expect(await focusIsInsidePanel(page)).toBe(true)
      }

      await page.keyboard.press('Escape')
      await expect(panel).toBeHidden()
      expect(await isFocused(launcher)).toBe(true)
    })
  }
})

test.describe('375px', () => {
  for (const brand of BRANDS) {
    test(`${brand.name}: the panel is full height, the composer is reachable, chips wrap, and the launcher does not overlap the sticky add-to-cart bar`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', '375px is the mobile project only')

      await page.goto(`${brand.base}${brand.pdp}`)
      await brand.cookieAccept(page).click()

      const launcher = launcherOf(page, brand)
      await expect(launcher).toBeVisible()
      const stickyButton = page.getByRole('button', { name: brand.stickyButtonName }).last()
      await expect(stickyButton).toBeVisible()

      // isOccludedAtCenter alone can't catch an overlap here: the launcher sits at the 32-bit
      // z-index ceiling [packages/agent/src/css.ts LAUNCHER_Z_INDEX], so it always wins paint
      // order at any point it shares with the sticky bar regardless of geometry — a center-point
      // occlusion check would read "nothing occludes the launcher" even while it visually covers
      // the bar. The real invariant is geometric, so bounding-box non-intersection is the primary
      // check; the shared helper runs too, as the same style of check the storefront specs use,
      // applied to the bar's own center rather than the launcher's.
      const launcherBox = await launcher.boundingBox()
      const stickyBox = await stickyButton.boundingBox()
      if (launcherBox === null || stickyBox === null) {
        throw new Error('launcher or sticky bar has no layout box')
      }
      expect(boxesOverlap(launcherBox, stickyBox)).toBe(false)
      expect(await isOccludedAtCenter(stickyButton)).toBe(false)

      await openPanel(page, brand)
      const panel = panelOf(page, brand)
      const panelBox = await panel.boundingBox()
      const viewportSize = page.viewportSize()
      if (panelBox === null || viewportSize === null) {
        throw new Error('panel or viewport has no size')
      }
      expect(panelBox.height).toBeGreaterThanOrEqual(viewportSize.height - 1)

      const composer = composerOf(page, brand)
      await expect(composer).toBeVisible()
      const composerBox = await composer.boundingBox()
      if (composerBox === null) throw new Error('composer has no layout box')
      expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(viewportSize.height)

      await ask(page, brand, brand.opening)
      const chipRow = page.locator('.chips')
      await expect.poll(() => page.locator('.chip').count()).toBeGreaterThan(0)
      const noOverflow = await chipRow.evaluate((el) => el.scrollWidth <= el.clientWidth)
      expect(noOverflow).toBe(true)
    })
  }
})
