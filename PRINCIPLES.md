# PRINCIPLES.md — Maximal AI

> Working document for the build. This is the contract. If a decision is not in here, it has not been made yet — ask before inventing one.

**Names and domains, locked:**

| | | |
|---|---|---|
| **Maximal AI** | the platform — config page, embed script, config API | `maximal.releashed.io` |
| **VELDE** | merchant A — Amsterdam minimal apparel, English | `velde.releashed.io` |
| **KRACHT** | merchant B — Dutch-market sports nutrition, English copy | `kracht.releashed.io` |

**The two merchants are archetypes of Minimal's actual customers, not invented from nothing.**
Minimal AI (YC S25, Amsterdam) publishes its client list: XXL Nutrition, Cloudpillo, Mobiel NL,
Matt Sleeps, Girav, Boldking, Upfront, ETQ, Volero, Proforto, Hang Eleven, Boombrush, Plnktn —
almost entirely Dutch, and its integration list is the Dutch stack end to end (Sendcloud, PostNL,
MyParcel, Mollie, Picqer, Monta, Bol.com, Lightspeed, Returnless). VELDE is modelled on ETQ
Amsterdam, KRACHT on XXL Nutrition. Names, logos and copy are ours — we model the *category and
its conventions*, never the brand itself. Cloning a real client's identity would be both
impersonation and a worse demo than showing the agent adapt to a category it has never seen.

Three Vercel projects on one apex. The subdomains are genuinely separate origins, so the config fetch is a real cross-origin request with real CORS — the widget must never assume same-site anything.

---

## 1. What is actually being graded

In priority order:

1. **The same agent code looking native under two visibly different brands.** This is the top-line criterion. If it only looks right under one, it was styled, not built.
2. **How the screens feel to use.** Explicitly weighted above code structure.
3. **375px.** Not a responsive afterthought — the default development viewport.
4. **One moment where things do not go smoothly**, handled as product design rather than as an error state.
5. **DECISIONS.md** — one page, written honestly, including the weakest part.

Not graded: market research, backend sophistication, a real LLM, test coverage, auth.

---

## 2. Non-negotiables

- **Both brands exist from the first component.** Never build a component under one brand and theme it later. Every component is reviewed side by side under both before it is considered done.
- **The token list is a closed contract.** No component invents a colour, radius, spacing value, or font size. If a token is missing, that is a discussion, not a local `#hex`.
- **The storefronts are frozen after integration.** See §4.
- **Constrained, not infinite.** The merchant chooses few things; the system derives the rest and clamps them so no configuration can render broken or illegible. Infinite customisation is the failure mode, not the goal.
- **No live LLM at runtime.** The agent is deterministic. This build gets demoed live in a room.

---

## 3. Repo shape

```
maximal/
  apps/
    platform/        Next.js — config page, config API, snippet
    shop-velde/      Storefront A — plain HTML/CSS, multi-page, no build step
    shop-kracht/     Storefront B — Next.js + Tailwind
  packages/
    agent/           The embeddable widget. Builds to ONE IIFE file.
    tokens/          Token schema, derivation, contrast math
```

`packages/agent` must have **zero** imports from `apps/`. It is shipped software that happens to live in the same repo.

---

## 4. The two storefronts — build these first, integration-blind

Build both shops **before** the agent exists, as if the agent were never coming. This is the whole proof: a real store adopts us with one line and changes nothing else.

**The Google test — the rule for what belongs in a storefront.**

Anything is allowed if a real store would already have it *for its own reasons*, before ever hearing of Maximal. Sitemap and JSON-LD pass: they exist for Google. A cookie banner passes. A `<div id="maximal-root">` fails. This is how realism stays honest and how we answer "did you stack the deck".

**Hard rules:**

- No container div, no mount point, no `data-agent-*` attribute, no CSS hook, no window global, no reserved z-index, no shared stylesheet, no knowledge that Maximal exists.
- Pages: home, category listing, product detail, cart, about, shipping & returns. Real copy with a voice. Real photography (stock is fine — placeholder blocks are not).
- **Do not author the storefront CSS by hand.** Start from a real theme's rendered markup and CSS — Shopify's Dawn is the natural reference since it is what a large share of stores actually run. Check its LICENSE before shipping anything verbatim; derive the structure if the terms are restrictive. "The storefront CSS was not written by me" is a stronger claim than any hand-made polish.
- **After the `<script>` tag is added, storefront source is frozen.** Any bug that would be fixed by editing shop CSS is a bug in the widget. Fix it in the widget. This rule is the demo.

**Realism is the test rig, not decoration.** Each element below is an adversary the widget must survive. Build the ones in this table on purpose:

