import { expect, test } from '@playwright/test'

/**
 * T7's runnable check. It exists because the config page's own DoD is mostly claims about what a
 * merchant can and cannot do, and a claim verified by the author driving their own browser once
 * is the weakest evidence this repo accepts [ENGINEERING §3]. Every assertion below is one of
 * T7's DoD boxes, named.
 *
 * It runs under both Playwright projects, so `mobile` is a real 375px viewport rather than a
 * resized window — the machine this was built on runs fullscreen at 2560px and `resize_window`
 * silently refused, which is exactly the kind of thing a screenshot cannot tell you.
 */

const PLATFORM = 'http://localhost:4003'

/** Walk the paste screen into the review screen with the VELDE store. */
async function openReview(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(PLATFORM)
  await page.fill('#store-url', 'http://localhost:4001')
  await page.click('#extract-btn')
  await expect(page.locator('#review')).toBeVisible()
}

test('box 1: URL to a copyable snippet without typing a hex code', async ({ page }) => {
  await openReview(page)
  // The extractor's guess for VELDE is a near-white accent, so the snippet is withheld until the
  // merchant resolves it — that IS box 1's path, and the one-click fix is the "without typing a
  // hex code" part. If this ever stops being blocked the accent guard has silently stopped firing.
  await expect(page.getByText('Your accent disappears into your surface.')).toBeVisible()
  await page.getByRole('button', { name: /^Use #/ }).click()

  await expect(page.getByText('Your accent disappears')).toHaveCount(0)
  const publish = page.getByRole('button', { name: /Save & copy snippet/ })
  await expect(publish).toBeVisible()
  await publish.click()

  const snippet = page.locator('.snippet')
  await expect(snippet).toHaveValue(
    /<script src="http:\/\/localhost:4003\/v1\/agent\.js" data-shop="shop-[a-z0-9]+" async><\/script>/,
  )
})

test('box 2: a hex code overrides what the extractor guessed', async ({ page }) => {
  await openReview(page)
  const accentHex = page.locator('.colour-row input[type="text"]').first()
  await accentHex.fill('#2C3E5C')
  await accentHex.blur()
  await expect(accentHex).toHaveValue('#2C3E5C')
  // A malformed hex must not reach derive(), which throws on anything but 6 digits.
  await accentHex.fill('#zzz')
  await accentHex.blur()
  await expect(accentHex).toHaveValue('#2C3E5C')
})

test('box 3: the NL field moves six token groups, and each is named', async ({ page }) => {
  await openReview(page)
  await page.fill(
    '#nl-input',
    'warmer, less rounded, more compact, bigger text, flatter, shouty labels',
  )
  await page.press('#nl-input', 'Enter')

  const deltas = page.locator('.delta')
  // The DoD asks for at least four distinct groups.
  await expect(deltas).toHaveCount(6)
  const groups = await page.locator('.delta-group').allTextContents()
  expect(new Set(groups).size).toBe(6)

  // Visible in the controls, not just in a blob: the segmented controls moved with it.
  // Scoped by group — 'compact' is a legal value of BOTH Spacing and Text size.
  await expect(
    page.getByLabel('Spacing').getByRole('button', { name: 'compact', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByLabel('Text size').getByRole('button', { name: 'generous', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByLabel('Labels').getByRole('button', { name: 'UPPER', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('box 4: no configuration reachable here can ship an illegible widget', async ({ page }) => {
  await openReview(page)
  // The QA box's deliberate break: yellow accent on a white surface.
  const inputs = page.locator('.colour-row input[type="text"]')
  await inputs.first().fill('#FFFF00')
  await inputs.first().blur()
  await inputs.nth(1).fill('#FFFFFF')
  await inputs.nth(1).blur()

  await expect(page.getByText(/At 1\.0\d:1 the launcher/)).toBeVisible()
  await expect(
    page.getByText('we will not hand you a snippet that installs an invisible button'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /Save & copy snippet/ })).toHaveCount(0)

  // And the text inside the widget is still guaranteed — every listed pair clears its floor.
  const failing = page.locator('.ratio[data-meets="false"]')
  await expect(failing).toHaveCount(0)
})

test('box 5: undo takes back a whole phrase in one step, and reset returns to detected', async ({
  page,
}) => {
  await openReview(page)
  const accentHex = page.locator('.colour-row input[type="text"]').first()
  const detected = await accentHex.inputValue()

  await page.fill('#nl-input', 'warmer, less rounded, more compact')
  await page.press('#nl-input', 'Enter')
  await expect(page.locator('.delta')).toHaveCount(3)
  const afterPhrase = await accentHex.inputValue()
  expect(afterPhrase).not.toBe(detected)

  // One phrase moved three groups; one undo puts all three back.
  await page.getByRole('button', { name: /^Undo/ }).click()
  await expect(accentHex).toHaveValue(detected)
  await expect(
    page.getByLabel('Corners').getByRole('button', { name: 'md', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')

  await accentHex.fill('#123456')
  await accentHex.blur()
  await page.getByRole('button', { name: 'Reset to what we found' }).click()
  await expect(accentHex).toHaveValue(detected)
})

test('box 8: the readability panel names what moved and what shipped', async ({ page }) => {
  await openReview(page)
  await expect(page.getByText('Secondary text, and where it landed')).toBeVisible()
  // A real before/after, both with their measured ratio.
  // No whitespace between the spans in `textContent`, so the arrow butts against both hexes.
  await expect(page.locator('.before-after')).toContainText(
    /#[0-9A-F]{6} \(\d+\.\d\d:1\)\s*→\s*#[0-9A-F]{6} \(\d+\.\d\d:1\)/,
  )
  // Every guaranteed pair plus the two focus-ring rows.
  await expect(page.locator('.read-row')).toHaveCount(9)
})

test('box 9: an unreachable store is its own state and routes to the manual fields', async ({
  page,
}) => {
  await page.goto(PLATFORM)
  // Deterministic and offline: a closed port, not a shop whose bot policy changes under us
  // [TASKS §0 #3 — nothing depends on a network fetch of a site we do not control].
  await page.fill('#store-url', 'http://localhost:9/')
  await page.click('#extract-btn')
  await expect(page.locator('#review')).toBeVisible()
  await expect(page.locator('.found')).toHaveAttribute('data-state', 'failed')
  await expect(page.getByText('We could not reach it from here.')).toBeVisible()
  // The technical reason stays available, but does not lead.
  await expect(page.locator('.found .group-note')).toBeVisible()
  // Routed to the manual fields, not a dead end.
  await expect(page.locator('.colour-row input[type="text"]').first()).toBeEditable()
})

test('box 10: the signature is on the launcher under every brand, and this UI cannot remove it', async ({
  page,
}) => {
  await openReview(page)
  const frame = page.frameLocator('#preview')
  const badge = frame.locator('mx-agent').locator('.signature')
  await expect(badge).toHaveText('AI')

  // Under a second brand pushed through the live preview channel.
  const inputs = page.locator('.colour-row input[type="text"]')
  await inputs.first().fill('#C6F441')
  await inputs.first().blur()
  await inputs.nth(1).fill('#121212')
  await inputs.nth(1).blur()
  await expect(badge).toHaveText('AI')

  // And under the third, which has no storefront of its own — the preview channel is the only
  // surface HELDER has ever had. [T11's DoD box 3, which could not close until this existed]
  await inputs.first().fill('#E8D44D')
  await inputs.first().blur()
  await inputs.nth(1).fill('#F7F0B8')
  await inputs.nth(1).blur()
  await expect(badge).toHaveText('AI')

  // "Cannot be removed from this UI" means something falsifiable: every control the rail offers
  // is applied to the widget, and after exercising ALL of them the badge is still there. The
  // earlier version of this asserted the absence of the word "signature" from the rail, which no
  // code path could ever produce — it could not fail, and a test that cannot fail is worse than
  // no test [ENGINEERING §3.1].
  for (const shape of ['bubble', 'pill', 'text-anchor']) {
    await page.getByLabel('Shape').getByRole('button', { name: shape, exact: true }).click()
    await expect(badge).toHaveText('AI')
  }
  await page.fill('#nl-input', 'flatter, shouty labels, more compact, less rounded')
  await page.press('#nl-input', 'Enter')
  await expect(badge).toHaveText('AI')
  // And it stays legible rather than merely present: it paints on an AA-guaranteed pair.
  const contrastOk = await badge.evaluate((n) => {
    const style = getComputedStyle(n)
    const parse = (c: string) => (c.match(/\d+/g) ?? []).slice(0, 3).map(Number)
    const lum = (rgb: number[]) => {
      const [r = 0, g = 0, b = 0] = rgb
        .map((v) => v / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const a = lum(parse(style.color))
    const b = lum(parse(style.backgroundColor))
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  })
  expect(contrastOk).toBeGreaterThanOrEqual(4.5)
})

test('the preview is a real storefront and it mutates live', async ({ page }) => {
  await openReview(page)
  const launcher = page.frameLocator('#preview').locator('mx-agent').locator('.launcher')
  await expect(launcher).toBeVisible()

  const before = await launcher.evaluate((n) => getComputedStyle(n).backgroundColor)
  const accentHex = page.locator('.colour-row input[type="text"]').first()
  await accentHex.fill('#C6F441')
  await accentHex.blur()
  await expect
    .poll(async () => launcher.evaluate((n) => getComputedStyle(n).backgroundColor))
    .not.toBe(before)
})

test('the page itself works at this viewport with no horizontal overflow', async ({ page }) => {
  await openReview(page)
  // Type a long NL phrase FIRST. The undo button carries the merchant's own phrase as its label,
  // and an earlier version of this test measured a pristine page and reported no overflow while
  // one long phrase pushed the whole document to 768px at a 375px viewport.
  await page.fill(
    '#nl-input',
    'warmer and quite a lot less rounded and considerably more compact please, with bigger text',
  )
  await page.press('#nl-input', 'Enter')

  const overflow = await page.evaluate(() => {
    const nodes = [document.documentElement, ...Array.from(document.querySelectorAll('#review *'))]
    // No `overflowX !== 'auto'` exemption: `.rail` sets `overflow-y: auto`, which computes
    // `overflow-x: auto` too, so that filter silently excused the one element that overflowed.
    // Only the snippet box is allowed to scroll sideways, and it is a textarea.
    return (
      nodes
        .filter((n) => n.scrollWidth > n.clientWidth + 1)
        .filter((n) => !n.classList.contains('snippet'))
        // An element that declares `text-overflow: ellipsis` is truncating on purpose — that IS the
        // fix for the undo button carrying an arbitrarily long phrase. Everything else that exceeds
        // its box is a layout defect.
        .filter((n) => getComputedStyle(n).textOverflow !== 'ellipsis')
        .map((n) => `${n.className || n.tagName}: ${n.scrollWidth} > ${n.clientWidth}`)
    )
  })
  expect(overflow).toEqual([])
  // The document itself must never scroll sideways.
  const docWidth = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(docWidth.scroll).toBeLessThanOrEqual(docWidth.client + 1)
  // Both the controls and the preview are reachable at every width the suite runs.
  await expect(page.locator('#rail')).toBeVisible()
  await expect(page.locator('#preview')).toBeVisible()
})

test('republishing updates the config the snippet already points at', async ({ page }) => {
  await openReview(page)
  await page.getByRole('button', { name: /^Use #/ }).click()
  await page.getByRole('button', { name: /Save & copy snippet/ }).click()

  // A retrying assertion, not a bare read: the POST is in flight when the click resolves, and a
  // plain `inputValue()` raced it under full parallelism — it passed in isolation and flaked at
  // eight workers, which is the worst way for a test to be wrong.
  await expect(page.locator('.snippet')).toHaveValue(/data-shop="shop-[a-z0-9]+"/)
  const snippet = await page.locator('.snippet').inputValue()
  const key = /data-shop="([^"]+)"/.exec(snippet)?.[1]
  expect(key).toBeTruthy()
  const served = async (): Promise<string> => {
    const response = await page.request.get(`http://localhost:4003/v1/config/${key}`)
    const body = await response.json()
    return body.tokens.css['--mx-accent']
  }
  const first = await served()

  // Edit AFTER publishing. This used to be discarded silently: the button relabelled to "Copy
  // snippet" and never POSTed again, so the merchant left with their pre-edit brand installed.
  const accentHex = page.locator('.colour-row input[type="text"]').first()
  await accentHex.fill('#FF0055')
  await accentHex.blur()
  await expect(page.getByRole('button', { name: /Save changes & copy/ })).toBeVisible()
  await page.getByRole('button', { name: /Save changes & copy/ }).click()

  await expect.poll(served, { timeout: 15_000 }).not.toBe(first)
  expect(await served()).toBe('#ff0055')
  // Same key, so the snippet the merchant already pasted keeps working.
  expect(await page.locator('.snippet').inputValue()).toContain(`data-shop="${key}"`)
})

test('acknowledging an invisible accent does not survive changing the surface', async ({
  page,
}) => {
  await openReview(page)
  const inputs = page.locator('.colour-row input[type="text"]')
  await inputs.first().fill('#FFFF00')
  await inputs.first().blur()
  await page.getByRole('button', { name: 'Keep mine anyway' }).click()
  await expect(page.getByRole('button', { name: /Save & copy snippet/ })).toBeVisible()

  // Same accent, different surface — a combination nobody agreed to. It must ask again.
  await inputs.nth(1).fill('#FFFFE0')
  await inputs.nth(1).blur()
  await expect(page.getByText('Your accent disappears into your surface.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Save & copy snippet/ })).toHaveCount(0)
})

test('the preview keeps the merchant edits across an in-frame navigation', async ({ page }) => {
  await openReview(page)
  const launcher = page.frameLocator('#preview').locator('mx-agent').locator('.launcher')
  await expect(launcher).toBeVisible()

  const accentHex = page.locator('.colour-row input[type="text"]').first()
  await accentHex.fill('#C6F441')
  await accentHex.blur()
  await expect
    .poll(async () => launcher.evaluate((n) => getComputedStyle(n).backgroundColor))
    .toBe('rgb(198, 244, 65)')

  // A storefront is full of product links; clicking one used to silently revert the preview to
  // the shipped brand, with no signal that the edits were gone. Navigate the way a merchant
  // would — from inside the frame. (Reloading it from the parent is a cross-origin SecurityError,
  // which is itself the reason the postMessage channel exists.)
  const frame = page.frameLocator('#preview')
  await frame.locator('a[href*="/products/"], a[href*="/product/"]').first().click()
  await expect
    .poll(async () => launcher.evaluate((n) => getComputedStyle(n).backgroundColor), {
      timeout: 15_000,
    })
    .toBe('rgb(198, 244, 65)')
})

test('typing in a field survives the commit that follows it', async ({ page }) => {
  await openReview(page)
  const accentHex = page.locator('.colour-row input[type="text"]').first()
  await accentHex.click()
  await accentHex.fill('#2C3E5C')
  await accentHex.press('Enter')
  // The whole rail is rebuilt on commit; focus must land back on the replacement control rather
  // than on <body>, or keyboard users are thrown to the top of the page on every edit.
  await expect(accentHex).toBeFocused()
})

test('box 7: a merchant font file renders in the widget, under both brands', async ({ page }) => {
  await openReview(page)
  const widget = page.frameLocator('#preview').locator('mx-agent')
  const launcher = widget.locator('.launcher')
  await expect(launcher).toBeVisible()

  // A real, public .woff2 — the shape a merchant's own theme serves. The platform wraps it in a
  // stylesheet because `FontChoice.href` is a stylesheet URL by contract and `<link rel=stylesheet>`
  // cannot load a font file; the widget itself is unchanged.
  const woff2 =
    'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKeiunDTbtPK-F2qC0usEw.woff2'
  await page.getByLabel('Display face').fill('Playfair Display')
  await page.getByLabel('Display face').blur()
  await page.getByLabel('Font file (.woff2)').fill(woff2)
  await page.getByLabel('Font file (.woff2)').blur()

  // The href reaching the storefront must be ABSOLUTE. A root-relative one resolves against the
  // storefront origin, 404s, and the typeface never changes — which is what shipped first.
  await expect
    .poll(async () =>
      launcher.evaluate((n) => getComputedStyle(n).getPropertyValue('--mx-font-display')),
    )
    .toContain('Playfair Display')

  const linkHref = await page
    .frameLocator('#preview')
    .locator('link[rel="stylesheet"]')
    .last()
    .getAttribute('href')
  // Absolute, and pointing at the PLATFORM. A root-relative href here resolves against the
  // storefront and 404s.
  expect(linkHref).toContain('http://localhost:4003/v1/font.css')

  // And the stylesheet actually RESOLVED. `document.fonts.check()` is not usable here — it
  // returned true against a 404ing link, because it answers "can this family be resolved",
  // fallback included. Fetching the href is the assertion that fails when the URL is wrong.
  const fontCss = await page.request.get(linkHref ?? '')
  expect(fontCss.status()).toBe(200)
  expect(await fontCss.text()).toContain('@font-face')

  // The field still shows what was typed, rather than blanking itself on the next render.
  await expect(page.getByLabel('Font file (.woff2)')).toHaveValue(woff2)

  // Under the second brand too.
  const inputs = page.locator('.colour-row input[type="text"]')
  await inputs.first().fill('#C6F441')
  await inputs.first().blur()
  await inputs.nth(1).fill('#121212')
  await inputs.nth(1).blur()
  await expect
    .poll(async () =>
      launcher.evaluate((n) => getComputedStyle(n).getPropertyValue('--mx-font-display')),
    )
    .toContain('Playfair Display')
})

test('box 9: a private or unreachable address is named, not swallowed', async ({ page }) => {
  // The `blocked` and `empty` classifications cannot be reached from this page against a local
  // fixture — `/v1/extract` refuses loopback before classification runs — and reaching them for
  // real would mean depending on a third party's bot policy on the day [TASKS §0 #3]. They are
  // proven in `apps/platform/classify.test.ts` instead. What IS reachable here is the guard, and
  // the rule that every failure routes to editable fields rather than a dead end.
  await page.goto(PLATFORM)
  await page.fill('#store-url', 'http://169.254.169.254/latest/meta-data/')
  await page.click('#extract-btn')
  await expect(page.locator('#review')).toBeVisible()
  await expect(page.locator('.found')).toHaveAttribute('data-state', 'failed')
  await expect(page.locator('.found .group-note')).toContainText(
    /public http\(s\) address, not a private, loopback, or link-local host/,
  )
  await expect(page.locator('.colour-row input[type="text"]').first()).toBeEditable()
})

test('the verification state waits for a real load and then reports it', async ({ page }) => {
  await openReview(page)
  await page.getByRole('button', { name: /^Use #/ }).click()
  await page.getByRole('button', { name: /Save & copy snippet/ }).click()
  await expect(page.locator('.snippet')).toHaveValue(/data-shop="shop-[a-z0-9]+"/)
  const key = /data-shop="([^"]+)"/.exec(await page.locator('.snippet').inputValue())?.[1]

  // Nothing has loaded this key yet. The old version reported "Detected ✓" here, off the preview
  // iframe's handshake — which fires for the storefront's OWN widget and never observes this key.
  await expect(page.locator('.verify')).toContainText('Waiting for first load')

  // Now something other than this page fetches that config, which is what pasting the snippet on
  // a real store does.
  await page.request.get(`http://localhost:4003/v1/config/${key}`)
  await expect(page.locator('.verify')).toContainText('Detected', { timeout: 15_000 })
  await expect(page.locator('.verify')).toContainText(key ?? '')
})

test('the studio is in the URL, so a refresh keeps the store you selected', async ({ page }) => {
  await openReview(page)
  // The selection is recorded where a refresh and a shared link can both read it.
  await expect(page).toHaveURL(/\?store=http%3A%2F%2Flocalhost%3A4001/)
  await page.reload()
  // Replayed, not merely remembered: the review screen comes back with the same store's preview,
  // rather than dumping the merchant back on the paste screen with their selection gone.
  await expect(page.locator('#review')).toBeVisible()
  await expect(page.locator('#preview')).toHaveAttribute('src', 'http://localhost:4001')
})

test('skipping extraction is replayed on refresh too, not just a pasted store', async ({
  page,
}) => {
  await page.goto(PLATFORM)
  await page.click('#skip-extract')
  await expect(page).toHaveURL(/\?store=manual/)
  await page.reload()
  await expect(page.getByText('Starting from scratch.')).toBeVisible()
})

test('a store address typed without https:// is accepted, and the scheme is shown back', async ({
  page,
}) => {
  await page.goto(PLATFORM)
  await page.fill('#store-url', 'velde.releashed.io')
  await page.click('#extract-btn')
  // The browser no longer refuses to submit, and the merchant can see what we made of what they
  // typed. Whether that address resolves from here is the extractor's business, not this check's.
  await expect(page.locator('#store-url')).toHaveValue('https://velde.releashed.io')
  await expect(page.locator('#review')).toBeVisible()
})

test('an address that already carries a scheme is left exactly as typed', async ({ page }) => {
  await page.goto(PLATFORM)
  // Not upgraded to https, not rewritten: the server's guard must judge the scheme the merchant
  // actually gave it, which is what keeps `javascript:` and `file:` refusable.
  await page.fill('#store-url', 'http://localhost:4001')
  await page.click('#extract-btn')
  await expect(page.locator('#store-url')).toHaveValue('http://localhost:4001')
})
