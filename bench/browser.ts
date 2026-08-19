import { chromium } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { isConfigResponse } from '../packages/agent/src/config'
import type { ConfigResponse } from '../packages/agent/src/types'

/**
 * The one browser harness the bench owns. H2 built it; H4 and H5 use it rather than each growing
 * their own copy of "launch chromium, build the gallery IIFE, inject it into a blank page".
 *
 * It is deliberately NOT a general-purpose page factory. Everything here exists because a specific
 * failure was reproduced against the old form — see the comments on `mount`.
 */

/** Wrapped so a missing binary reads as an instruction, not as a Playwright stack trace. */
export async function openBrowser(): Promise<Browser> {
  try {
    return await chromium.launch()
  } catch (error) {
    throw new Error(
      `could not launch chromium (run \`bunx playwright install chromium\`): ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

/** Built once per run and injected into every page — the same IIFE for every brand and pass. */
export async function buildGallery(): Promise<string> {
  const out = `${import.meta.dir}/../node_modules/.cache/mx-gallery.js`
  const built =
    await Bun.$`bun build bench/gallery.ts --outfile ${out} --target=browser --format=iife`
      .cwd(`${import.meta.dir}/..`)
      .quiet()
      .nothrow()
  if (built.exitCode !== 0) {
    throw new Error(`bench/gallery.ts failed to build:\n${built.stderr.toString()}`)
  }
  return Bun.file(out).text()
}

export type MountOptions = {
  /**
   * H2 renders at 375x5600 so the whole gallery is inside one screenshot; H4 renders at the real
   * 375x667 phone, where the list scrolls. Same widget, two questions, so the viewport is a
   * parameter rather than a constant either check has to work around.
   */
  viewport: { width: number; height: number }
  /**
   * CSS injected into the HOST document before the widget mounts — the hostile page. This is the
   * only vector that reaches inside a shadow root: measured, a rule on `html`/`body` does not
   * cross the boundary, and a rule matching the custom element itself does, `!important` or not.
   */
  hostCss?: string
}

/**
 * A FRESH page per mount, not `setContent` on a reused one. `setContent` keeps the same JS realm,
 * so the custom-element registry and `__MX_GALLERY_READY__` both survive into the next mount: the
 * second injection skips `customElements.define`, `new MxAgent()` throws "Illegal constructor"
 * against the class the first bundle registered, and the already-true ready flag lets the check
 * sail past it into a locator timeout with no widget on the page. Reproduced, then fixed
 * [ENGINEERING §3.4]; a few hundred ms buys the whole class of bug.
 */
export async function mount(
  browser: Browser,
  bundle: string,
  config: ConfigResponse,
  options: MountOptions,
): Promise<Page> {
  const page = await browser.newPage({ viewport: options.viewport })
  await page.setContent(
    `<!doctype html><html><head>${
      options.hostCss ? `<style>${options.hostCss}</style>` : ''
    }</head><body></body></html>`,
  )
  await page.evaluate((payload: ConfigResponse) => {
    window.__MX_GALLERY__ = payload
  }, config)
  await page.addScriptTag({ content: bundle })
  await page.waitForFunction(() => Reflect.get(window, '__MX_GALLERY_READY__') === true)
  // One frame, so layout and the scroll reset have both settled before anything is measured.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))))
  return page
}

export async function readConfig(path: string): Promise<ConfigResponse> {
  const body: unknown = await Bun.file(path).json()
  if (!isConfigResponse(body)) throw new Error(`${path} is not a valid ConfigResponse`)
  return body
}
