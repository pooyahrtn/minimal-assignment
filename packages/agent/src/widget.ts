import type { Voice } from '@maximal/tokens'
import { renderBlock, renderChips, renderText } from './blocks'
import { str } from './config'
import { MOBILE_QUERY, styles } from './css'
import type { Block, Chip, ConfigResponse } from './types'

export const TAG = 'mx-agent'

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  return node
}

/** A mark, not a face: the brand initial when the merchant has no avatar. VELDE is this case. */
function markNode(voice: Voice): HTMLElement {
  const mark = el('span', 'mark')
  mark.textContent = voice.name.slice(0, 1)
  mark.setAttribute('aria-hidden', 'true')
  return mark
}

function avatarNode(voice: Voice): HTMLElement {
  const avatar = voice.avatar
  if (avatar === null) return markNode(voice)
  const image = el('img', 'avatar')
  image.src = avatar.src
  image.alt = ''
  // The avatar path is the merchant's to get right. If it 404s we show the mark rather than a
  // broken-image icon in the header of their storefront.
  image.addEventListener('error', () => image.replaceWith(markNode(voice)), { once: true })
  return image
}

/**
 * The one piece of this widget that is not the merchant's. Its text, its presence and the fact
 * that no config key can suppress it are literals here, outside the token system entirely
 * [PRINCIPLES §9] — `strings` is merchant-owned via `tools/build-config.ts`, so a signature that
 * lived there would be merchant-settable by construction.
 *
 * It says "AI" and not "Maximal" on purpose. EU AI Act Article 50 has been binding since
 * 2026-08-02 and asks that AI interaction be clear and distinguishable "at the latest at the time
 * of the first interaction" — a widget engineered to disappear into the host page is the case
 * least likely to earn the "obvious to a reasonably well-informed person" exemption
 * [COMPETITORS §3]. So this is a disclosure that happens to also be our mark, not a vendor credit
 * that happens to mention AI.
 */
const SIGNATURE_TEXT = 'AI'
const SIGNATURE_LABEL = 'AI assistant by Maximal'

/**
 * On the LAUNCHER, not in the panel footer. The launcher is the first interaction; a footer line
 * is seen only after the shopper has already opened the panel and typed, which is later than
 * Art. 50 allows. It also keeps the signature out of `bench/checks/divergence.ts`'s `.panel`
 * screenshot — a brand-constant element inside the H2 shot drags the divergence number down
 * against a floor that must never be lowered [BENCHMARKS §4.1].
 */
function signatureNode(): HTMLElement {
  const badge = el('span', 'signature')
  badge.textContent = SIGNATURE_TEXT
  badge.title = SIGNATURE_LABEL
  return badge
}

/**
 * The agent shell: launcher, panel, header, message list, composer, constraint-chip row — all of
 * it inside one shadow root, so nothing on the storefront can style it and nothing we ship can
 * leak out. [PRINCIPLES §5]
 *
 * Constructed only by the loader with a resolved config, never by the HTML parser, which is what
 * makes a constructor argument safe here: there is no `<mx-agent>` in anyone's markup to upgrade.
 */
export class MxAgent extends HTMLElement {
  private readonly config: ConfigResponse
  private readonly shadow: ShadowRoot
  private readonly launcher: HTMLButtonElement
  private readonly launcherLabel: HTMLSpanElement
  private readonly panel: HTMLDivElement
  private readonly list: HTMLDivElement
  private readonly input: HTMLInputElement
  private chipRow: HTMLElement
  private chips: Chip[] = []
  /** The turn indicator's node while a turn is in flight, else null. See `setPending`. */
  private pending: HTMLElement | null = null
  /** One sticky-bar measurement per frame, however many events asked for one. */
  private stickyBarPending = false
  /** The launcher's last known horizontal centre — see `stickyBarHeight`. */
  private probeX: number | undefined
  /** One viewport sync per frame, however many keyboard events asked for one. */
  private viewportPending = false
  private readonly previewSheet: HTMLStyleElement
  private readonly previewVars = new Map<string, string>()

