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
  private readonly panel: HTMLDivElement
  private readonly list: HTMLDivElement
  private readonly input: HTMLInputElement
  private chipRow: HTMLElement
  private chips: Chip[] = []

  constructor(config: ConfigResponse) {
    super()
    this.config = config
    const { voice, strings, tokens } = config

    const sheet = document.createElement('style')
    sheet.textContent = styles(tokens)

    this.launcher = el('button', 'launcher')
    this.launcher.type = 'button'
    this.launcher.dataset.style = tokens.launcher.style
    const launcherLabel = el(
      'span',
      tokens.launcher.style === 'bubble' ? 'sr-only' : 'launcher-label',
    )
    launcherLabel.textContent = str(strings, 'launcher.label')
    this.launcher.append(avatarNode(voice), launcherLabel)
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
    this.shadow.append(sheet, this.launcher, this.panel)
    this.shadow.addEventListener('keydown', (event) => {
      if (event instanceof KeyboardEvent) this.onKeydown(event)
    })
    window.visualViewport?.addEventListener('resize', () => this.syncViewport())
    window.addEventListener('resize', () => this.clearStickyBar())

    this.push({ kind: 'text', text: voice.greeting })
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

  private stickyBarHeight(): number {
    const x = Math.round(window.innerWidth / 2)
    for (const node of document.elementsFromPoint(x, window.innerHeight - 1)) {
      if (node === this || !(node instanceof HTMLElement)) continue
      const position = window.getComputedStyle(node).position
      if (position !== 'fixed' && position !== 'sticky') continue
      return node.getBoundingClientRect().height
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

  private appendMessage(node: HTMLElement): void {
    this.list.append(node)
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
   * At 375px the panel is full height, and on iOS the software keyboard does not shrink `100dvh`
   * — only `visualViewport` sees it. Writing the measured height keeps the composer above the
   * keyboard instead of under it. Desktop clears the inline height and lets the stylesheet win.
   */
  private syncViewport(): void {
    const viewport = window.visualViewport
    if (viewport === null || viewport === undefined || !window.matchMedia(MOBILE_QUERY).matches) {
      this.panel.style.height = ''
      return
    }
    this.panel.style.height = `${viewport.height}px`
  }
}
