import { chromium } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { KRACHT, VELDE, derive } from '@maximal/tokens'
import type { MerchantTokens } from '@maximal/tokens'
import type { Check, CheckResult } from '../checks'
import { isConfigResponse } from '../../packages/agent/src/config'
import type { ConfigResponse } from '../../packages/agent/src/types'

// H2 `brand-divergence` (BENCHMARKS §1, TASKS.md T5). The most important number in the project:
// the claim being graded is that the widget is BUILT for many brands, not styled for one, and this
// is what makes that claim falsifiable.
//
// Three assertions, because one number cannot carry the claim on its own:
//   1. perceptual distance between the two brand columns, in greyscale, above a pinned floor;
//   2. >=4 of five non-colour properties differing across the rendered shadow roots;
//   3. no horizontal overflow at 375px, under either brand, on any block.
//
// Assertion 1 alone is exactly what BENCHMARKS §1 warns about: VELDE and KRACHT are greyscale 250
// against 25, so an 88% field delta clears any floor before a single spacing or radius token
// contributes anything — a widget that themed `surface` and `accent` and ignored `density`,
// `radius`, `elevation` and `labelCase` entirely would pass. So the ground is normalised first
// (both brands re-derived against an IDENTICAL surface — the second of the two options BENCHMARKS
// offers, and the deterministic one), and assertion 2 measures structure directly.

const VIEWPORT_WIDTH = 375

/**
 * Tall on purpose. At 375x667 the panel is the whole viewport and `widget.ts` autoscrolls the
 * message list on every push, so a 667px-high shot captures the LAST two blocks and the two brands
 * land at different scroll offsets — the metric would be measuring which blocks happened to be
 * visible. 375 is what DoD box 3 is about; the height only has to be enough to hold every block
 * under the more generous of the two type ramps — VELDE needs 4301px of message list, KRACHT
 * 3157px, measured. `assertNothingCut` below turns "all 7 blocks are in the shot" into something
 * mechanical rather than something this constant is assumed to be big enough for.
 */
const VIEWPORT_HEIGHT = 5000

/**
 * The shared ground for assertion 1. Every text and surface variable derives from `surface`, so
 * forcing both brands onto the same one removes the light-vs-dark field delta and leaves accent,
 * spacing, radius, elevation, type ramp, tracking and transform as the only things that can move
 * the number.
 */
const NORMALISED_SURFACE = '#FFFFFF'

/**
 * The floor, pinned once from the first side-by-side that genuinely looked right, and only ever
 * ratcheted UP [BENCHMARKS §4.4]. `bench/gallery/*.png` is the contact sheet it was pinned against;
 * it was looked at, not just measured, and two real defects came out of that look — see the
 * hand-off.
 *
 * MEASURED: 0.1507, stable across runs (the render has no network, no webfont and no timing input).
 * PINNED at 0.11, which is ~27% headroom. The headroom is not timidity: T9 is a polish pass over
 * exactly these surfaces, the rule forbids ever lowering this number, and a HARD gate that goes red
 * on legitimate polish has no legal repair. A run that comes in materially above 0.1507 is the
 * moment to ratchet.
 *
 * For scale, the same measurement was 0.0724 while a flex-shrink bug was crushing every product
 * card — so this number does move on real regressions rather than sitting comfortably above
 * anything the widget could do.
 */
const DISTANCE_FLOOR = 0.11

/** BENCHMARKS §1 H2: "assert >=4 differ" out of these five. */
const STRUCTURAL_PROPERTIES = [
  'padding',
  'borderRadius',
  'letterSpacing',
  'boxShadow',
  'textTransform',
] as const

/**
 * Named explicitly rather than left to whatever the implementation happened to render. `.panel`
 * alone differs on only one of the five, so an unnamed element set would make this assertion one
 * implementation choice away from failing on a correct build.
 */
const STRUCTURAL_SELECTORS = [
  '.launcher',
  '.msg',
  '.chip',
  '.card',
  '.card-title',
  '.label',
  '.send',
  '.nomatch',
]

type Brand = { name: string; merchant: MerchantTokens; configPath: string }

const BRANDS: Brand[] = [
  { name: 'velde', merchant: VELDE, configPath: 'apps/platform/config/velde.json' },
  { name: 'kracht', merchant: KRACHT, configPath: 'apps/platform/config/kracht.json' },
]

type Rendered = {
  brand: string
  /** Base64 PNG of the panel, so the comparison can happen in a browser that already decodes PNG. */
  shot: string
  structure: Record<string, string>
  overflow: { element: string; scrollWidth: number; clientWidth: number }[]
}

async function readConfig(path: string): Promise<ConfigResponse> {
  const body: unknown = await Bun.file(path).json()
  if (!isConfigResponse(body)) throw new Error(`${path} is not a valid ConfigResponse`)
  return body
}