  constructor(config: ConfigResponse) {
    super()
    this.config = config
    const { voice, strings, tokens } = config

    const sheet = document.createElement('style')
    sheet.textContent = styles(tokens)

    this.launcher = el('button', 'launcher')
    this.launcher.type = 'button'
    this.launcher.dataset.style = tokens.launcher.style
    this.launcherLabel = el(
      'span',
      tokens.launcher.style === 'bubble' ? 'sr-only' : 'launcher-label',
    )
    this.launcherLabel.textContent = str(strings, 'launcher.label')
    // Appended after the label and never read from config: there is no code path from
    // `/v1/config` to removing this node.
    this.launcher.append(avatarNode(voice), this.launcherLabel, signatureNode())
    // The accessible name carries the disclosure even when the visual badge is the only thing a
    // sighted shopper sees — a 2-character mark is not a disclosure to a screen reader.
    this.launcher.setAttribute(
      'aria-label',
      `${str(strings, 'launcher.label')} — ${SIGNATURE_LABEL}`,
    )
    this.launcher.addEventListener('click', () => this.setOpen(true))

    const header = el('header', 'header')
    const name = el('span', 'name')
    name.textContent = voice.name
    const close = el('button', 'close')
    close.type = 'button'
    close.setAttribute('aria-label', str(strings, 'panel.close'))
    close.textContent = '×'
    close.addEventListener('click', () => this.setOpen(false))
    header.append(avatarNode(voice), name, close)

    this.chipRow = renderChips([], strings)

    this.list = el('div', 'messages')
    this.list.setAttribute('role', 'log')
    this.list.setAttribute('aria-live', 'polite')

    const composer = el('form', 'composer')
    this.input = el('input', 'input')
    this.input.type = 'text'
    this.input.autocomplete = 'off'
    this.input.placeholder = str(strings, 'composer.placeholder')
    this.input.setAttribute('aria-label', str(strings, 'composer.placeholder'))
    const send = el('button', 'send')
    send.type = 'submit'
    send.textContent = str(strings, 'composer.send')
    composer.append(this.input, send)
    composer.addEventListener('submit', (event) => {
      event.preventDefault()
      this.send()
    })

    this.panel = el('div', 'panel')
    this.panel.hidden = true
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-modal', 'true')
    this.panel.setAttribute('aria-label', voice.name)
    this.panel.append(header, this.chipRow, this.list, composer)
    // Delegated, because the chip row is replaced wholesale on every update.
    this.panel.addEventListener('click', (event) => this.onPanelClick(event))

    this.shadow = this.attachShadow({ mode: 'open' })
    // Last, so its `:host` rule wins the tie against the one in `sheet`. See `setPreviewVar`.
    this.previewSheet = document.createElement('style')
    this.shadow.append(sheet, this.previewSheet, this.launcher, this.panel)
    this.shadow.addEventListener('keydown', (event) => {
      if (event instanceof KeyboardEvent) this.onKeydown(event)
    })
    /*
     * Both events, not just `resize`. The keyboard changes two numbers and fires a different
     * event for each: `resize` for `visualViewport.height` when it comes up, `scroll` for
     * `offsetTop` when Safari shifts the visible region to keep the focused input above it.
     * Listening to `resize` alone caught the shrink and missed the shift, which is the half a
     * shopper actually sees — see `syncViewport`.
     */
    window.visualViewport?.addEventListener('resize', () => this.scheduleViewport())
    window.visualViewport?.addEventListener('scroll', () => this.scheduleViewport())
    window.addEventListener('resize', () => this.clearStickyBar())
    /*
     * Cookie banners go away when the shopper consents, and nothing tells us. VELDE dismisses from
     * a document `click` listener (`assets/velde.js`), KRACHT from a React `onClick` — so the
     * banner is still laid out during `pointerdown` and during the capture phase, and gone by the
     * time a BUBBLING `click` reaches the document. Measured both ways: on `pointerdown` the probe
     * still reads the banner's full height and the launcher stays lifted by a bar that no longer
     * exists. Bubble phase is the only one that sees the page the shopper just made.
     *
     * Deferred one frame rather than measured inside the listener, and that is load-bearing: both
     * handlers are bubble-phase on `document`, so which one runs first is decided by registration
     * order — and `agent.js` is `async` while `velde.js` is `defer`, so ours can easily be first.
     * A frame later, every handler for that click has run and layout has settled, whoever
     * registered first.
     *
     * A `MutationObserver` would catch the case where a banner leaves without a click at all; it
     * is the upgrade if that ever shows up, and it costs an observer on the whole body to buy it.
     */
    // Never removed, like the two listeners above it — which is exactly why `boot.ts` forbids
    // re-mounting the widget and mutates it in place instead. One element, one page, one lifetime.
    document.addEventListener('click', () => this.scheduleStickyBar())
    /*
     * The other half, and the one a real storefront forced. VELDE's banner LEAVES on a click, so
     * the listener above catches it. KRACHT's banner ARRIVES — `CookieBar.tsx` renders it from a
     * `useEffect` after hydration, which is after `window.load`, which was the widget's last
     * measurement. Measured on KRACHT's PDP, 6 runs out of 6: the launcher lifted 73px for the
     * add-to-cart bar and then sat on top of a 143px cookie bar that had appeared underneath it.
     * A click listener cannot see that; nothing was clicked.
     *
     * `childList` on the whole body is the blunt instrument the earlier comment named as the
     * upgrade "if it ever matters". It matters. Coalesced to one measurement per frame, and one
     * measurement is a single `elementsFromPoint` plus one `getComputedStyle`.
     */
    new MutationObserver(() => this.scheduleStickyBar()).observe(document.body, {
      childList: true,
      subtree: true,
    })

    this.push({ kind: 'text', text: voice.greeting })
  }

