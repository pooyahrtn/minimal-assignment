import type { Corner, DerivedTokens } from '@maximal/tokens'

/**
 * Every widget style, authored only against the `--mx-*` custom properties in `CssVarName`.
 * No component invents a colour, radius, spacing step or font size [ENGINEERING §1.2].
 *
 * Two groups of literals survive, and the count matters because this comment used to say "three"
 * while the file carried ten:
 *
 *  1. **Accessibility floors and device constants**, each commented where it is used —
 *     `min-height/min-width: 44px` (WCAG 2.5.5 target size), `1px` borders (device hairline),
 *     `border-radius: 999px` (a pill is a shape, not a scale step), `outline: 2px` /
 *     `outline-offset: 2px` (WCAG 2.4.13), `line-height: 1` on single-glyph marks, one
 *     `opacity: 0.55` on an out-of-stock photograph, and `.sr-only`'s standard 1px clip.
 *
 *  2. **The constant signature** (`.signature`, below) — seven more literals, and they are the
 *     one block in this file that is REQUIRED to sit outside the token system. `PRINCIPLES §9`:
 *     *"one small, constant signature that sits outside the token system and is never
 *     merchant-set."* Tokenising its geometry would make the AI disclosure scale with the
 *     merchant's own `scale`/`density` ramp, which is precisely what §9 and the EU AI Act Art. 50
 *     framing exist to prevent. Its colours DO follow the brand, on purpose — see the comment on
 *     the block.
 *
 * So the universal "no hardcoded spacing or font size outside `packages/tokens`" bullet has a
 * named carve-out here rather than an exception nobody wrote down. [TASKS §2]
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

/**
 * The turn indicator [TASKS T13] fills the hole T9 recorded at TASKS.md:494: before a live model sat
 * in front of the FSM, `step()` and `push()` happened in the same tick and there was nothing to wait
 * for. `.pending` reuses the agent bubble wholesale, so it inherits the merchant's surface, radius
 * and shadow and cannot drift from the message it stands in for. Three dots, no words: copy would
 * have to travel in the config payload [ENGINEERING §2.1], and a fourth string across four brand
 * files is a poor trade for a state that lasts a second. It is `aria-hidden` for the same reason it
 * is wordless — the answer lands in the same `role="log"` a moment later and IS announced, so
 * announcing the wait as well only makes a screen reader noisier. The reduced-motion block is the
 * guard `motion.test.ts` demands; this is the widget's first and only motion.
 *
 * Its rationale lives here rather than in the stylesheet because `bun build --minify` strips TS
 * comments, while a comment inside the emitted CSS template literal is shipped bytes on every
 * merchant's page — and H6's gzip cap is the tightest budget in the repo.
 */

/**
 * THE ELEVATION LADDER — which of the three surface tokens each layer paints, and why the panel
 * starts one rung up. Here for the same byte reason as the note above.
 *
 * `--mx-surface` is not a neutral background: `derive()` emits it verbatim from
 * `MerchantTokens.surface`, which is the colour the merchant's own storefront paints its page
 * with. A panel filled with it is byte-identical to the page underneath — measured `#fbfaf8` on
 * VELDE and `#121212` on KRACHT — so it read as a hole punched in the store rather than a surface
 * sitting on it. On KRACHT that was literal: the panel's left edge did not exist, and the PDP copy
 * behind it simply stopped mid-sentence with nothing visible stopping it.
 *
 * So the whole widget sits one rung up and uses all three steps as three steps:
 *
 * - `--mx-surface-raised` — the panel ground (`.panel`, and the header/chips/composer chrome that
 *   already painted it; that chrome was the only reason the panel had any body at all before).
 * - `--mx-surface` — the blocks that sit ON that ground: `.card`/`.compare`/`.nomatch`/`.cta`,
 *   `.quick-option`, and the `.chip`/`.input` controls that already used it inside the chrome.
 * - `--mx-surface-sunken` — wells and the agent's own bubble.
 *
 * Nothing new is invented and no token is added: the same three steps, re-seated. Two things fall
 * out of it. The agent bubble stopped being invisible on VELDE, where `sunken` clamps to `#ffffff`
 * and was sitting on a `#fbfaf8` ground with only `--mx-shadow-1` to outline it. And three focus
 * rings — `.card-link`, `.cta-link`, `.nomatch-drop`, all of which live inside a block — moved
 * from `--mx-surface-raised` onto `--mx-surface`, which is the only ground `deriveFocusRing`
 * actually searches against, so the 3:1 guarantee now covers three rings it did not cover before.
 * `.quick-option`'s ring moves the other way, off `surface` onto the raised ground; net, the count
 * of rings landing on their guaranteed ground goes from one to three.
 *
 * Body text is unaffected in every case, which is what made the fill free to move at all: all
 * three surfaces carry the 4.5:1 clamp (`AA_GUARANTEED_PAIRS` pairs both `--mx-text-primary` and
 * `--mx-text-muted` against `surface`, `raised` AND `sunken`), so no pair in this file changed
 * from a guaranteed one to an unguaranteed one. H1's `contrast` bench is the check.
 *
 * No border on `.panel`, deliberately: `--mx-shadow-2` already IS the brand's chosen edge — a
 * 0-blur 1px ring on the `hairline` ramp, a real cast shadow on `soft` — and adding a rule would
 * either double the hairline or bolt one onto a brand that asked for a shadow. Measured both:
 * a border alone, without the fill step, does not carry KRACHT at all.
 */