| Real-store element | What it tests |
|---|---|
| Cookie banner at `z-index: 2147483647` | Launcher stacking — sit above or below deliberately, not accidentally |
| Newsletter modal with a focus trap | Opening the agent is not swallowed |
| Sticky mobile add-to-cart bar | The 375px collision case |
| Announcement bar that shifts layout on load | Launcher position survives reflow |
| A third-party chat widget already installed | Two bubbles, one corner. Real stores have this |
| 3–4 junk scripts and a font loader | We coexist with normal script soup |
| Global `button {}`, `input {}`, `* {}` resets, Tailwind preflight on one | Shadow DOM isolation is real, not theoretical |

This table doubles as a slide for the office session.

**Catalog depth: 30–40 products per store.** Not cosmetic. The no-match moment in §8 is only credible if the shopper could plausibly believe something matched — with eight products "nothing fits" is arithmetic, with thirty-five it is a finding. Include messy realism: one out of stock, one on sale with a strikethrough, one with a missing image, ratings like 4.3 from 11 reviews.

**Where realism stops.** No checkout, no payments, no auth, no cart persistence beyond `localStorage`. Add-to-cart increments a badge. Those parts test nothing.

**Time box: 6 hours total for both stores.** At hour 8 you are building a shop instead of a proof.

**Brand A — VELDE.** Amsterdam minimal apparel, in the ETQ mould. Paper-white `#FBFAF8` ground,
near-black `#1C1B19` as the *accent* (the CTA is black, as it is on every minimal-lux store —
which also makes it a useful stress case for the contrast clamp). Light grotesk, small type,
`radius: 0`, hairline rules instead of shadows, generous scale, enormous whitespace, tiny
`UPPERCASE` tracked micro-labels, monochrome throughout — the photography carries all the colour.
**English**, as ETQ ships. Catalog: outerwear, knitwear, leather — spec fields are `material`,
`fit`, `made in`, `care`.

**Brand B — KRACHT.** Dutch sports nutrition, in the XXL Nutrition mould. Near-black `#121212`
ground with an acid `#C6F441` signal, heavy display weights at large sizes, rounded badges,
compact density, dense grids, flavour swatches, `−25%` flags and struck-through pricing, a
`9,6/10` review badge, bulk pricing. Emphasis comes from weight and colour, not tracking, so
labels stay sentence case. Catalog: protein, creatine, pre-workout — spec fields are
`protein per serving`, `flavour`, `size`, `servings`, `diet`.

**Both stores ship in English. Localization is explicitly not built** (§10). What stays is the
*market*, not the language: a Dutch webshop selling in English still shows iDEAL, Klarna and
Bancontact, still promises `Voor 23:00 besteld, morgen in huis` as a delivery badge, still prices
around a BTW toggle. ETQ proves it — English across ten locales, iDEAL at checkout. We keep the
furniture and drop the translation, which is where the market signal actually lives.

**Dutch-market furniture is part of the realism, and it is the detail no generic take-home will
have.** On KRACHT: an `Excl./Incl. VAT` toggle, `Free shipping over €50`, a next-day cut-off
badge, iDEAL and pay-later badges, a Kiyoh-style score out of 10 with a review count, a GDPR
cookie bar. On VELDE: `Free shipping over €150`, `14 days to decide`, iDEAL / Klarna / Bancontact
/ Apple Pay. Both sets are lifted from what ETQ and Proforto actually render today — the VAT
toggle and the score-out-of-10 are the two a non-European build never thinks to include.

**Persona is a token too, and the two brands must prove it — including language.** KRACHT
personifies, because a sports nutrition store does: the agent is **Joep**, a coach, with an
illustrated avatar, first person, warm and direct. VELDE does not
personify, because a minimal-lux store never would: no name, a small mark instead of a face,
clipped English lines, tracked caps labels. Same component, same code — one is a training buddy,
the other is a quiet shop assistant that stays out of the way. Reviewers expect colour and type
to be configurable; **voice and personification** are the axes that show you thought past the
obvious.

The two catalogs deliberately have **different spec schemas**. The agent's product card must render `{label, value}[]` generically. If the card hardcodes "flavour", it fails.

---

## 5. The embed contract

One line. Nothing else.

```html
<script src="https://maximal.releashed.io/v1/agent.js" data-shop="velde" async></script>
```

- Single IIFE bundle, no framework assumed on the host page, no CSS file to include.
- Mounts a **custom element with a shadow root**. All widget CSS lives inside the shadow root. Not an iframe: iframes cost us resize choreography, overlay positioning, and mobile keyboard behaviour at 375px, and they make the agent feel like a pasted-in box rather than part of the store.
- Known trade-off to own out loud: `@font-face` does not resolve inside a shadow root, so the loader injects the font `<link>` into the host `<head>`. Document this in DECISIONS.md rather than hiding it.
- Config is fetched at runtime from `/v1/config/:shopKey` and cached in `localStorage`; the loader paints nothing until tokens resolve, so there is no unbranded flash.
- Defensive resets inside the shadow root anyway (`all: initial` on the host, explicit `font-size`/`line-height`), because inherited properties still cross the boundary.