  /**
   * The one control the preview channel cannot deliver as a custom property: the stylesheet
   * selects on `[data-style]`, so the launcher's shape is a DOM attribute. Validated against the
   * three real values rather than written through, because this is reached from a `postMessage`
   * payload — an origin check makes the sender trusted, not the data well-formed.
   */
  /**
   * The config page's live channel for a single `--mx-*` value.
   *
   * It writes into a stylesheet INSIDE the shadow root rather than an inline style on the host,
   * and the reason is the cascade, not taste. `styles()` emits the token block as `!important` so
   * a merchant theme's `* { --mx-accent: … }` cannot repaint the widget — and for IMPORTANT
   * declarations the shadow context beats the outer one, which is the same rule that keeps the
   * host page out. An inline style on `<mx-agent>` is outer context, so it lost to our own reset:
   * measured as three red `config-page` specs, the preview frozen at the old accent.
   *
   * Two `:host` rules, same specificity, same context, both important — so the later one wins, and
   * `previewSheet` is appended after `sheet`. Values are validated by the caller [boot.ts]: only
   * real `--mx-*` names reach here.
   */
  setPreviewVar(name: string, value: string): void {
    this.previewVars.set(name, value)
    const body = [...this.previewVars].map(([key, val]) => `${key}: ${val} !important;`).join('\n')
    this.previewSheet.textContent = `:host {\n${body}\n}`
  }

  setPreviewLauncherStyle(style: string): void {
    if (style !== 'bubble' && style !== 'pill' && style !== 'text-anchor') return
    this.launcher.dataset.style = style
    // The label's visibility is a CLASS, not a rule keyed off `[data-style]`, so swapping the
    // attribute alone leaves a bubble — which is `padding: 0; aspect-ratio: 1` — trying to hold a
    // full label, and it renders as clipped wrapped text inside a circle. Found by switching the
    // launcher shape in the config page's live preview and looking at it.
    this.launcherLabel.className = style === 'bubble' ? 'sr-only' : 'launcher-label'
  }

  connectedCallback(): void {
    this.clearStickyBar()
    // Announcement bars, cookie banners and add-to-cart bars often arrive after us, so measure
    // again once the page has settled. A ceiling worth naming: a bar injected minutes later still
    // wins. A ResizeObserver on <body> would catch that and is the upgrade if it ever matters.
    window.addEventListener('load', () => this.clearStickyBar(), { once: true })
  }

  /**
   * Storefronts stack a sticky add-to-cart bar on the bottom edge, and we are forbidden from
   * editing storefront source to make room [ENGINEERING §1.1] — so the widget measures whatever is
   * pinned there and sits above it. Reading the host page's layout, not guessing at it.
   */
  private clearStickyBar(): void {
    if (!this.config.tokens.launcher.position.startsWith('bottom')) return
    const lift = `${this.stickyBarHeight()}px`
    this.launcher.style.marginBottom = lift
    // The panel is bottom-anchored too on a desktop viewport. At 375px it is inset to all four
    // edges, where an over-constrained box absorbs the margin and nothing moves — which is right,
    // because a full-height panel covers the bar rather than dodging it.
    this.panel.style.marginBottom = lift
  }

