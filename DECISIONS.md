# DECISIONS.md

## How I thought about the merchant

I scanned twelve competing products first. They make the same trade: unlimited control, and the
outcome is yours. Of the eight I could check, **zero ship any legibility guarantee** — Gorgias
documents an unreadable colour combination as "the merchant's own risk to manage," and Rebuy warns
that styling written for its widget does not stay inside the widget. Read together: if the agent
comes out illegible that is your configuration, and if our styling escapes onto your product page
that is your mistake. **The merchant ends up owning outcomes their vendor caused** — a strange place
for the person who cannot read a contrast ratio. Everything below follows from that.

The agent adopts your colour and your type, then **holds its own geometry**. Every embedded UI
people trust works this way — Shop Pay warns that changing its core UI "runs the risk of diminishing
trust"; Apple Pay says do not alter the artwork. They wear the host's brand; they never pretend to
be the host. There is also a law: **EU AI Act Article 50, binding since 2 August 2026**, requires an
AI interaction to be clear at first contact, and both stores are in the EU. So one element stays
constant under every brand — the thing you point at across two storefronts and see unchanged.

**What they control:** two colours, two fonts, type scale, radius, elevation, label case, density,
voice, launcher. That is the whole surface. **No custom CSS.** In exchange we own the outcome: every
text pair the widget can produce is checked against 200 generated brands, not the two we designed
against. So we sometimes override a merchant's colour on the one surface where fidelity was the
point — and never silently: the page **names the pair it changed and shows before and after**.
Honest cost: this is stricter than anything in the field, and a merchant who wants something we did
not anticipate cannot have it today.

## The merchant approves; they do not describe

The page opens on **one field: your domain.** We read their site and return a filled-in draft —
colours, fonts, shape language, catalog. Nothing is auto-applied; it lands on a review screen where
everything is editable, because an automatic read can be confidently wrong: plenty of stores sit
behind a bot check, and a challenge page has colours too. The preview beside it is the agent
**running on their own storefront**, not a mockup on a gradient — if the promise is "it will look
right on your site," the screen has to be their site.

The catalog comes from what the store already publishes for Google, so the merchant supplies
nothing. That is tier 0, the one built. Tier 1 is their product feed, tier 2 a Shopify app with live
stock. Tier 3 — *the merchant builds us an API* — I rejected: it inverts the work onto the person
least able to do it. **Honest cost: a crawl is a snapshot, so price and stock go stale.** Tier 2 is
what fixes that.

## Two brands that differ in ways paint cannot fake

They differ in spacing rhythm, shape language, label treatment, and in whether the agent is a person
at all — KRACHT's is a coach speaking in first person; VELDE never personifies. Both storefronts were
**frozen the moment the embed line landed**: after that, any bug fixable by editing the shop is a bug
in the widget. That rule *is* the product claim — we sell zero integration, and a demo where the
store gets quietly nudged to fit the widget proves the opposite while looking identical.

**Our own test for this was, as first written, worthless.** It was meant to prove the two brands
diverge structurally, but the way it stripped colour also erased the difference between their page
backgrounds — so it passed on colour alone. A widget that swapped two hex codes and ignored every
structural token would have cleared the check certifying this build's headline claim. Caught by a
reviewer, not by the agent that wrote it.

**One deliberate hole in the isolation.** All widget CSS lives in a shadow root — except
`@font-face`, which does not resolve inside one, so the merchant's font stylesheet goes on the host
page. "Fully isolated" and "exact brand font" cannot both be true. I chose the font, and say so
rather than claiming total isolation.

## The interface decision the conversation rests on

A chat log is a bad place to keep state, so the shopper's brief lives in a **row of constraint chips
above the composer** — accumulated as they talk, always visible, each tappable. It turns the dead
end into a decision: when nothing matches, the blocking chip is *already on screen* and dropping it
is one tap. The emptiness is real arithmetic on a catalog written as a plausible assortment first —
writing it backwards from the demo survives exactly until a merchant connects a real one.

## What the AI suggested that I overrode

One caveat: the planning documents here were themselves AI-drafted and then owned by me, so "what
the AI suggested" includes what its own plan proposed. What matters is whether a human read it,
disagreed and reversed it. Each is dated to the commit that recorded it in `DECISIONS-LOG.md`.

- **Testing — 18 Aug.** It proposed light self-checks, no framework. Overridden: when agents write
  every line *and* grade their own work, self-reported success is not evidence. It paid repeatedly —
  the worthless test above, a contrast rule that passed its own seventeen tests and still shipped an
  unreadable pair, product labels that did not match their photos, each found by a second agent
  **after** the first reported success. The rule I would keep: whoever makes a thing never checks it.
- **Localisation — 18 Aug.** Its re-plan treated language as a fourth brand axis. Overridden — the
  Dutch signal that matters is iDEAL, a VAT toggle and a next-day cut-off, not translated copy.
- **Fonts — 19 Aug.** It designed a curated font picker. A picker cannot match a brand it has not
  heard of, so we take the merchant's own stylesheet. Twelve of thirteen products offer no font
  control at all. Known gap: a licence that forbids a public stylesheet has no way in.
- **Market research — 19 Aug.** Its plan filed "what the alternatives already do" under *not graded*
  and cut it. Overriding that produced the opening section of this document.
- **Once in the other direction — 18 Aug.** I told it to use a component library everywhere; it
  declined for the storefronts and showed me the dependency count against two native HTML elements.
  It was right. It also read a licence I would have skimmed — the Shopify theme we meant to start
  from restricts use to themes interoperating with Shopify, which ours do not.

## What I cut

One failure moment rather than two. Auth, billing, analytics, conversation history. Fewer page
templates per store, though catalog depth stayed. A bounded escape hatch for custom styling. A
custom domain, which scores nothing.

## The weakest part

**The research that motivated this product came back empty.** Across eight competing products I
found essentially no merchant complaining that a widget clashed with their brand. Either they churn
silently, or the premise is overstated — and every pass was a partial sample. It is the joint most
likely to break under a question. The fix is not more review mining: it is asking your own churned
trials whether appearance ever came up, which is data only you have.

Second, the accessibility promise I cannot fully keep: on **14% of brand colour combinations** there
is no keyboard focus outline that stays visible against both the button and the page behind it. Both
demo brands sit outside that band — which I name rather than enjoy, because picking demo cases that
dodge your one known failure is the same accident the storefront freeze exists to prevent. The fix
is designed, not built.

## What I would do with another hour

Close that 14%. Accept an uploaded font file rather than a link. Read the product feed they already
maintain — the difference between a snapshot and live stock. And open a narrow hatch that does
**not** reopen the question above: named parts and an allowlist of properties, so a merchant gets
more reach while the legibility guarantee still holds. That is the opposite of a CSS box; a CSS box
is what makes the guarantee impossible to keep.

*Every decision above was written down in the session it was made: `DECISIONS-LOG.md`.*
