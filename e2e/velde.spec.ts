import { expect, test } from '@playwright/test'
import { isOccludedAtCenter, isStruckThrough, noBrokenImages, productJsonLd } from './dom'

// VELDE is server-rendered Bun + hand-written HTML/CSS/JS (apps/shop-velde). Handles, the
// out-of-stock/sale/no-image products, and every accessible name below were read out of
// apps/shop-velde/products.json, render.ts and velde.js — none are guessed. [ENGINEERING §3.1]

const BASE = 'http://localhost:4001'

// A normal, in-stock, photographed product — used for the happy path and the 375px checks.
const MAIN = { handle: 'noord-wool-overcoat', title: 'Noord Wool Overcoat', price: '€545.00' }
const OUT_OF_STOCK = { handle: 'ij-trench', title: 'IJ Wool Jacket' }
const ON_SALE = {
  handle: 'doorn-rain-coat',
  title: 'Doorn Rain Coat',
  was: '€235.00',
  sale: '€165.00',
}
const NO_IMAGE = { handle: 'nes-knit-polo', title: 'Nes Knit Polo' }

test.describe('critical purchase path', () => {
  test('home lists a product card that leads to its PDP with title, price and JSON-LD', async ({
    page,
  }) => {
    await page.goto(BASE)
    await page.getByRole('link', { name: MAIN.title, exact: false }).first().click()
    await expect(page).toHaveURL(`${BASE}/products/${MAIN.handle}`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(MAIN.title)
    await expect(page.getByText(MAIN.price, { exact: true }).first()).toBeVisible()

    const jsonLd = await productJsonLd(page)
    expect(jsonLd['@type']).toBe('Product')
    expect(jsonLd.offers.price).toBe('545.00')
    expect(jsonLd.additionalProperty.length).toBeGreaterThan(0)
  })

  test('add to cart increments the bag badge and opens the drawer with the line item', async ({
    page,
  }) => {
    await page.goto(`${BASE}/products/${MAIN.handle}`)
    await expect(page.getByRole('link', { name: 'Bag (0)' })).toBeVisible()

    await page.getByRole('button', { name: 'Add to bag' }).first().click()

    await expect(page.getByRole('link', { name: 'Bag (1)' })).toBeVisible()
    const drawer = page.getByRole('complementary', { name: 'Bag' })
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText(MAIN.title)
    await expect(drawer).toContainText('545.00')
  })

  test('the out-of-stock product cannot be added to the bag', async ({ page }) => {
    await page.goto(`${BASE}/products/${OUT_OF_STOCK.handle}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(OUT_OF_STOCK.title)
    // Both the in-flow and the sticky add-to-cart bar render their own disabled "Sold out"
    // button for an out-of-stock product — checking the first is enough, both are disabled.
    await expect(page.getByRole('button', { name: 'Sold out' }).first()).toBeDisabled()
  })

  test('the on-sale product shows both the struck original price and the reduced price', async ({
    page,
  }) => {
    await page.goto(`${BASE}/products/${ON_SALE.handle}`)
    const was = page.getByText(ON_SALE.was, { exact: true }).first()
    const sale = page.getByText(ON_SALE.sale, { exact: true }).first()
    await expect(was).toBeVisible()
    await expect(sale).toBeVisible()
    expect(await isStruckThrough(was)).toBe(true)
    expect(await isStruckThrough(sale)).toBe(false)
  })

  test('the product with no photo still renders its card and PDP without a broken image', async ({
    page,
  }) => {
    await page.goto(BASE)
    const card = page.getByRole('link', { name: NO_IMAGE.title, exact: false }).first()
    await expect(card).toBeVisible()
    await expect(card.getByText('Photograph to follow')).toBeVisible()

    await card.click()
    await expect(page).toHaveURL(`${BASE}/products/${NO_IMAGE.handle}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NO_IMAGE.title)
    await expect(page.getByText('Photograph to follow')).toBeVisible()
    expect(await noBrokenImages(page)).toBe(true)
  })

  test('the cookie banner can be dismissed and stays dismissed across a reload', async ({
    page,
  }) => {
    await page.goto(BASE)
    const banner = page.getByRole('region', { name: 'Cookie notice' })
    await expect(banner).toBeVisible()
    await banner.getByRole('button', { name: 'Accept all' }).click()
    await expect(banner).toBeHidden()

    await page.reload()
    await expect(page.getByRole('region', { name: 'Cookie notice' })).toBeHidden()
  })
})

test.describe('375px', () => {
  test('the sticky add-to-cart bar is visible, does not cover the footer, and the page does not scroll horizontally', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '375px is the mobile project only')

    await page.goto(`${BASE}/products/${MAIN.handle}`)
    // The cookie banner is also a fixed, bottom-anchored overlay — dismiss it first so it isn't
    // what the occlusion check below is actually seeing.
    await page.getByRole('button', { name: 'Accept all' }).click()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    const stickyButton = page.getByRole('button', { name: 'Add to bag' }).last()
    await expect(stickyButton).toBeVisible()

    const footerText = page.getByText('Velde B.V.', { exact: false })
    await expect(footerText).toBeVisible()
    expect(await isOccludedAtCenter(footerText)).toBe(false)

    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )
    expect(noOverflow).toBe(true)
  })
})

test.describe('no JavaScript', () => {
  test('the home page and a PDP still show products and prices with JS disabled', async ({
    browser,
    viewport,
  }) => {
    const context = await browser.newContext({ viewport, javaScriptEnabled: false })
    const page = await context.newPage()

    await page.goto(BASE)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: MAIN.title, exact: false }).first()).toBeVisible()

    await page.goto(`${BASE}/products/${MAIN.handle}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(MAIN.title)
    await expect(page.getByText(MAIN.price, { exact: true }).first()).toBeVisible()

    await context.close()
  })
})