---

## 6. Catalog — how the agent knows what is for sale

**We do not ask the merchant for an API. We read their store the way Google does.**

Both demo storefronts must publish, exactly as a real Shopify or WooCommerce store does:

- `/sitemap.xml`, with product URLs
- `schema.org/Product` JSON-LD on every product detail page — `name`, `description`, `image`, `sku`, `offers.price`, `offers.availability`, plus `additionalProperty` entries for the brand-specific specs

This is not a convenience for us. It is what every real store already emits, because Google requires it for rich results. Building against it means we integrate with the open web, and Shopify happens to be on it.

**Consequences worth naming out loud:**

- **One paste, two payloads.** The same crawl that reads their CSS for fonts, colours, and radii reads their JSON-LD for products. Brand and catalog arrive from a single URL. For a non-technical merchant, onboarding is one input.
- **We can demo against a store we did not build.** Point the ingester at any real webshop, live, and watch the agent come up wearing their brand with their products. A shared demo API can never do this.
- **The two shops never talk to each other.** No common assortment service. Each owns its own catalog in its own shape; normalisation happens on our side at ingest. That normalisation layer is the thing being demonstrated.

**Normalised product shape after ingest:**

```ts
{ id, title, url, image, price, currency, inStock,
  specs: { label: string, value: string }[],
  tags: string[]          // structured attributes derived at ingest
}
```

**Retrieval is a filter, not a model.** Each constraint chip is a predicate over `tags` and `price`. Recommendation = intersection. This is why the obstacle in §8 is *computed* rather than scripted: intersect the chips, get an empty set, then find which single chip removal yields results and offer exactly that trade-off. The failure moment in the demo is real.

**The ingestion ladder** — state all four in DECISIONS.md, build only tier 0:

| Tier | Mechanism | Status |
|---|---|---|
| 0 | Sitemap + JSON-LD crawl | **built** |
| 1 | Google Merchant Center feed URL | specced |
| 2 | Platform app (Shopify/Woo OAuth), live price and stock | specced |
| — | Merchant builds us a custom API | rejected — inverts the work onto the person least able to do it |

**Honest cost:** a crawl is a snapshot, so price and availability go stale. That is precisely what tier 2 exists to fix. Say so rather than hoping nobody asks.

---

## 7. Token system

**Merchant-controlled inputs (the entire surface — keep it this short):**

| Group | Token | Values |
|---|---|---|
| Colour | `accent` | one colour |
| | `surface` | one colour (page background) |
| Type | `fontDisplay`, `fontBody` | family + weight |
| | `scale` | `compact` \| `regular` \| `generous` |
| Shape | `radius` | `0` \| `sm` \| `md` \| `lg` \| `pill` |
| | `elevation` | `hairline` \| `soft` |
| | `labelCase` | `sentence` \| `upper-tracked` |
| Density | `density` | `compact` \| `comfortable` |
| Voice | `name`, `avatar`, `greeting`, `tone` | — |
| Launcher | `style` | `bubble` \| `pill` \| `text-anchor` |
| | `position` | corner |

**Derived, never merchant-set:** `textOnAccent` (contrast-flipped black/white), `surfaceRaised`, `surfaceSunken`, `border`, `textPrimary`, `textMuted`, `focusRing`, `overlayScrim`. All derivation in OKLCH with a hard AA contrast clamp.

**`focusRing` is derived against the surface it lands on, not against `accent` alone, and is clamped ≥3:1 (WCAG 1.4.11) against *both* `accent` and `surface`.** Measured reason: VELDE's accent is near-black, so a focus ring derived from `accent` sitting on an accent-filled CTA computes **1.0:1** — an invisible focus indicator on the primary button of brand A. The clamp covers text pairs at 4.5:1; a non-text indicator needs its own rule or it falls through the gap. A merchant who picks a pale yellow accent gets readable buttons whether they understand why or not.

**The rule that makes this work:** components reference derived tokens only. `accent` itself appears in exactly two places — primary CTA fill and focus ring.

**What separates a real token system from a colour swap:** `density`, `radius`, `elevation`, and `labelCase` change *layout feel*, not paint. VELDE and KRACHT must differ in spacing rhythm, border-vs-shadow, and label treatment — not just hue. Test: screenshot the same message under both, convert to greyscale. They should still look like different products.

---

## 8. The agent

Deterministic finite state machine. No model call.

**States:** `idle → intake → clarify → recommend → compare → obstacle → resolve → act`