  /**
   * Probed at the LAUNCHER's own horizontal position, not at the middle of the viewport. The
   * launcher occupies one corner, so the only bars that can collide with it are the ones under
   * that corner — and a half-width bar in the middle of the screen used to lift it for nothing,
   * while a bar that stops short of the corner was measured as if it reached. Taking the tallest
   * bar found anywhere along the bottom edge would make the first case worse, not better.
   */
  /**
   * Coalesced to one measurement per frame. The frame is also what makes the click listener work
   * at all: both handlers are bubble-phase on `document`, `agent.js` is `async` and `velde.js` is
   * `defer`, so ours can register first and read the banner still laid out.
   */
  private scheduleStickyBar(): void {
    if (this.stickyBarPending) return
    this.stickyBarPending = true
    requestAnimationFrame(() => {
      this.stickyBarPending = false
      this.clearStickyBar()
    })
  }

  private stickyBarHeight(): number {
    const launcher = this.launcher.getBoundingClientRect()
    /*
     * Remembered, because `setOpen(true)` sets `launcher.hidden = true` and a hidden element
     * measures 0x0 — so every re-measure taken while the panel is OPEN used to silently fall back
     * to the viewport centre, which is the probe point this whole change replaced. The panel is
     * anchored to the same corner as the launcher, so the last known corner is the right answer
     * for both.
     */
    if (launcher.width > 0) this.probeX = Math.round(launcher.left + launcher.width / 2)
    const x = this.probeX ?? Math.round(window.innerWidth / 2)
    /*
     * A BAR, not a column. Every hit below already contains the bottom edge — that is the point we
     * probe — so "anchored at the bottom" needs no test of its own; what has to be excluded is the
     * tall sticky thing that merely reaches down to it. VELDE's PDP wraps its info column in
     * `position: sticky` and it measures 793px, so the widget lifted the launcher 793px and put it
     * ABOVE the top of the window at 1280x800 and 1366x768 — two ordinary laptop resolutions on
     * which the agent was simply unreachable.
     *
     * The tallest real bar measured across both storefronts is VELDE's cookie banner at 157px on a
     * 812px viewport (19%); the columns that broke it are 99%. A quarter of the viewport sits
     * between the two, and it is the clamp as much as the test: whatever a future storefront pins
     * down there, the lift returned here cannot exceed 25% of the window, so no page structure can
     * push the launcher off-screen. Overlapping a bar slightly is recoverable; being off-screen is
     * not.
     */
    const cap = window.innerHeight / 4
    for (const node of document.elementsFromPoint(x, window.innerHeight - 1)) {
      if (node === this || !(node instanceof HTMLElement)) continue
      const style = window.getComputedStyle(node)
      if (style.position !== 'fixed' && style.position !== 'sticky') continue
      const height = node.getBoundingClientRect().height
      // `opacity`, not `display`/`visibility`: neither of those is hit-tested, so they cannot reach
      // this loop — a banner mid-fade can, and is still laid out at its full height while invisible.
      if (height > cap || style.opacity === '0') continue
      return height
    }
    return 0
  }

  /** The one way anything gets into the conversation. T4 drives this; T3 only draws it. */
  push(block: Block): void {
    const node = renderBlock(block, this.config.strings)
    if (block.kind === 'chips-update') {
      this.chips = block.chips
      this.chipRow.replaceWith(node)
      this.chipRow = node
      return
    }
    this.appendMessage(node)
  }

  /**
   * The waiting state for a turn that has to cross the network [TASKS T13, filling the hole T9
   * recorded at TASKS.md:494]. Idempotent in both directions, because the caller's `finally` runs
   * on the fallback path too and a turn that failed fast may clear a pending state it never set.
   *
   * Deliberately NOT a disabled composer: a shopper who types a second thought while the first is
   * in flight keeps it, and `converse.ts` serialises the turns. Taking the input away to express
   * "busy" would lose the sentence they were halfway through.
   */
  setPending(on: boolean): void {
    if (on === (this.pending !== null)) return
    // `aria-busy` is the part a screen reader gets: the dots are aria-hidden (announcing the wait
    // AND the answer is noise), so without this a non-sighted shopper has no signal at all that a
    // turn is in flight — just silence until the answer lands in the live region.
    this.list.setAttribute('aria-busy', String(on))
    if (!on) {
      this.pending?.remove()
      this.pending = null
      return
    }
    const node = el('div', 'msg pending')
    node.dataset.from = 'agent'
    node.setAttribute('aria-hidden', 'true')
    node.append(el('i', ''), el('i', ''), el('i', ''))
    // Appended directly, not through `appendMessage` — that keeps the indicator last by inserting
    // before it, which would mean inserting this node before itself.
    this.pending = node
    this.list.append(node)
    this.list.scrollTop = this.list.scrollHeight
  }

