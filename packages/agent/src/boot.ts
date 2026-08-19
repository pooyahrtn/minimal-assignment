import type { CacheStore } from './config'
import { configUrl, isRecord, loadConfig } from './config'
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
function injectFonts(fonts: { display: { href: string }; body: { href: string } }): void {
  for (const href of new Set([fonts.display.href, fonts.body.href])) {
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`) !== null) continue
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.append(link)
  }
}

/**
 * Reading `window.localStorage` — the property access itself, before any method call — throws
 * `SecurityError` in Safari and strict Firefox whenever third-party storage is blocked, which is
 * every cross-origin iframe. `readCache`/`writeCache` already catch internally, but the throw
 * lands before they are ever reached, `boot()` rejects, and the widget never paints at all.
 *
 * Fixed here rather than at the one call site that surfaced it (T7's preview iframe), because a
 * shopper browsing a merchant's real storefront with third-party storage blocked hits the
 * identical path. Degrading to a no-op store costs one config fetch per page load and nothing
 * else — `loadConfig` treats an empty cache as a cold start, which is exactly right.
 */
function safeStore(): CacheStore {
  try {
    const store = window.localStorage
    // Prove it is usable, not merely reachable: Safari's private mode hands back a real object
    // whose setItem throws on the first write.
    store.setItem('mx-probe', '1')
    store.removeItem('mx-probe')
    return store
  } catch {
    return { getItem: () => null, setItem: () => undefined }
  }
}

/**
 * The live-preview channel for the configuration page [TASKS T7]. The config page cannot reach
 * into a cross-origin storefront iframe, and `loadConfig` is deliberately cache-first — it
 * repaints on the NEXT load, which is right for a shopper mid-sentence and useless for a merchant
 * dragging a colour picker.
 *
 * Trust boundary: messages are accepted only from the origin that served this script. That origin
 * already ships the code running on the merchant's page, so it is not a new authority — and every
 * other origin, including the storefront's own page, is ignored.
 *
 * Mutation is in place, never a re-mount. `styles()` writes the custom properties into a `:host`
 * rule, so an inline `setProperty` on the host element overrides them — which covers colour,
 * spacing, radius, the type ramp and label treatment without touching the DOM. That still holds
 * after T9 hardened `:host` to `all: initial !important`: the hardening is on the properties the
 * rule re-states AND on the `--mx-*` declarations, because `all` does not touch custom properties
 * and a host page's `* { --mx-accent: … }` therefore reached straight into the shadow root. The
 * override below stays on top of that by writing into a stylesheet INSIDE the shadow root — an
 * inline style on the host is outer context and loses to an important `:host` rule, which is the
 * same cascade rule that keeps the merchant's theme out. Change one of those two and the preview
 * goes dead, so both sides say so. Re-mounting would leak the constructor's `visualViewport`/`resize`/document
 * `click` listeners onto the storefront's window on every keystroke, drop the `converse` wiring,
 * and wipe the conversation.
 */
function applyPreviewVars(agent: MxAgent, vars: unknown): void {
  if (!isRecord(vars)) return
  for (const [name, value] of Object.entries(vars)) {
    // An origin check makes the sender trusted, not the payload well-formed. Only real token
    // names get through, so nothing can write an arbitrary inline style onto the host element.
    // Into the shadow root, not onto the host's inline style. The `:host` token block is
    // `!important` so a merchant theme cannot repaint the widget through `--mx-*`, and for
    // important declarations the shadow context outranks the outer one — so an inline style on
    // `<mx-agent>` loses to our own reset. `setPreviewVar` writes where it can win. [widget.ts]
    if (name.startsWith('--mx-') && typeof value === 'string') agent.setPreviewVar(name, value)
  }
}

function applyPreview(agent: MxAgent, data: Record<string, unknown>): void {
  applyPreviewVars(agent, data.css)
  // `launcher.style` is a DOM attribute the stylesheet selects on, not a custom property, so it
  // is the one control that does not follow an inline var.
  const launcherStyle = data.launcherStyle
  if (typeof launcherStyle === 'string') agent.setPreviewLauncherStyle(launcherStyle)
  const fontHref = data.fontHref
  if (typeof fontHref === 'string') {
    injectFonts({ display: { href: fontHref }, body: { href: fontHref } })
  }
}

function listenForPreview(agent: MxAgent, origin: string): void {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== origin) return
    const data = event.data
    if (!isRecord(data) || data.type !== 'mx:preview') return
    applyPreview(agent, data)
  })
  // The handshake. `iframe.onload` fires long before the config fetch resolves, so without this
  // the config page's first post lands on a page with no listener and is silently dropped.
  window.parent.postMessage({ type: 'mx:preview-ready' }, origin)
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
  const config = await loadConfig(shop, configUrl(script.src, shop), safeStore())
  injectFonts(config.tokens.fonts)

  if (customElements.get(TAG) === undefined) customElements.define(TAG, MxAgent)
  const agent = new MxAgent(config)
  // Wired before mount so the first thing a shopper types cannot outrun the listener.
  // The chat endpoint resolves against `script.src`, exactly as the config URL does — the platform
  // origin is wherever this bundle was served from, never a literal. [TASKS T13]
  converse(agent, config, { url: new URL('/v1/chat', script.src).href, shop })
  const body = await bodyReady()
  // LAST child of <body> on purpose: the launcher's z-index is already at the 32-bit ceiling, so
  // paint order is what breaks the tie against a cookie banner sitting at the same number.
  body.append(agent)

  // Registered here, after mount, and never at module scope: `script.src` is only safe to read
  // behind the `instanceof` guard above, and a module-scope `new URL(null)` would turn a page
  // with no `document.currentScript` (a tag-manager wrapper, a dynamic import) from graceful
  // degradation into a hard crash on a merchant's storefront.
  if (window.parent !== window) listenForPreview(agent, new URL(script.src).origin)
}

boot().catch((error: unknown) => {
  console.error('maximal: agent failed to start', error)
})
