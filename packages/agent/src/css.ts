import type { Corner, DerivedTokens } from '@maximal/tokens'

/**
 * Every widget style, authored only against the `--mx-*` custom properties in `CssVarName`.
 * No component invents a colour, radius, spacing step or font size [ENGINEERING §1.2]. The three
 * literal lengths that survive are accessibility floors or device hairlines, each commented where
 * it is used, and they are listed in the hand-off.
 */

/**
 * A CSS z-index is a 32-bit signed integer and browsers clamp to this value, so 2147483647 is not
 * a lucky number — it is the ceiling. The cookie banners we have to clear (OneTrust, Cookiebot)
 * already sit exactly here, so nobody can outrank anybody by counting higher; the tie is broken by
 * paint order instead, which is why the loader appends the widget as the LAST child of <body>.
 * Equal z-index, later in the document, paints on top. A banner that injects itself after us would
 * take the corner back — that is the line to revisit if it ever happens, not a bigger number.
 */
export const LAUNCHER_Z_INDEX = 2147483647

/** Shared by the stylesheet and the keyboard-inset code so the two cannot drift apart. */
export const MOBILE_QUERY = '(max-width: 480px)'

/**
 * Which two edges the launcher and the panel anchor to. A pure string so it is testable without a
 * browser; the panel takes the same corner because the launcher hides while the panel is open.
 */
export function cornerCss(corner: Corner): string {
  const gap = 'var(--mx-space-4)'
  switch (corner) {
    case 'bottom-right':
      return `bottom: ${gap}; right: ${gap};`
    case 'bottom-left':
      return `bottom: ${gap}; left: ${gap};`
    case 'top-right':
      return `top: ${gap}; right: ${gap};`
    case 'top-left':
      return `top: ${gap}; left: ${gap};`
  }
}

