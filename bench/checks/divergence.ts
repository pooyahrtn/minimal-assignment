import type { Browser, Page } from '@playwright/test'
import { KRACHT, VELDE, derive } from '@maximal/tokens'
import type { MerchantTokens } from '@maximal/tokens'
import { buildGallery, mount, openBrowser, readConfig } from '../browser'
import type { Check, CheckResult } from '../checks'
import { judgeOverflow, measureList } from '../overflow'
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
 * under the more generous of the two type ramps — VELDE needs 4863px of message list, KRACHT
 * 3500px, measured after the 40-character word was pushed into every block. `assertNothingCut` below turns "all 7 blocks are in the shot" into something
 * mechanical rather than something this constant is assumed to be big enough for.
 */
const VIEWPORT_HEIGHT = 5600

const VIEWPORT = { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }

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
 * MEASURED: 0.1410, stable across runs (the render has no network, no webfont and no timing input).
 * PINNED at 0.11, which is ~27% headroom. The headroom is not timidity: T9 is a polish pass over
 * exactly these surfaces, the rule forbids ever lowering this number, and a HARD gate that goes red
 * on legitimate polish has no legal repair. A run that comes in materially above 0.1410 is the
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
  /** Structural selectors that matched nothing on this render — see `judgeDivergence`. */
  missing: string[]
  overflow: { element: string; scrollWidth: number; clientWidth: number }[]
}

async function render(
  browser: Browser,
  bundle: string,
  brand: Brand,
  config: ConfigResponse,
): Promise<Rendered> {
  const page = await mount(browser, bundle, config, { viewport: VIEWPORT })
  const panel = page.locator('.panel')
  const shot = (await panel.screenshot()).toString('base64')

  const { structure, missing } = await page.evaluate((selectors: string[]) => {
    const root = document.querySelector('mx-agent')?.shadowRoot
    const out: Record<string, string> = {}
    const absent: string[] = []
    for (const selector of selectors) {
      const node = root?.querySelector(selector)
      // Reported, not skipped. A selector that matches nothing contributes no keys, so it can
      // never make two brands differ — and the >=4 bar then gets cleared by whatever survived.
      if (!(node instanceof HTMLElement)) {
        absent.push(selector)
        continue
      }
      const style = getComputedStyle(node)
      out[`${selector}|padding`] = `${style.paddingTop} ${style.paddingLeft}`
      out[`${selector}|borderRadius`] = style.borderRadius
      out[`${selector}|letterSpacing`] = style.letterSpacing
      out[`${selector}|boxShadow`] = style.boxShadow
      out[`${selector}|textTransform`] = style.textTransform
    }
    return { structure: out, missing: absent }
  }, STRUCTURAL_SELECTORS)

  /*
   * `.messages` and every DESCENDANT, not just the block roots. A block root can be exactly
   * panel-width while clipping its own heading by 107px, because the card wrappers are
   * `overflow: hidden` — which is precisely how a 40-character word survived this assertion while
   * rendering as "CLOSEST WITHOUT “RIJKSMUSEUMSTRAATVERLICHTINGSPROJE" cut at the card edge.
   * Measuring `scrollWidth > clientWidth` on each element catches content that overflows its own
   * box; measuring outer width against the list catches a block that widens the panel. Both are
   * needed and neither substitutes for the other.
   *
   * `.compare-scroll` and its subtree are exempt BY DESIGN: three columns cannot fit at 375px and
   * a swipe beats clipping, so that one container is allowed to scroll horizontally.
   */
  const measurements = await measureList(page)

  // The browser side only measures; the judgement is made here, where it reads plainly and where a
  // serialisable callback does not have to carry it.
  //
  // Two different failures, and neither substitutes for the other. `scrollWidth > clientWidth` on
  // EVERY descendant catches content overflowing its own box — the case that let a 40-character
  // word render as "CLOSEST WITHOUT “RIJKSMUSEUMSTRAATVERLICHTINGSPROJE", clipped at the card edge,
  // while every block root sat exactly at panel width because the card wrappers are
  // `overflow: hidden`. Outer width against the list catches a block that widens the panel.
  const overflow = judgeOverflow(measurements)

  /*
   * H2 says "render all 7 message blocks ... screenshot". A list that scrolls has blocks the camera
   * never saw, and the two brands clip at different places because their type ramps differ — so the
   * number would measure which blocks happened to fit. This makes the claim mechanical.
   */
  const list = measurements.find((m) => m.element.includes('messages'))
  if (list === undefined) throw new Error(`${brand.name}: no message list rendered`)
  // Height, not width: the list scrolls vertically, so "a block the camera never saw" is a
  // scrollHeight that exceeds the visible clientHeight.
  if (list.scrollHeight > list.clientHeight) {
    throw new Error(
      `${brand.name}: the gallery does not fit the canvas (${list.scrollHeight}px of blocks in ${list.clientHeight}px), so the screenshot is missing blocks. Raise VIEWPORT_HEIGHT.`,
    )
  }

  await page.close()
  return { brand: brand.name, shot, structure, missing, overflow }
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

/**
 * Counts the five properties that differ on at least one shared element — but only over the
 * elements T5 actually owns. Counting over every selector let `.launcher` alone carry all five,
 * so a build that themed the shell chrome and hardcoded every message block would still have
 * reported 5/5. The claim being made is about the BLOCKS.
 */
const BLOCK_SELECTORS = ['.msg', '.chip', '.card', '.card-title', '.label', '.nomatch']

function differingProperties(a: Record<string, string>, b: Record<string, string>): string[] {
  return STRUCTURAL_PROPERTIES.filter((property) =>
    Object.keys(a).some(
      (key) =>
        key.endsWith(`|${property}`) &&
        BLOCK_SELECTORS.some((selector) => key.startsWith(`${selector}|`)) &&
        a[key] !== b[key],
    ),
  )
}

/**
 * The side-by-side both brands are reviewed on. TASKS §2 requires deliverables that are SETS to be
 * reviewed as a set — a per-block checklist cannot see repetition or incoherence — and a sheet
 * composed by hand goes stale the first time anyone reruns the check without remembering to redo
 * it. So the check that produces the two columns produces the sheet too.
 */
async function writeContactSheet(browser: Browser): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 900, height: 1400 } })
  const encode = async (name: string): Promise<string> =>
    Buffer.from(await Bun.file(`bench/gallery/${name}.png`).arrayBuffer()).toString('base64')
  const [velde, kracht] = await Promise.all([encode('velde'), encode('kracht')])
  await page.setContent(
    `<body style="margin:0;display:flex;gap:8px;background:#777">
      <img src="data:image/png;base64,${velde}" style="width:440px">
      <img src="data:image/png;base64,${kracht}" style="width:440px">
    </body>`,
  )
  await page.screenshot({ path: 'bench/gallery/contact-sheet.png', fullPage: true })
  await page.close()
}