  /**
   * The dots always stay LAST. A chip drop or restore is answered synchronously while a message
   * turn is still in flight [converse.ts serialises messages, never chip actions], so without this
   * the drop's cards render underneath the indicator for the message the shopper sent first — and
   * an earlier version cleared the dots on any `push`, which took the indicator away mid-turn and
   * left the shopper watching nothing for the rest of the round trip.
   */
  private appendMessage(node: HTMLElement): void {
    if (this.pending !== null) this.list.insertBefore(node, this.pending)
    else this.list.append(node)
    this.list.scrollTop = this.list.scrollHeight
  }

  private setOpen(open: boolean): void {
    this.panel.hidden = !open
    this.launcher.hidden = open
    if (open) {
      this.syncViewport()
      this.input.focus()
      return
    }
    this.launcher.focus()
  }

  private send(): void {
    const text = this.input.value.trim()
    if (text === '') return
    this.input.value = ''
    this.say(text)
  }

  /** One path for everything the shopper says, typed into the composer or tapped as a reply. */
  private say(text: string): void {
    this.appendMessage(renderText(text, 'shopper'))
    // The seam T4 plugs into. T3 renders the shopper's line and stops there — no conversation
    // logic lives in the shell.
    this.dispatchEvent(
      new CustomEvent('mx-send', { detail: { text }, bubbles: true, composed: true }),
    )
  }

  private onPanelClick(event: Event): void {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (this.onBlockAction(target)) return
    const chip = target.closest('.chip')
    if (!(chip instanceof HTMLElement)) return
    const id = chip.dataset.chipId
    const state = chip.dataset.state
    if (id === undefined || (state !== 'dropped' && state !== 'active')) return
    const next: Chip['state'] = state === 'dropped' ? 'active' : 'dropped'
    // The row is replaced wholesale, so the element holding focus is about to disappear. Only a
    // keyboard user was focused on it; a mouse user must not get the keyboard opened.
    const hadFocus = this.shadow.activeElement === chip
    this.setChip(id, next)
    // After the dispatch, because whatever answered it has redrawn the row underneath us.
    if (hadFocus) this.focusChip(id)
  }

  /**
   * Controls that live inside a message block rather than in the chip row. Returns true when it
   * handled the click, so the chip-row path never sees it.
   *
   * The no-match card's action is a ONE-WAY drop, not a toggle. A message block stays in the
   * scrollback forever, so a toggle there would keep a stale state and re-fire on a second tap;
   * the chip row above is where the decision is reversed, which is also what the obstacle sentence
   * tells the shopper to do. Keeping chips to exactly one surface is ENGINEERING §2.10.
   */
  private onBlockAction(target: HTMLElement): boolean {
    const reply = target.closest('.quick-option')
    if (reply instanceof HTMLElement && reply.dataset.replyText !== undefined) {
      this.say(reply.dataset.replyText)
      return true
    }
    const drop = target.closest('.nomatch-drop')
    if (!(drop instanceof HTMLButtonElement) || drop.disabled) return false
    const id = drop.dataset.dropChip
    if (id === undefined) return false
    drop.disabled = true
    // Gate on the CHIP's current state, not on this button's own disabled flag. The chip row can
    // drop the same constraint first, which leaves this card sitting in the scrollback still
    // enabled — tapping it then re-dropped an already-dropped chip and the brain answered with a
    // duplicate set of recommendations. Found by a reviewer doing it in the other order.
    if (this.chips.find((chip) => chip.id === id)?.state === 'dropped') return true
    this.setChip(id, 'dropped')
    return true
  }