/** Built once and injected into every page — the same IIFE for both brands and both passes. */
async function buildGallery(): Promise<string> {
  const out = `${import.meta.dir}/../../node_modules/.cache/mx-gallery.js`
  const built =
    await Bun.$`bun build bench/gallery.ts --outfile ${out} --target=browser --format=iife`
      .cwd(`${import.meta.dir}/../..`)
      .quiet()
      .nothrow()
  if (built.exitCode !== 0) {
    throw new Error(`bench/gallery.ts failed to build:\n${built.stderr.toString()}`)
  }
  return Bun.file(out).text()
}

/**
 * A FRESH page per render, not `setContent` on a reused one. `setContent` keeps the same JS realm,
 * so the custom-element registry and `__MX_GALLERY_READY__` both survive into the next mount: the
 * second injection skips `customElements.define`, `new MxAgent()` throws "Illegal constructor"
 * against the class the first bundle registered, and the already-true ready flag lets the check
 * sail past it into a locator timeout with no widget on the page. Reproduced, then fixed
 * [ENGINEERING §3.4]; a few hundred ms buys the whole class of bug.
 */
async function mount(browser: Browser, bundle: string, config: ConfigResponse): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
  })
  await page.setContent('<!doctype html><html><head></head><body></body></html>')
  await page.evaluate((payload: ConfigResponse) => {
    window.__MX_GALLERY__ = payload
  }, config)
  await page.addScriptTag({ content: bundle })
  await page.waitForFunction(() => Reflect.get(window, '__MX_GALLERY_READY__') === true)
  // One frame, so layout and the scroll reset have both settled before the camera opens.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))))
  return page
}

async function render(
  browser: Browser,
  bundle: string,
  brand: Brand,
  config: ConfigResponse,
): Promise<Rendered> {
  const page = await mount(browser, bundle, config)
  const panel = page.locator('.panel')
  const shot = (await panel.screenshot()).toString('base64')

  const structure = await page.evaluate((selectors: string[]) => {
    const root = document.querySelector('mx-agent')?.shadowRoot
    const out: Record<string, string> = {}
    for (const selector of selectors) {
      const node = root?.querySelector(selector)
      if (!(node instanceof HTMLElement)) continue
      const style = getComputedStyle(node)
      out[`${selector}|padding`] = `${style.paddingTop} ${style.paddingLeft}`
      out[`${selector}|borderRadius`] = style.borderRadius
      out[`${selector}|letterSpacing`] = style.letterSpacing
      out[`${selector}|boxShadow`] = style.boxShadow
      out[`${selector}|textTransform`] = style.textTransform
    }
    return out
  }, STRUCTURAL_SELECTORS)

  /*
   * `.messages` and each block root, never `.panel`: the panel is `overflow: hidden`, so it reports
   * `scrollWidth === clientWidth` while clipping content that overflows by any amount. The compare
   * table's own `overflow-x: auto` scroller is a scroll container BY DESIGN — three columns cannot
   * fit at 375px and swiping beats clipping — so the measurement is on block ROOTS, which must
   * never be wider than the list that holds them.
   */
  const overflow = await page.evaluate(() => {
    const root = document.querySelector('mx-agent')?.shadowRoot
    const list = root?.querySelector('.messages')
    if (!(list instanceof HTMLElement)) return []
    const found: { element: string; scrollWidth: number; clientWidth: number }[] = []
    if (list.scrollWidth > list.clientWidth) {
      found.push({
        element: '.messages',
        scrollWidth: list.scrollWidth,
        clientWidth: list.clientWidth,
      })
    }
    for (const child of Array.from(list.children)) {
      if (!(child instanceof HTMLElement)) continue
      if (child.getBoundingClientRect().width > list.clientWidth + 0.5) {
        found.push({
          element: child.className,
          scrollWidth: Math.round(child.getBoundingClientRect().width),
          clientWidth: list.clientWidth,
        })
      }
    }
    return found
  })

  /*
   * H2 says "render all 7 message blocks ... screenshot". A list that scrolls has blocks the camera
   * never saw, and the two brands would clip at different places because their type ramps differ —
   * so the number would be measuring which blocks happened to fit. This is the assertion that makes
   * the claim true instead of assumed.
   */
  const cut = await page.evaluate(() => {
    const list = document.querySelector('mx-agent')?.shadowRoot?.querySelector('.messages')
    if (!(list instanceof HTMLElement)) return null
    return { scrollHeight: list.scrollHeight, clientHeight: list.clientHeight }
  })
  if (cut === null) throw new Error(`${brand.name}: no message list rendered`)
  if (cut.scrollHeight > cut.clientHeight) {
    throw new Error(
      `${brand.name}: the gallery does not fit the canvas (${cut.scrollHeight}px of blocks in ${cut.clientHeight}px), so the screenshot is missing blocks. Raise VIEWPORT_HEIGHT.`,
    )
  }

  await page.close()
  return { brand: brand.name, shot, structure, overflow }
}

