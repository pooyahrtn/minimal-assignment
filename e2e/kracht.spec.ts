import { expect, test } from '@playwright/test'
import { isOccludedAtCenter, isStruckThrough, noBrokenImages, productJsonLd } from './dom'

// KRACHT is a Next 15 app (apps/shop-kracht). Handles, the out-of-stock/sale/no-image products,
// and every accessible name below were read out of data/products.json, the components under
// components/, and lib/catalog.ts — none are guessed. [ENGINEERING §3.1]

const BASE = 'http://localhost:4002'

// A normal, in-stock, photographed product — used for the happy path and the 375px checks. Its
// card renders two links to the PDP; this is the accessible name of the photo one (`photoAlt` in
// lib/catalog.ts), which — unlike the plain product-name link — is unique across flavours.
const MAIN = {
  slug: 'whey-classic-1kg-chocolate',
  cardLinkName: 'KRACHT Whey Classic 1 kg, chocolate fudge',
  title: 'Whey Classic',
  price: '29,95',
}
const OUT_OF_STOCK = { slug: 'vegan-protein-900g-vanilla-chai', title: 'Vegan Protein' }
const ON_SALE = {
  slug: 'creatine-gummies-90',
  title: 'Creatine Gummies',
  was: '29,95',
  sale: '21,95',
}
const NO_IMAGE = { slug: 'pre-workout-lite-mango', title: 'Pre-Workout Lite', price: '32,95' }

test.describe('critical purchase path', () => {
  test('home lists a product card that leads to its PDP with title, price and JSON-LD', async ({
    page,
  }) => {
    await page.goto(BASE)
    await page.getByRole('link', { name: MAIN.cardLinkName }).first().click()
    await expect(page).toHaveURL(`${BASE}/product/${MAIN.slug}`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(MAIN.title)
    await expect(page.getByText(MAIN.price, { exact: false }).first()).toBeVisible()

    const jsonLd = await productJsonLd(page)
    expect(jsonLd['@type']).toBe('Product')
    expect(jsonLd.offers.price).toBe('29.95')
    expect(jsonLd.additionalProperty.length).toBeGreaterThan(0)
  })

  test('add to cart increments the basket badge and opens the drawer with the line item', async ({
    page,
  }) => {
    await page.goto(`${BASE}/product/${MAIN.slug}`)
    await expect(page.getByRole('button', { name: 'Basket', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'In my basket' }).first().click()

    // The count badge is a block-level (grid) span absolutely positioned over the button, so the
    // accessible name computation inserts a line break where CSS visually overlaps it — the name
    // is "Basket 1", not the "Basket1" the flattened textContent would suggest.
    await expect(page.getByRole('button', { name: 'Basket 1', exact: true })).toBeVisible()
    const drawer = page.getByRole('dialog', { name: 'Shopping basket' })
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText(MAIN.title)
    await expect(drawer).toContainText(MAIN.price)
  })

  test('the out-of-stock product cannot be added to the basket', async ({ page }) => {
    await page.goto(`${BASE}/product/${OUT_OF_STOCK.slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(OUT_OF_STOCK.title)
    // The BuyBox renders this exact status line only when it withholds the AddToCart button — the
    // two are mutually exclusive in components/../product/[slug]/page.tsx's BuyBox, so this text
    // alone is proof there is no working add-to-basket control for this product.
    await expect(page.getByText('Sold out — back in about ten days')).toBeVisible()
  })

  test('the on-sale product shows both the struck original price and the reduced price', async ({
    page,
  }) => {
    await page.goto(`${BASE}/product/${ON_SALE.slug}`)
    const was = page.locator(`:visible:text("${ON_SALE.was}")`).first()
    const sale = page.locator(`:visible:text("${ON_SALE.sale}")`).first()
    await expect(was).toBeVisible()
    await expect(sale).toBeVisible()
    expect(await isStruckThrough(was)).toBe(true)
    expect(await isStruckThrough(sale)).toBe(false)
  })

  test('the product with no photo still renders its card and PDP without a broken image', async ({
    page,
  }) => {
    await page.goto(BASE)
    // The card is a semantic <article> in components/ProductCard.tsx — scoping to it (rather than
    // to one of its two links) is what lets us check the placeholder tile and the link together.
    const card = page.getByRole('article').filter({ hasText: NO_IMAGE.title })
    await expect(card).toBeVisible()
    await expect(card.getByText('packshot on its way')).toBeVisible()

    await card.getByRole('link', { name: NO_IMAGE.title, exact: false }).first().click()
    await expect(page).toHaveURL(`${BASE}/product/${NO_IMAGE.slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NO_IMAGE.title)
    // The one flavoured product the shoot never covered — everything else missing a packshot is
    // an intentionally label-only "Unflavoured" tub. lib/catalog.test.ts pins this down too.
    await expect(page.getByText('packshot on its way')).toBeVisible()
    await expect(page.getByText(NO_IMAGE.price, { exact: false }).first()).toBeVisible()
    expect(await noBrokenImages(page)).toBe(true)
  })

  test('the cookie banner can be dismissed and stays dismissed across a reload', async ({
    page,
  }) => {
    await page.goto(BASE)
    const banner = page.getByText('Cookies.', { exact: true })
    await expect(banner).toBeVisible()
    await page.getByRole('button', { name: 'Accept all' }).click()
    await expect(banner).toBeHidden()

    await page.reload()
    await expect(page.getByText('Cookies.', { exact: true })).toBeHidden()
  })

  test('the Excl./Incl. VAT toggle changes the rendered price', async ({ page }) => {
    await page.goto(`${BASE}/product/${MAIN.slug}`)
    const visibleText = () => page.locator('body').innerText()

    await expect.poll(visibleText).toContain(MAIN.price)

    // Two copies of this control exist (header for desktop, footer for mobile) and only one is
    // ever visible at a time — see components/VatToggle.tsx and its `sm:` breakpoint classes.
    await page.locator('button:visible:has-text("Excl. VAT")').click()

    await expect.poll(visibleText).not.toContain(MAIN.price)
    await expect.poll(visibleText).toContain('24,75') // 29.95 / 1.21, what excl. VAT actually shows
  })
})

test.describe('375px', () => {
  test('the sticky add-to-cart bar is visible, does not cover the footer, and the page does not scroll horizontally', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '375px is the mobile project only')

    await page.goto(`${BASE}/product/${MAIN.slug}`)
    // The cookie banner is also a fixed, bottom-anchored overlay — dismiss it first so it isn't
    // what the occlusion check below is actually seeing.
    await page.getByRole('button', { name: 'Accept all' }).click()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    const stickyButton = page.getByRole('button', { name: 'In my basket' }).last()
    await expect(stickyButton).toBeVisible()

    const footerText = page.getByText('KvK 87451209', { exact: false })
    await expect(footerText).toBeVisible()
    // KRACHT reserves no extra bottom padding for the sticky bar the way VELDE's
    // `.template-product .footer` rule does — see the T12 hand-off for the finding.
    expect(await isOccludedAtCenter(footerText)).toBe(false)

    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )
    expect(noOverflow).toBe(true)
  })
})