  /**
   * Applies a chip state locally and tells the brain. Applied here as well as in the brain because
   * dropping the LAST active chip leaves the brain with nothing to recommend and no chip row to
   * send back — and the tap must still be visible.
   */
  private setChip(id: string, next: Chip['state']): void {
    this.push({
      kind: 'chips-update',
      chips: this.chips.map((entry): Chip => (entry.id === id ? { ...entry, state: next } : entry)),
    })
    this.dispatchEvent(
      new CustomEvent(next === 'active' ? 'mx-chip-restore' : 'mx-chip-drop', {
        detail: { id },
        bubbles: true,
        composed: true,
      }),
    )
  }

  /** Keeps a keyboard user on the chip they just toggled instead of dumping them in the composer. */
  private focusChip(id: string): void {
    const chip = this.chipRow.querySelector(`[data-chip-id="${id}"]`)
    if (chip instanceof HTMLElement) chip.focus()
    else this.input.focus()
  }

  private onKeydown(event: KeyboardEvent): void {
    if (this.panel.hidden) return
    if (event.key === 'Escape') {
      this.setOpen(false)
      return
    }
    if (event.key !== 'Tab') return
    // The panel is the whole widget while it is open, so its own controls are the entire tab ring.
    // `a[href]` is not optional here: T5's product cards and CTA blocks ship real anchors, and a
    // ring computed from buttons and inputs alone would let Tab walk out of the panel and into the
    // storefront underneath from whichever anchor happened to be last. A control that has already
    // done its one job (the no-match drop action) is disabled and out of the ring.
    const stops = Array.from(this.panel.querySelectorAll('button, input, a[href]')).filter(
      (node) => !(node instanceof HTMLButtonElement && node.disabled),
    )
    const first = stops.at(0)
    const last = stops.at(-1)
    if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement)) return
    const active = this.shadow.activeElement
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  /**
   * Coalesced to one write per frame: iOS fires resize and scroll all through the keyboard's
   * slide-up animation, and every one of them asks the same question.
   */
  private scheduleViewport(): void {
    if (this.viewportPending) return
    this.viewportPending = true
    requestAnimationFrame(() => {
      this.viewportPending = false
      this.syncViewport()
    })
  }

  /**
   * What a shopper on a phone sees when the keyboard comes up, and the reason this method is not
   * one line.
   *
   * At 375px the panel fills the screen, and the panel is `position: fixed` — which on iOS means
   * fixed to the LAYOUT viewport, the tall one, the one the keyboard does not shrink. The
   * keyboard only moves the VISUAL viewport: it gets shorter (`height`) and, because Safari
   * scrolls the focused composer up out from behind the keys, it also slides down the layout
   * viewport (`offsetTop`).
   *
   * Writing the height alone — which is all this did — leaves the panel pinned to the top of the
   * layout viewport while the visible region has moved down past it, and that is what the bug
   * report from a real iPhone shows: tap the composer on KRACHT and the dialog is simply gone,
   * leaving the storefront and the keyboard. The offset is read rather than assumed, so the case
   * where the browser scrolls the document instead and reports 0 stays a no-op.
   *
   * So: height from the visual viewport, and translated by its offset, which lands the panel on
   * the visible region however the browser split the difference between shrinking and scrolling.
   * A transform rather than a `top`, because a transform does not re-run layout on a box that
   * holds the whole conversation, and this runs on every frame of the keyboard animation.
   *
   * `offsetLeft` costs nothing to carry and covers pinch-zoom, where the visual viewport moves
   * horizontally too. Desktop clears both and lets the stylesheet win.
   */
  private syncViewport(): void {
    const viewport = window.visualViewport
    if (viewport === null || viewport === undefined || !window.matchMedia(MOBILE_QUERY).matches) {
      this.panel.style.height = ''
      this.panel.style.transform = ''
      return
    }
    // Read before the write, because the write is what moves it. A shopper who has scrolled back
    // up through the conversation keeps their place; one who was at the newest message — which is
    // everyone who just tapped the composer — keeps that instead of watching it slide out of a
    // list that lost half its height.
    const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 4
    this.panel.style.height = `${viewport.height}px`
    this.panel.style.transform = `translate(${viewport.offsetLeft}px, ${viewport.offsetTop}px)`
    if (atBottom) this.list.scrollTop = this.list.scrollHeight
  }
}