/**
 * Greyscale mean absolute difference, computed in the browser so the PNGs are decoded by the same
 * engine that drew them — no image dependency enters the repo for one number. Desaturation is
 * Rec. 709 luma; the ground was already normalised before the shot was taken.
 */
async function distance(page: Page, a: string, b: string): Promise<number> {
  await page.setContent('<!doctype html><html><body></body></html>')
  return page.evaluate(
    async ([left, right]: string[]) => {
      const load = (data: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = () => reject(new Error('gallery screenshot failed to decode'))
          image.src = `data:image/png;base64,${data}`
        })
      const [one, two] = await Promise.all([load(left ?? ''), load(right ?? '')])
      const width = Math.min(one.width, two.width)
      const height = Math.min(one.height, two.height)
      const grey = (image: HTMLImageElement): Float64Array => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (context === null) throw new Error('no 2d context')
        context.drawImage(image, 0, 0)
        const { data } = context.getImageData(0, 0, width, height)
        const out = new Float64Array(width * height)
        for (let i = 0; i < out.length; i++) {
          const r = data[i * 4] ?? 0
          const g = data[i * 4 + 1] ?? 0
          const b = data[i * 4 + 2] ?? 0
          out[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        return out
      }
      const first = grey(one)
      const second = grey(two)
      let total = 0
      for (let i = 0; i < first.length; i++) total += Math.abs((first[i] ?? 0) - (second[i] ?? 0))
      return total / first.length / 255
    },
    [a, b],
  )
}

/** Counts the five properties that differ on at least one shared element. */
function differingProperties(a: Record<string, string>, b: Record<string, string>): string[] {
  return STRUCTURAL_PROPERTIES.filter((property) =>
    Object.keys(a).some((key) => key.endsWith(`|${property}`) && a[key] !== b[key]),
  )
}

async function openBrowser(): Promise<Browser> {
  try {
    return await chromium.launch()
  } catch (error) {
    throw new Error(
      `chromium could not launch — run \`bunx playwright install chromium\` and try again. (${
        error instanceof Error ? error.message : String(error)
      })`,
    )
  }
}

async function run(): Promise<CheckResult> {
  const bundle = await buildGallery()
  const browser = await openBrowser()
  try {
    const normalised: Rendered[] = []
    let blocksSeen = 0

    for (const brand of BRANDS) {
      const real = await readConfig(brand.configPath)
      // Assertion 1 renders against the shared ground; the human contact sheet renders against the
      // real brand, because a greyscale-normalised PNG is not what a reviewer needs to look at.
      const forced: ConfigResponse = {
        ...real,
        tokens: derive({ ...brand.merchant, surface: NORMALISED_SURFACE }),
      }
      normalised.push(await render(browser, bundle, brand, forced))

      const sheet = await mount(browser, bundle, real)
      await sheet.locator('.panel').screenshot({ path: `bench/gallery/${brand.name}.png` })
      blocksSeen += await sheet.evaluate(
        () =>
          document.querySelector('mx-agent')?.shadowRoot?.querySelectorAll('.messages > *')
            .length ?? 0,
      )
      await sheet.close()
    }

    const [first, second] = normalised
    if (first === undefined || second === undefined) throw new Error('divergence: need two brands')

    const overflowing = [...first.overflow, ...second.overflow]
    if (overflowing.length > 0) {
      throw new Error(
        `horizontal overflow at ${VIEWPORT_WIDTH}px: ${overflowing
          .map((o) => `${o.element} ${o.scrollWidth}>${o.clientWidth}`)
          .join(', ')}`,
      )
    }

    const differing = differingProperties(first.structure, second.structure)
    if (differing.length < 4) {
      throw new Error(
        `only ${differing.length} of ${STRUCTURAL_PROPERTIES.length} structural properties differ between the brands (${differing.join(', ')}). Colour alone is not a second brand. [BENCHMARKS §1 H2]`,
      )
    }

    const metrics = await browser.newPage()
    const measured = await distance(metrics, first.shot, second.shot)
    await metrics.close()
    if (measured < DISTANCE_FLOOR) {
      throw new Error(
        `perceptual distance ${measured.toFixed(4)} is below the pinned floor ${DISTANCE_FLOOR}. Never lower the floor to make this pass [BENCHMARKS §4.1/§4.4].`,
      )
    }

    return {
      // Every block rendered under every brand, which is what H2 says it examines. A run that
      // rendered nothing must never read as a pass. [ENGINEERING §3.1]
      count: blocksSeen,
      detail: `distance ${measured.toFixed(4)} >= ${DISTANCE_FLOOR} (ground normalised to ${NORMALISED_SURFACE}); ${differing.length}/5 structural properties differ (${differing.join(', ')}); ${blocksSeen} block renders, no overflow at ${VIEWPORT_WIDTH}px; contact sheet in bench/gallery/`,
    }
  } finally {
    await browser.close()
  }
}

export const divergence: Check = { name: 'brand-divergence', tier: 'HARD', run }