**Message protocol** — typed blocks, each with its own renderer:
`text` · `quick-replies` · `chips-update` · `product-card` · `product-compare` · `no-match` · `cta`

**Constraint chips.** A persistent, editable row holding the shopper's accumulated brief — `no sweeteners` · `lactose-free` · `under €30`. This is the spine of the whole interaction. It makes state visible, it wraps cleanly at 375px, it handles the mind-change case, and it turns the no-match moment into a decision instead of a dead end.

**Opening messages** (shopper-written, open-ended, two-plus constraints):

- VELDE — *"I need a jacket I can wear to the office and on the bike. Black, nothing shiny, and ideally under €250."*
- KRACHT — *"I'm after a protein shake with no sweeteners, lactose-free, and ideally under €30."*

**The obstacle (required by the brief).** Nothing in the catalog satisfies all three constraints. The agent does not apologise vaguely. It names the blocking constraint, quantifies the trade-off, and hands the choice back:

> Nothing clears all three. Two options fit everything except price — the closest is €36.95. Want
> me to stretch the budget, or drop *no sweeteners* and stay under €30?

The sentence is a template in the config payload plus arithmetic in the widget, never a hardcoded
string: the blocking constraint and its quantified cost are computed, and only the wording is a token.

The dropped chip stays visible, struck through, restorable in one tap. That single interaction demonstrates state, recovery, and respect for the shopper simultaneously.

**Second obstacle if time allows:** mid-flow reversal — *"actually it's for my girlfriend, she's training for a marathon"* — chips rewrite, previous recommendations visibly retract.

---

## 9. The configuration page

The merchant is often non-technical and always precious about their brand. Resolve that with layers, not with a settings list.

1. **Paste your store URL.** We fetch it, extract palette, font stack, dominant radius, logo, spacing rhythm.
2. **"Here's what we found."** A review screen, everything editable, nothing assumed correct. This is the trust moment — show the merchant we looked at *their* site.
3. **Live preview beside the controls, rendered in a real shadow root over a capture of their actual page.** Not a generic phone frame on a gradient. Seeing the agent sitting on their own storefront is the screen that wins this take-home.
4. **A natural-language refinement field** — *"warmer, less rounded, more compact"* — that visibly mutates the tokens on the left. AI as an accelerator on top of direct manipulation, never as a replacement for it. Chat-only configuration removes direct manipulation and leaves nothing to look at.
5. **Copy your snippet**, plus a "waiting for first load / detected ✓" verification state.

Undo, and reset-to-detected, throughout.

---

## 10. Explicitly not building

Auth, billing, multi-tenant permissions, analytics, conversation persistence, a real LLM, and ingestion tiers 1–2 from §6. Every one of these goes in DECISIONS.md under "what I cut," which is a question they asked and therefore a place to score.

**i18n stays on this list, deliberately, after being briefly taken off it.** A Dutch-language KRACHT was planned and then descoped: the market signal it bought lives in the *furniture* (iDEAL, the VAT toggle, the delivery cut-off, the review score), not in the translation, and translated copy is the one surface on this build that a native-speaking reviewer would judge hardest and that no benchmark can check. Both stores ship English. What *survives* from that plan is architectural and worth keeping on its own merits: every user-visible string still travels in the config payload rather than living in the widget (§5), because a copy fix must not require a merchant to re-paste their script tag.

---

## 11. Build order

Each stage is a **vertical slice that runs**, under **both brands**.

- **Bike** — static shop A exists. One `<script>` tag mounts a shadow root and renders a launcher plus one hardcoded message using tokens from a literal object. Swap the object for brand B's tokens, confirm it looks like a different product.
- **Motorcycle** — shop B exists. Tokens move behind `/v1/config/:shopKey`. Message protocol and the FSM land. Full happy path, chips included. 375px enforced from here on.
- **Car** — config page: controls, live preview over the real storefront, snippet copy. The obstacle flow.
- **Aeroplane** — URL ingest: one crawl, brand tokens and catalog together. NL refinement field. Motion, focus states, keyboard handling, empty and loading states. Polish pass under both brands, at 375px, at 1440px.

Rough allocation across the window: 6h storefronts · 10h agent · 8h config page · 6h ingest and polish · 3h DECISIONS.md and demo rehearsal · rest as buffer, which will be consumed.

---

## 12. Working agreement

- **`DECISIONS-LOG.md` is appended to as we go**, not reconstructed at the end. Every time a suggestion is overridden, one line: what was proposed, what was done, why. They ask about this explicitly and a reconstructed answer sounds reconstructed.
- Storefront source is frozen after §4. No exceptions, no "just one class".
- No new token without it being added to §7 first.
- Nothing is done until it has been seen under both brands at 375px.
- Parallel agent work runs through `git-desks`.
