import type { DerivedTokens } from '@maximal/tokens'
import { configUrl, loadConfig } from './config'
import { converse } from './converse'
import { MxAgent, TAG } from './widget'

/**
 * The embed entry point — the one `<script>` line, and everything that has to happen before a
 * single pixel is painted. [PRINCIPLES §5]
 */

/**
 * Captured synchronously at module top, before any await: `document.currentScript` is only ours
 * while the script body is executing and reads null from every callback afterwards.
 */
const script = document.currentScript

/**
 * `@font-face` does not resolve inside a shadow root, so the merchant's font stylesheet goes into
 * the HOST head. The documented trade-off of not using an iframe: one link tag on their page, and
 * we own it out loud rather than hiding it. [PRINCIPLES §5]
 */
function injectFonts(fonts: DerivedTokens['fonts']): void {
  for (const href of new Set([fonts.display.href, fonts.body.href])) {
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`) !== null) continue
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.append(link)
  }
}

async function bodyReady(): Promise<HTMLElement> {
  if (document.body !== null) return document.body
  await new Promise<void>((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
  })
  return document.body
}

async function boot(): Promise<void> {
  if (!(script instanceof HTMLScriptElement)) {
    throw new Error('maximal: agent.js must run as a classic <script> tag on the page')
  }
  const shop = script.dataset.shop
  if (shop === undefined || shop === '') {
    throw new Error('maximal: <script src=".../agent.js"> is missing its data-shop attribute')
  }

  // Nothing is created, appended or painted until the config resolves — no unbranded flash.
  const config = await loadConfig(shop, configUrl(script.src, shop), localStorage)
  injectFonts(config.tokens.fonts)

  if (customElements.get(TAG) === undefined) customElements.define(TAG, MxAgent)
  const agent = new MxAgent(config)
  // Wired before mount so the first thing a shopper types cannot outrun the listener.
  converse(agent, config)
  const body = await bodyReady()
  // LAST child of <body> on purpose: the launcher's z-index is already at the 32-bit ceiling, so
  // paint order is what breaks the tie against a cookie banner sitting at the same number.
  body.append(agent)
}

boot().catch((error: unknown) => {
  console.error('maximal: agent failed to start', error)
})