export function styles(tokens: DerivedTokens): string {
  const vars = Object.entries(tokens.css)
    .map(([name, value]) => `${name}: ${value};`)
    .join('\n    ')

  return `
  :host {
    ${vars}
    /* Inherited properties still cross a shadow boundary, so reset everything and re-state the
       few every child inherits from us. [PRINCIPLES §5] */
    all: initial;
    font-family: var(--mx-font-body);
    font-size: var(--mx-text-md);
    line-height: var(--mx-line-height);
    color: var(--mx-text-primary);
    display: block;
    position: fixed;
    inset: 0;
    z-index: ${LAUNCHER_Z_INDEX};
    /* The host spans the viewport so the panel can anchor to any corner; only real controls take
       clicks, everything else falls through to the storefront underneath. */
    pointer-events: none;
  }

  *, *::before, *::after { box-sizing: border-box; }
  [hidden] { display: none !important; }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .launcher, .panel {
    position: absolute;
    pointer-events: auto;
    ${cornerCss(tokens.launcher.position)}
  }

  .launcher {
    display: inline-flex;
    align-items: center;
    gap: var(--mx-space-2);
    /* 44px is the WCAG 2.5.5 target floor, not a taste value — a compact brand must not shrink a
       tap target below it. */
    min-height: 44px;
    padding: var(--mx-space-2) var(--mx-space-3);
    border: 0;
    background: var(--mx-accent);
    color: var(--mx-text-on-accent);
    font-family: var(--mx-font-body);
    font-size: var(--mx-text-sm);
    font-weight: ${tokens.fonts.body.weight};
    line-height: var(--mx-line-height);
    text-transform: var(--mx-label-transform);
    letter-spacing: var(--mx-label-tracking);
    border-radius: var(--mx-radius-md);
    box-shadow: var(--mx-shadow-2);
    cursor: pointer;
  }

  /* 'pill' and 'bubble' are shapes by name: fully round is definitional to them, not a radius
     choice we are making on the merchant's behalf. */
  .launcher[data-style='pill'], .launcher[data-style='bubble'] { border-radius: 999px; }

  .launcher[data-style='bubble'] {
    justify-content: center;
    padding: 0;
    width: max(44px, calc(var(--mx-space-3) * 2 + var(--mx-text-lg)));
    aspect-ratio: 1;
  }

  .launcher[data-style='text-anchor'] {
    background: var(--mx-surface);
    color: var(--mx-text-primary);
    box-shadow: var(--mx-shadow-1);
    text-decoration: underline;
    text-underline-offset: var(--mx-space-1);
  }
  .launcher[data-style='text-anchor'] .avatar,
  .launcher[data-style='text-anchor'] .mark { display: none; }

  .avatar, .mark {
    flex: 0 0 auto;
    width: var(--mx-space-4);
    height: var(--mx-space-4);
    border-radius: 999px;
    object-fit: cover;
    background: var(--mx-accent);
    color: var(--mx-text-on-accent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--mx-font-display);
    font-size: var(--mx-text-xs);
    font-weight: ${tokens.fonts.display.weight};
  }
  .launcher[data-style='bubble'] .avatar,
  .launcher[data-style='bubble'] .mark {
    width: var(--mx-space-5);
    height: var(--mx-space-5);
    font-size: var(--mx-text-sm);
  }

  .panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* Sized in em, which resolves from the host's --mx-text-md: the panel grows with the brand's
       type scale instead of a number we picked. */
    width: min(92vw, 26em);
    height: min(80vh, 42em);
    background: var(--mx-surface);
    border-radius: var(--mx-radius-lg);
    box-shadow: var(--mx-shadow-2);
  }

  .header {
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
    padding: var(--mx-space-3);
    background: var(--mx-surface-raised);
    /* 1px is a device hairline, not a spacing token; which colour it takes is the token. */
    border-bottom: 1px solid var(--mx-border);
  }

  .name {
    font-family: var(--mx-font-display);
    font-size: var(--mx-text-lg);
    font-weight: ${tokens.fonts.display.weight};
    text-transform: var(--mx-label-transform);
    letter-spacing: var(--mx-label-tracking);
    color: var(--mx-text-primary);
  }

  .close {
    margin-inline-start: auto;
    min-width: 44px;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--mx-text-muted);
    font: inherit;
    font-size: var(--mx-text-lg);
    line-height: 1;
    border-radius: var(--mx-radius-sm);
    cursor: pointer;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mx-space-2);
    padding: var(--mx-space-2) var(--mx-space-3);
    background: var(--mx-surface-raised);
    border-bottom: 1px solid var(--mx-border);
  }
  .chips:empty { display: none; }

  .chips-legend {
    color: var(--mx-text-muted);
    font-size: var(--mx-text-xs);
    text-transform: var(--mx-label-transform);
    letter-spacing: var(--mx-label-tracking);
  }

  .chip {
    display: inline-block;
    max-width: 100%;
    overflow-wrap: anywhere;
    padding: var(--mx-space-1) var(--mx-space-2);
    border: 1px solid var(--mx-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-surface);
    color: var(--mx-text-primary);
    font: inherit;
    font-size: var(--mx-text-xs);
    line-height: var(--mx-line-height);
    text-align: start;
    cursor: pointer;
  }
  /* The row is the brief AND the receipt: a dropped chip stays visible and restorable rather than
     being evicted. [ENGINEERING §2.10] */
  .chip[data-state='dropped'] {
    text-decoration: line-through;
    color: var(--mx-text-muted);
    background: var(--mx-surface-sunken);
  }

  .messages {
    flex: 1 1 auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-3);
    padding: var(--mx-space-3);
    background: var(--mx-surface);
  }
  /* A flex item shrinks before its container scrolls. Once the conversation is taller than the
     panel, every block would be squeezed and then clipped by its own overflow — measured at
     391px of card in 668px of content before this rule existed. The list scrolls; the blocks in
     it keep their height. */
  .messages > * { flex-shrink: 0; }

  .msg {
    max-width: 85%;
    margin: 0;
    padding: var(--mx-space-2) var(--mx-space-3);
    border-radius: var(--mx-radius-md);
    font-size: var(--mx-text-sm);
    /* A product handle or a pasted URL is one 40-character word with nowhere to break. Without
       this it widens the panel instead of wrapping. Applies to every block, which is why it sits
       on the shared bubble and chip rules rather than only on the blocks T5 added. */
    overflow-wrap: anywhere;
  }
  .msg[data-from='agent'] {
    align-self: flex-start;
    background: var(--mx-surface-sunken);
    color: var(--mx-text-primary);
    box-shadow: var(--mx-shadow-1);
  }
  .msg[data-from='shopper'] {
    align-self: flex-end;
    background: var(--mx-accent);
    color: var(--mx-text-on-accent);
  }

  /* ------------------------------------------------------------------------------------------
     The five blocks T5 owns. Every colour, radius, spacing step and font size below resolves from
     a --mx-* custom property; there is not one length literal in this section. The card image is
     sized by 'aspect-ratio' and the compare columns by flex, precisely so neither needs a number
     no token can supply. [ENGINEERING §1.2]
     ------------------------------------------------------------------------------------------ */

  /* The one place 'labelCase' becomes visible outside the shell chrome — every block that has a
     label draws it here, so 'upper-tracked' changes all of them at once. */
  .label {
    display: block;
    color: var(--mx-text-muted);
    font-family: var(--mx-font-display);
    font-size: var(--mx-text-xs);
    font-weight: ${tokens.fonts.display.weight};
    text-transform: var(--mx-label-transform);
    letter-spacing: var(--mx-label-tracking);
  }

  .quick { display: flex; flex-direction: column; gap: var(--mx-space-2); align-self: stretch; }
  .quick-options { display: flex; flex-wrap: wrap; gap: var(--mx-space-2); }

  .quick-option {
    min-height: 44px;
    padding: var(--mx-space-2) var(--mx-space-3);
    border: 1px solid var(--mx-border);
    border-radius: var(--mx-radius-md);
    background: var(--mx-surface-raised);
    color: var(--mx-text-primary);
    font-family: var(--mx-font-body);
    font-size: var(--mx-text-sm);
    line-height: var(--mx-line-height);
    text-align: start;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .card, .compare, .nomatch, .cta {
    align-self: stretch;
    min-width: 0;
    background: var(--mx-surface-raised);
    border-radius: var(--mx-radius-md);
    box-shadow: var(--mx-shadow-1);
    overflow: hidden;
  }

  .card { display: flex; flex-direction: column; }

  .media {
    display: flex;
    align-items: center;
    justify-content: center;
    /* Square by ratio rather than by height: the card is as wide as the panel the brand's own
       type scale produced, so the photograph follows it instead of pinning a number. */
    aspect-ratio: 1;
    background: var(--mx-surface-sunken);
  }
  .media-image { width: 100%; height: 100%; object-fit: cover; display: block; }

  .media-empty {
    color: var(--mx-text-muted);
    font-size: var(--mx-text-xs);
    text-transform: var(--mx-label-transform);
    letter-spacing: var(--mx-label-tracking);
    text-align: center;
    padding: var(--mx-space-2);
  }

  /* Out of stock is stated in words in the price line; the photograph fades so the state is
     legible before the words are read, never instead of them. */
  .card[data-stock='out'] .media { opacity: 0.55; }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-2);
    padding: var(--mx-space-3);
    min-width: 0;
  }

  .card-title {
    margin: 0;
    font-family: var(--mx-font-display);
    font-size: var(--mx-text-md);
    font-weight: ${tokens.fonts.display.weight};
    line-height: var(--mx-line-height);
    color: var(--mx-text-primary);
    overflow-wrap: anywhere;
  }

  .price-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--mx-space-2);
  }
  .price {
    font-family: var(--mx-font-display);
    font-size: var(--mx-text-lg);
    font-weight: ${tokens.fonts.display.weight};
    color: var(--mx-text-primary);
  }
  .stock {
    color: var(--mx-text-muted);
    font-size: var(--mx-text-xs);
    text-transform: var(--mx-label-transform);
    letter-spacing: var(--mx-label-tracking);
  }

  .specs { display: flex; flex-direction: column; gap: var(--mx-space-1); }

  /* Two columns by content, not by a fixed width: a spec label is one or two words in both
     catalogs, and letting the grid measure it is what keeps this schema-agnostic. */
  .spec-rows {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--mx-space-1) var(--mx-space-2);
    margin: 0;
    font-size: var(--mx-text-xs);
    line-height: var(--mx-line-height);
  }
  .spec-label { color: var(--mx-text-muted); overflow-wrap: anywhere; }
  .spec-value { margin: 0; color: var(--mx-text-primary); overflow-wrap: anywhere; }

  .card-link, .cta-link, .nomatch-drop {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: var(--mx-space-2) var(--mx-space-3);
    border: 0;
    border-radius: var(--mx-radius-sm);
    background: var(--mx-accent);
    color: var(--mx-text-on-accent);
    font-family: var(--mx-font-body);
    font-size: var(--mx-text-sm);
    font-weight: ${tokens.fonts.body.weight};
    line-height: var(--mx-line-height);
    text-transform: var(--mx-label-transform);
    letter-spacing: var(--mx-label-tracking);
    text-align: center;
    text-decoration: none;
    overflow-wrap: anywhere;
    cursor: pointer;
  }
  /* An out-of-stock product still links to its page — the shopper may want to be told when it is
     back — but it must not read as the primary action of the message. */
  .card[data-stock='out'] .card-link {
    background: var(--mx-surface-sunken);
    color: var(--mx-text-primary);
    box-shadow: var(--mx-shadow-1);
  }

  .compare { padding: var(--mx-space-3); display: flex; flex-direction: column; gap: var(--mx-space-2); }
  /* The table scrolls inside the card instead of widening the panel: three columns cannot fit at
     375px and clipping them would be worse than a swipe. */
  .compare-scroll { overflow-x: auto; overscroll-behavior-x: contain; }
  .compare-table { border-collapse: collapse; font-size: var(--mx-text-xs); }
  .compare-product, .compare-key, .compare-value, .compare-corner {
    padding: var(--mx-space-1) var(--mx-space-2);
    border-bottom: 1px solid var(--mx-border);
    text-align: start;
    vertical-align: top;
    color: var(--mx-text-primary);
    font-weight: inherit;
  }
  .compare-product {
    font-family: var(--mx-font-display);
    font-weight: ${tokens.fonts.display.weight};
  }
  .compare-value { color: var(--mx-text-muted); }

  .nomatch { padding: var(--mx-space-3); display: flex; flex-direction: column; gap: var(--mx-space-2); }
  .nomatch-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .nomatch-item {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--mx-space-2);
    padding: var(--mx-space-2) 0;
    border-bottom: 1px solid var(--mx-border);
    font-size: var(--mx-text-sm);
  }
  .nomatch-item:last-child { border-bottom: 0; }
  .nomatch-title { min-width: 0; overflow-wrap: anywhere; }
  .nomatch-price {
    font-family: var(--mx-font-display);
    font-weight: ${tokens.fonts.display.weight};
    white-space: nowrap;
  }
  /* Once tapped the control has done its one job; the constraint chip in the row above is where
     the decision is reversed. */
  .nomatch-drop[disabled] {
    background: var(--mx-surface-sunken);
    color: var(--mx-text-muted);
    cursor: default;
  }

  .cta { padding: var(--mx-space-3); display: flex; }
  .cta-link { flex: 1 1 auto; }

  .composer {
    display: flex;
    gap: var(--mx-space-2);
    padding: var(--mx-space-3);
    background: var(--mx-surface-raised);
    border-top: 1px solid var(--mx-border);
    /* Keeps the composer off the home indicator on a phone. */
    padding-bottom: max(var(--mx-space-3), env(safe-area-inset-bottom));
  }

  .input {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 44px;
    padding: var(--mx-space-2);
    border: 1px solid var(--mx-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-surface);
    color: var(--mx-text-primary);
    font-family: var(--mx-font-body);
    font-size: var(--mx-text-md);
    line-height: var(--mx-line-height);
  }
  .input::placeholder { color: var(--mx-text-muted); }

  .send {
    flex: 0 0 auto;
    min-height: 44px;
    padding: var(--mx-space-2) var(--mx-space-3);
    border: 0;
    border-radius: var(--mx-radius-sm);
    background: var(--mx-accent);
    color: var(--mx-text-on-accent);
    font-family: var(--mx-font-body);
    font-size: var(--mx-text-sm);
    font-weight: ${tokens.fonts.body.weight};
    text-transform: var(--mx-label-transform);
    letter-spacing: var(--mx-label-tracking);
    cursor: pointer;
  }

  /* Derived against BOTH the accent and the surface, so it stays visible on either. 2px is the
     WCAG 2.4.13 focus-indicator floor. */
  :is(.launcher, .close, .chip, .input, .send, .quick-option, .card-link, .cta-link, .nomatch-drop):focus-visible {
    outline: 2px solid var(--mx-focus-ring);
    outline-offset: 2px;
  }

  @media ${MOBILE_QUERY} {
    .panel {
      inset: 0;
      width: 100%;
      /* dvh so browser chrome does not cut the composer off; the keyboard itself does not change
         dvh on iOS, so the loader also writes a visualViewport height onto this element. */
      height: 100dvh;
      max-height: none;
      border-radius: 0;
    }
    .msg { max-width: 92%; }
  }
`
}
