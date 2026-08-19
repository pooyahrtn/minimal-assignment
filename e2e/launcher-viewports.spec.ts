import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

// The launcher has to be REACHABLE on the machine the demo is given on. `agent.spec.ts` already
// proves the launcher clears the sticky add-to-cart bar at 375px; this file is the same question
// asked at the resolutions a laptop or a projector actually runs, because that is where it broke:
// `stickyBarHeight` in packages/agent/src/widget.ts counted ANY sticky ancestor under the
// launcher's corner as a bottom bar, and VELDE's PDP wraps its info column in `position: sticky`.
// Measured on this suite before the fix: the launcher sat at y = -75.97 at 1280x800 and y =
// -107.97 at 1366x768 on VELDE's PDP — 793px of lift for a 793px column, i.e. no agent at all on
// two ordinary laptop resolutions.
//
// Every number below is read off the live page. Nothing here is pinned to an expected pixel: the
// invariants are "inside the window" and "not on top of the bar", which stay true whatever the
// storefronts' layout does next. [ENGINEERING §3.13]

const SIGNATURE = ' — AI assistant by Maximal'

type Brand = {
  readonly name: 'velde' | 'kracht'
  readonly base: string
  readonly pdp: string
  readonly launcherName: string
  readonly stickyButtonName: string
  readonly cookieAccept: (page: Page) => Locator
}

const BRANDS: readonly Brand[] = [
  {
    name: 'velde',
    base: 'http://localhost:4001',
    pdp: '/products/noord-wool-overcoat',
    launcherName: `Help me choose${SIGNATURE}`,
    stickyButtonName: 'Add to bag',
    cookieAccept: (page) =>
      page
        .getByRole('region', { name: 'Cookie notice' })
        .getByRole('button', { name: 'Accept all' }),
  },
  {
    name: 'kracht',
    base: 'http://localhost:4002',
    pdp: '/product/whey-classic-1kg-chocolate',
    launcherName: `Ask Joep${SIGNATURE}`,
    stickyButtonName: 'In my basket',
    cookieAccept: (page) => page.getByRole('button', { name: 'Accept all' }),
  },
]

/** 375 is the default development viewport [PRINCIPLES §1.3]; the four above it are the laptop and
 *  projector sizes a demo is given on, and 1280x800 / 1366x768 are the two that were broken. */
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const

type Box = { x: number; y: number; width: number; height: number }

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

test.describe('the launcher stays inside the window at every demo resolution', () => {
  for (const viewport of VIEWPORTS) {
    for (const brand of BRANDS) {
      test(`${brand.name} @ ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
        // The matrix carries its own viewports, so running it under both config projects would
        // measure each case twice with identical inputs. [e2e/playwright.config.ts]
        test.skip(testInfo.project.name !== 'desktop', 'this file sets its own viewports')
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.goto(`${brand.base}${brand.pdp}`)

        const launcher = page.getByRole('button', { name: brand.launcherName, exact: true })
        await expect(launcher).toBeVisible()
        // Dismissing the banner is the trigger: the widget re-measures the bottom edge on the
        // click, and it is that re-measure that used to read the sticky product column.
        await brand.cookieAccept(page).click()
        const stickyButton = page.getByRole('button', { name: brand.stickyButtonName }).last()
        await expect(stickyButton).toBeVisible()

        const launcherBox = await launcher.boundingBox()
        const stickyBox = await stickyButton.boundingBox()
        if (launcherBox === null || stickyBox === null) {
          throw new Error('launcher or add-to-cart control has no layout box')
        }
        // Printed, not just asserted: a position bug is a number, and the number is what tells you
        // which way it went wrong. [ENGINEERING §3.5]
        console.log(
          `${brand.name} ${viewport.width}x${viewport.height} launcher=${JSON.stringify(launcherBox)} sticky=${JSON.stringify(stickyBox)}`,
        )

        expect(launcherBox.x).toBeGreaterThanOrEqual(0)
        expect(launcherBox.y).toBeGreaterThanOrEqual(0)
        expect(launcherBox.x + launcherBox.width).toBeLessThanOrEqual(viewport.width + 0.5)
        expect(launcherBox.y + launcherBox.height).toBeLessThanOrEqual(viewport.height + 0.5)
        expect(overlaps(launcherBox, stickyBox)).toBe(false)
      })
    }
  }
})