/**
 * H2's judgement, split from its gathering so `bench/fault.test.ts` can feed it a failing case
 * without driving a browser [TASKS T9 DoD]. Fault-injecting the whole check would mean shipping a
 * deliberately broken brand config, which is a worse thing to have in the tree than this seam.
 */
export function judgeDivergence(input: {
  overflow: { element: string; scrollWidth: number; clientWidth: number }[]
  missing: string[]
  differing: string[]
  measured: number
}): string[] {
  const failures: string[] = []
  if (input.overflow.length > 0) {
    failures.push(
      `horizontal overflow at ${VIEWPORT_WIDTH}px: ${input.overflow
        .map((o) => `${o.element} ${o.scrollWidth}>${o.clientWidth}`)
        .join(', ')}`,
    )
  }
  // A selector that rendered under NEITHER brand used to `continue` silently, contributing no keys
  // and therefore no difference — so a block that vanished entirely left the >=4 bar to be cleared
  // by the survivors and the check stayed green. A structural claim about blocks that are not on
  // the page is not a claim.
  if (input.missing.length > 0) {
    failures.push(
      `structural selector(s) rendered under no brand, so nothing was compared for them: ${input.missing.join(', ')}`,
    )
  }
  if (input.differing.length < 4) {
    failures.push(
      `only ${input.differing.length} of ${STRUCTURAL_PROPERTIES.length} structural properties differ between the brands (${input.differing.join(', ')}). Colour alone is not a second brand. [BENCHMARKS §1 H2]`,
    )
  }
  if (input.measured < DISTANCE_FLOOR) {
    failures.push(
      `perceptual distance ${input.measured.toFixed(4)} is below the pinned floor ${DISTANCE_FLOOR}. Never lower the floor to make this pass [BENCHMARKS §4.1/§4.4].`,
    )
  }
  return failures
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

      const sheet = await mount(browser, bundle, real, { viewport: VIEWPORT })
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

    const differing = differingProperties(first.structure, second.structure)

    const metrics = await browser.newPage()
    const measured = await distance(metrics, first.shot, second.shot)
    await metrics.close()
    await writeContactSheet(browser)

    // All three judged together, and all three reported rather than thrown: a run that overflows
    // AND fails the floor should say both, because the second is often the explanation for the
    // first. The old form stopped at whichever came first in this function.
    const failures = judgeDivergence({
      overflow: [...first.overflow, ...second.overflow],
      missing: [...first.missing, ...second.missing],
      differing,
      measured,
    })

    return {
      // Every block rendered under every brand, which is what H2 says it examines. A run that
      // rendered nothing must never read as a pass. [ENGINEERING §3.1]
      count: blocksSeen,
      failures,
      detail: `distance ${measured.toFixed(4)} >= ${DISTANCE_FLOOR} (ground normalised to ${NORMALISED_SURFACE}); ${differing.length}/5 structural properties differ (${differing.join(', ')}); ${blocksSeen} block renders, no overflow at ${VIEWPORT_WIDTH}px; contact sheet in bench/gallery/`,
    }
  } finally {
    await browser.close()
  }
}

export const divergence: Check = { name: 'brand-divergence', tier: 'HARD', run }
