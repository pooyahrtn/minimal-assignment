import type { DerivedTokens } from '@maximal/tokens'

/**
 * The live preview: a real iframe of a real storefront with a real shadow root inside it, not a
 * phone frame on a gradient [PRINCIPLES §9.3]. The widget already on that page is the one being
 * restyled — we are not mounting a second copy.
 *
 * The channel is `postMessage`, origin-checked on both ends. It exists because the alternatives
 * do not work: the storefront is cross-origin by construction (`:4001`/`:4002` against our
 * `:4003`), so nothing here can reach into its DOM, and `loadConfig` is deliberately cache-first —
 * it repaints on the NEXT page load, which is right for a shopper mid-sentence and useless for a
 * merchant dragging a slider.
 */

/** The two storefronts we can frame. A foreign URL is previewed over one of these instead. */
export const STOREFRONTS: Record<string, string> = {
  velde: 'http://localhost:4001',
  kracht: 'http://localhost:4002',
}

export class Preview {
  private ready = false
  /**
   * The last payload sent, KEPT rather than cleared once delivered. A storefront is full of
   * product links and the merchant will click one; every navigation is a fresh document with a
   * fresh widget that has never heard of their edits, and the preview would silently revert to
   * the storefront's shipped brand. Replaying on each handshake makes a reload a no-op instead.
   * It also covers the original reason for holding it: `iframe.onload` fires long before the
   * config fetch resolves, so an eager first post lands on a page with no listener yet.
   */
  private last: Record<string, unknown> | null = null
  private readonly origin: string

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly onReady: () => void,
  ) {
    this.origin = window.location.origin
    window.addEventListener('message', (event: MessageEvent) => this.receive(event))
  }

  private receive(event: MessageEvent): void {
    // The widget posts its handshake with OUR origin as the target, and the storefront it sits on
    // is the sender — so the check that matters is that the payload is the shape we expect from
    // the frame we opened, not an origin allowlist we would have to keep in sync with T15's
    // deployed hostnames.
    if (event.source !== this.frame.contentWindow) return
    const data = event.data
    if (typeof data !== 'object' || data === null) return
    if (!('type' in data) || data.type !== 'mx:preview-ready') return
    this.ready = true
    if (this.last !== null) this.post(this.last)
    this.onReady()
  }

  /** Point the preview at a DIFFERENT storefront. Drops the held payload, because the tokens
   *  belong to the session, not to the page — a deliberate switch starts clean. An in-frame
   *  navigation is the opposite case and keeps them; see `last`. */
  load(storefrontOrigin: string): void {
    this.ready = false
    this.last = null
    this.frame.src = storefrontOrigin
  }

  private post(payload: Record<string, unknown>): void {
    // `'*'` would be wrong here even though the frame is ours: the storefront could navigate and
    // a wildcard target would hand the payload to whatever page took its place. Targeting the
    // storefront's own origin means a navigated frame silently drops it instead.
    const target = new URL(this.frame.src, this.origin).origin
    this.frame.contentWindow?.postMessage(payload, target)
  }

  /**
   * Push the derived tokens into the mounted widget. Coalesced by the caller, not here — a colour
   * input fires on every pointer move and each post is a full custom-property sweep.
   */
  send(tokens: DerivedTokens, fontHref: string | null): void {
    const payload: Record<string, unknown> = {
      type: 'mx:preview',
      css: tokens.css,
      launcherStyle: tokens.launcher.style,
    }
    if (fontHref !== null) payload.fontHref = fontHref
    this.last = payload
    if (this.ready) this.post(payload)
  }
}
