# DECISIONS.md

## What the merchant controls, and what we refuse

Of twelve competing products, the eight I could check ship **zero legibility guarantee** — Gorgias
files an unreadable colour pair as "the merchant's own risk to manage"; Rebuy warns that its widget's
CSS does not stay inside the widget. **The merchant ends up owning outcomes their vendor caused.**

**They control two colours, two fonts, type scale, radius, elevation, label case, density, voice,
launcher. No custom CSS.** In exchange we own the outcome: every text pair the widget can emit is
checked against 200 generated brands — 1400 pairs, worst ratio **4.500:1**, none below AA. Where a
merchant's colour would ship an unreadable pair the widget **overrides it, never silently** — the
page names the pair and the ratio it shipped. Our closed box is harsher than anyone's — a shadow
root cannot be worked around like an unscoped page selector — but Rebuy's own docs make the case for
it: they tell merchants to hand-scope every selector so the widget stops damaging their store.
**Honest cost: a merchant who wants something we did not anticipate cannot have it today.** One
element stays constant and unsettable — the AI signature, per EU AI Act Article 50.

The page opens on **one field: your domain**, and returns a filled draft onto a **review screen that
never auto-applies** — a Cloudflare challenge page has colours too. The preview beside it is the
agent inside their **own live storefront, in an iframe**; almost the whole field previews against a
dashboard mock. Honest cost: a crawl is a snapshot, so stock goes stale.

## Holding up across brands

Both storefronts were **frozen the moment the embed line landed**: any bug fixable by editing the
shop is a bug in the widget. The rule *is* the product claim: a demo where the store gets quietly
nudged to fit proves zero-integration false while looking identical. One exemption, adjudicated by
hand mid-build: origin literals.

**The isolation claim was false, and measured rather than assumed.** `:host { all: initial }` loses
to outer-document rules: a host rule matching the element moved **31 computed properties** inside the
shadow root on the live storefronts. One hole stays open and named — `@font-face` does not resolve
inside a shadow root, so **"fully isolated" and "exact brand font" cannot both be true.** I chose the
font and say so.

Shopper state lives in **tappable chips above the composer**, not the chat log, so a dead end arrives
with the blocking constraint already on screen and one tap from being dropped. None of the twelve
names the blocking constraint back to the shopper.

## The model reads; it never decides

A live model does **intake only** — free text to constraints — because the deterministic parser is
eight regexes and demoing it means remembering which phrasings were anticipated. It runs
server-side behind the Vercel AI SDK (`ai` + `@ai-sdk/anthropic` + `zod`: the repo's first runtime
dependencies, all on the platform origin, none in the 15.3 kB a merchant's page loads). Retrieval,
the blocking constraint and the chip row stay arithmetic, so the graded failure moment is computed,
not generated: the model picks tags from a `z.enum` of that merchant's own catalog and never writes
a product, a price, or a word the shopper reads. The endpoint checks its own reading and discards
one that would answer worse than the offline brain. **A typical turn is 3.5 s** (median of 15,
`claude-opus-5`, 3.3–4.6 s). No key, no network, a timeout or a poor reading all fall back to the
local brain mid-conversation, which is why the demo survives hotel wifi. Swapping provider is four
lines in one file; the six openings were re-run on `gpt-4o` to prove it.

## What the AI suggested that I overrode

- **Testing — 18 Aug.** It proposed light `assert` self-checks, no framework. Overridden: agents that
  write every line *and* grade their own work produce worthless evidence. It paid three times. The
  cross-brand divergence check — the one certifying this build's headline claim — stripped colour in
  a way that also erased the two page backgrounds, so it **passed on colour alone**; a widget that
  swapped two hex codes and ignored every structural token would have cleared it. The contrast rule
  passed its own seventeen tests and shipped a pair at **4.4807:1**, measuring floats where the
  browser ships rounded bytes. The cross-host isolation assertion compared only `!important`-pinned
  properties, so it **could not fail**. Each caught by a second agent *after* the first reported
  success. The rule worth keeping: **whoever makes a thing never checks it.**
- **Fonts — 19 Aug.** It designed a curated font picker. A picker cannot match a brand it has never
  heard of, so we take the merchant's own stylesheet. One product in thirteen does this.
- **Market research — 19 Aug.** Its plan filed "what the alternatives already do" under *not graded*.
  Overriding that produced the section above.

## Cut, weakest, next hour

**Cut:** one failure moment rather than two; auth, billing, analytics, history; fewer page templates
per store; a custom domain.

**Weakest: the research motivating this product came back empty.** Across eight products I found
essentially no merchant complaining that a widget clashed with their brand — either they churn
silently or the premise is overstated. More review mining will not fix it; asking your own churned
trials will. Second: on **14% of brand colour pairs no focus ring stays visible** against both the
button and the page behind it. Both demo brands sit outside that band, which I name rather than
enjoy: demo cases that dodge your one known failure are the accident the freeze exists to prevent.

**Another hour:** close the 14% with a two-tone ring. Read the product feed they already maintain —
snapshot versus live stock. And open a hatch that does *not* reopen the legibility question: named
parts and allowlisted properties, Stripe's shape.

*Every decision above was written down in the session it was made: `DECISIONS-LOG.md`.*