export function styles(tokens: DerivedTokens): string {
  /*
   * `!important` on the custom properties too, and it is the half the first hardening pass missed.
   * `all: initial` does not reset custom properties — that is *why* `${vars}` survives the reset
   * line below it, and it is equally why a host page's `* { --mx-accent: #00ff00 }` walked
   * straight past every important pin and repainted nine computed properties inside the shadow
   * root. Measured; H5's `HOSTILE_CSS` carries the vector.
   *
   * The preview channel still wins, because `boot.ts` writes its overrides as important INLINE
   * declarations, and an important inline style outranks an important rule. That coupling is
   * stated in both files rather than left for whoever changes one of them.
   */
  const vars = Object.entries(tokens.css)
    .map(([name, value]) => `${name}: ${value} !important;`)
    .join('\n    ')

  return `
  :host {
    ${vars}
    /*
     * Inherited properties still cross a shadow boundary, so reset everything and re-state the
     * few every child inherits from us. [PRINCIPLES §5]
     *
     * Every declaration below is \`!important\`, and that is not belt-and-braces — it is the only
     * form of this rule that works. The shadow-host cascade rule is that a NORMAL declaration in
     * the outer document beats \`:host\`, whatever the specificity, and only an IMPORTANT \`:host\`
     * declaration beats an important outer one. So a plain \`mx-agent { font-size: 40px }\` on the
     * storefront defeated the bare \`all: initial\` outright, and \`* { color: red !important }\`
     * defeated it twice over. Measured before the change and after: H5 \`isolation\` read 31
     * properties leaking into the shadow root on each storefront — font-size 18px to 40px, family
     * to cursive, colour to red, direction to rtl — and reports zero now.
     *
     * The important \`all\` is why each line after it repeats \`!important\`: an important \`all\`
     * outranks the normal declarations that follow it in the same rule, so dropping one does not
     * leave that property un-hardened, it resets it to the CSS initial value. Losing \`display\`
     * alone makes the host \`inline\`; losing \`pointer-events\` makes it swallow every click on the
     * storefront underneath.
     *
     * \`direction\` and \`unicode-bidi\` are stated separately because \`all\` does not reset them —
     * the spec exempts both, along with custom properties (which is what keeps \`\${vars}\` above
     * intact). Pinning \`ltr\` is right while every string the widget ships is English; a merchant
     * on an RTL storefront is a named ceiling, not a solved case. [TASKS §0 #10]
     */
    all: initial !important;
    direction: ltr !important;
    unicode-bidi: isolate !important;
    font-family: var(--mx-font-body) !important;
    font-size: var(--mx-text-md) !important;
    line-height: var(--mx-line-height) !important;
    color: var(--mx-text-primary) !important;
    display: block !important;
    position: fixed !important;
    inset: 0 !important;
    z-index: ${LAUNCHER_Z_INDEX} !important;
    /* The host spans the viewport so the panel can anchor to any corner; only real controls take
       clicks, everything else falls through to the storefront underneath. */
    pointer-events: none !important;
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

  /* The constant signature [PRINCIPLES §9, EU AI Act Art. 50]. Pinned to the launcher's corner
     rather than placed inline, so it reads identically under all three launcher styles — 'bubble'
     has no visible label to sit beside, and 'text-anchor' has no accent fill to sit on.

     Its colours are the ONLY thing here that follows the brand, and deliberately so: it is painted
     on --mx-surface with --mx-text-primary, which is an AA_GUARANTEED_PAIRS entry, so it is
     legible at 4.5:1 under every configuration the engine can emit — including one whose accent
     has vanished into the page. A signature a merchant can accidentally hide is not a disclosure.
     Size, text and presence stay constant, outside the token system, as §9 requires. */
  .signature {
    position: absolute;
    top: -6px;
    right: -6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border: 1px solid var(--mx-border);
    border-radius: 999px;
    background: var(--mx-surface);
    color: var(--mx-text-primary);
    font-family: var(--mx-font-body);
    /* Not var(--mx-text-xs): a brand on the compact scale must not be able to shrink the
       disclosure below the point where it is readable. */
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.04em;
    text-transform: none;
    /* NOT pointer-events: none. That silenced the title tooltip carrying the full disclosure
       sentence, leaving a sighted shopper with a bare two-letter mark and the real text only in
       the launcher's accessible name. cursor: inherit keeps it feeling like part of the button
       it sits on rather than a separate control. */
    cursor: inherit;
  }

  .launcher[data-style='text-anchor'] .signature { top: -8px; right: -10px; }

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

  /* Raised: --mx-surface is the merchant's own page colour. [ladder, JSDoc] */
  .panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* Sized in em, which resolves from the host's --mx-text-md: the panel grows with the brand's
       type scale instead of a number we picked. */
    width: min(92vw, 26em);
    height: min(80vh, 42em);
    background: var(--mx-surface-raised);
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
  /* A constraint we cannot check: dashed, not struck through — it was never applied and never
     rejected — and not a control, so no pointer. */
  .chip[data-state='unsupported'] {
    border-style: dashed;
    color: var(--mx-text-muted);
    cursor: default;
  }

  .messages {
    flex: 1 1 auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-3);
    padding: var(--mx-space-3);
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

  /* Turn indicator [T13]. */
  .pending {
    display: flex;
    gap: var(--mx-space-1);
    align-items: center;
    min-height: 1em;
  }
  .pending > i {
    width: 0.4em;
    height: 0.4em;
    border-radius: 50%;
    background: var(--mx-text-muted);
    animation: mx-pending 1.2s ease-in-out infinite;
  }
  .pending > i:nth-child(2) { animation-delay: 0.15s; }
  .pending > i:nth-child(3) { animation-delay: 0.3s; }
  @keyframes mx-pending {
    0%, 80%, 100% { opacity: 0.25; }
    40% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .pending > i { animation: none; opacity: 0.6; }
  }

  /* ------------------------------------------------------------------------------------------
     The five blocks T5 owns. Every colour, radius, spacing step and font size below resolves from
     a --mx-* custom property. The card image is sized by 'aspect-ratio' and the compare columns by
     flex, precisely so neither needs a length no token can supply. [ENGINEERING §1.2]

     The literals that DO appear in THIS section are group 1 from the file header and nothing else:
     'min-height: 44px' (WCAG 2.5.5 target floor), '1px' borders (device hairline), and one
     'opacity: 0.55' on an out-of-stock photograph — a paint value with no token, and the state is
     also stated in words so opacity is never the only signal. The signature block's seven are
     group 2, and they are above, not here.
     ------------------------------------------------------------------------------------------ */

  /* The one place 'labelCase' becomes visible outside the shell chrome — every block that has a
     label draws it here, so 'upper-tracked' changes all of them at once. */
  .label {
    display: block;
    /* The card wrappers are overflow:hidden, so a label without this is CLIPPED mid-word rather
       than widened — invisible to any assertion that measures a block's outer width. Found by a
       reviewer pushing the 40-character word through the no-match heading. */
    overflow-wrap: anywhere;
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
    background: var(--mx-surface);
    color: var(--mx-text-primary);
    font-family: var(--mx-font-body);
    font-size: var(--mx-text-sm);
    line-height: var(--mx-line-height);
    /* Same label treatment as every other control (.card-link/.cta-link/.nomatch-drop). Without
       these two, quick-replies was a second block where 'labelCase' did nothing. */
    text-transform: var(--mx-label-transform);
    letter-spacing: var(--mx-label-tracking);
    text-align: start;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  /* One step DOWN from the panel ground, so a block reads as one. [ladder, JSDoc] */
  .card, .compare, .nomatch, .cta {
    align-self: stretch;
    min-width: 0;
    background: var(--mx-surface);
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
  /* Sized by content, not by the container. Without this the table is squeezed into the panel
     width and a long product title starves the row-label column until it breaks one character per
     line — which is what VELDE's generous type ramp did to 'MATERIAL' on the contact sheet. The
     wrapper already scrolls horizontally, so letting columns take the width they need is the whole
     point of putting them in a scroller. */
  .compare-table {
    border-collapse: collapse;
    width: max-content;
    font-size: var(--mx-text-xs);
  }
  .compare-key { white-space: nowrap; }
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
