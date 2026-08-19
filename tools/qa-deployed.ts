/**
 * T15's QA box, run against the DEPLOYED links with no webServer and nothing on localhost:
 * "Fresh browser, no localhost running anywhere: open both deployed storefronts and reach the
 * obstacle. If any part needs a local server, this task is not done."
 *
 * Also closes TASKS.md §2 universal box 1 — both brands at 375px and 1440px — which the plan
 * refutation pointed out T15 is not exempt from.
 *
 * Deliberately NOT a Playwright spec: `e2e/playwright.config.ts` starts three local webServers,
 * which is the one thing this check must not depend on. Plain script, run it directly:
 *
 *   bun run tools/qa-deployed.ts
 */
import { chromium, type Browser, type Page } from '@playwright/test'

const PLATFORM = 'https://maximal.releashed.io'
const VELDE = {
  name: 'velde',
  base: 'https://velde.releashed.io',
  pdp: '/products/noord-wool-overcoat',
  launcher: 'Help me choose',
  composer: 'What is it for?',
  opening:
    'I need a jacket I can wear to the office and on the bike. Black, nothing shiny, and ideally under €250.',
}
const KRACHT = {
  name: 'kracht',
  base: 'https://kracht.releashed.io',
  pdp: '/product/whey-classic-1kg-chocolate',
  launcher: 'Ask Joep',
  composer: 'Tell me what you need',
  opening: "I'm after a protein shake with no sweeteners, lactose-free, and ideally under €30.",
}

const OUT = `${import.meta.dir}/../dist/qa`
const problems: string[] = []
const note = (ok: boolean, message: string): void => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`)
  if (!ok) problems.push(message)
}

async function run(
  browser: Browser,
  brand: typeof VELDE,
  width: number,
  height: number,
): Promise<void> {
  const context = await browser.newContext({ viewport: { width, height } })
  const page: Page = await context.newPage()

  // Every console error, failed request and 4xx/5xx, from before the first byte of the page.
  //
  // ONE named pre-existing defect is allow-listed, by exact URL so it cannot absorb anything else:
  // KRACHT's voice declares an avatar at `/brand/kracht/joep.svg` (`packages/tokens/src/brands.ts`
  // → `apps/platform/config/kracht.json:56`) and that file exists nowhere in the repo. It 404s on
  // localhost:4002 exactly as it does deployed, so T15 neither introduced it nor can honestly close
  // it — the owning file belongs to another desk. Delete this the moment the asset lands.
  //
  // The console text for a failed subresource is a bare "Failed to load resource: ... 404 ()" with
  // no URL in it, so the filter has to read `m.location().url` or it matches nothing.
  const KNOWN_MISSING = '/brand/kracht/joep.svg'
  const errors: string[] = []
  const record = (message: string): void => {
    if (!message.includes(KNOWN_MISSING)) errors.push(message)
  }
  page.on('console', (m) => {
    if (m.type() === 'error') record(`${m.text()} [${m.location().url}]`)
  })
  page.on('response', (r) => {
    if (r.status() >= 400) record(`HTTP ${r.status()} ${r.url()}`)
  })
  page.on('requestfailed', (r) => record(`REQUEST FAILED ${r.url()} ${r.failure()?.errorText}`))

  // The proof that the config really came from the OTHER origin, recorded from the wire rather
  // than inferred from the widget looking right.
  const configHits: string[] = []
  page.on('response', (r) => {
    if (r.url().startsWith(`${PLATFORM}/v1/config/`)) configHits.push(`${r.status()} ${r.url()}`)
  })

  await page.goto(`${brand.base}${brand.pdp}`, { waitUntil: 'networkidle' })

  // Substring, not exact: the launcher's accessible name carries the constant AI-disclosure suffix
  // ("Help me choose — AI assistant by Maximal"). An exact matcher made this script time out on its
  // very first assertion, and it was cited as evidence while never having completed a single run.
  const launcher = page.getByRole('button', { name: brand.launcher, exact: false }).first()
  await launcher.waitFor({ state: 'visible', timeout: 15_000 })
  note(true, `${brand.name} ${width}px: launcher "${brand.launcher}" mounted from ${PLATFORM}`)

  await launcher.click()
  const composer = page.getByRole('textbox', { name: brand.composer, exact: true })
  await composer.waitFor({ state: 'visible', timeout: 10_000 })
  await composer.fill(brand.opening)
  await composer.press('Enter')

  const chips = page.locator('.chip')
  await chips.first().waitFor({ state: 'visible', timeout: 15_000 })
  const chipCount = await chips.count()
  note(chipCount >= 3, `${brand.name} ${width}px: ${chipCount} constraint chips (expected >= 3)`)

  // KRACHT is the brand whose opening is engineered to hit the no-match obstacle. VELDE's finds
  // products, so requiring a `.nomatch` card there would be asserting the wrong thing.
  if (brand.name === 'kracht') {
    const card = page.locator('.nomatch')
    await card.waitFor({ state: 'visible', timeout: 15_000 })
    const items = await card.locator('.nomatch-item').count()
    note(items > 0, `${brand.name} ${width}px: obstacle card visible with ${items} near misses`)
    const drop = page.getByRole('button', { name: /^Drop /, exact: false }).first()
    note(
      await drop.isVisible(),
      `${brand.name} ${width}px: the blocking chip is droppable in one tap`,
    )
  } else {
    const cards = await page.locator('.card').count()
    note(cards > 0, `${brand.name} ${width}px: ${cards} product card(s) recommended`)
  }

  note(
    configHits.length > 0,
    `${brand.name} ${width}px: config fetched cross-origin — ${configHits.join(', ')}`,
  )
  note(
    errors.length === 0,
    `${brand.name} ${width}px: ${errors.length} console/network errors${errors.length ? ` → ${errors.slice(0, 3).join(' | ')}` : ''}`,
  )

  // Nothing may overflow the viewport horizontally — the failure 375px exists to catch.
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth)
  note(
    scrollW <= width + 1,
    `${brand.name} ${width}px: no horizontal overflow (scrollWidth ${scrollW})`,
  )

  await page.screenshot({ path: `${OUT}/${brand.name}-${width}.png`, fullPage: false })
  await context.close()
}

await Bun.$`mkdir -p ${OUT}`.quiet()
const browser = await chromium.launch()
for (const brand of [VELDE, KRACHT]) {
  for (const [w, h] of [
    [375, 812],
    [1440, 900],
  ] as const) {
    await run(browser, brand, w, h)
  }
}
await browser.close()

console.log(
  `\n${problems.length === 0 ? 'DEPLOYED QA PASSED' : `DEPLOYED QA FAILED — ${problems.length} problem(s)`}`,
)
if (problems.length > 0) process.exit(1)
