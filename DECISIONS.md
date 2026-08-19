# DECISIONS.md

## I started with the field, not the feature list

Before building I scanned twelve competing products — Gorgias, Tidio, Rebuy, Zoovu, Klevu, Nosto,
Rep AI and others — to see how each one trades brand fidelity against a result that still works.

They all make the same trade: unlimited control, and the outcome is yours. The standard answer is a
box where the merchant writes their own styling code, and the small print is consistent. Of the
eight I could check, **zero ship any legibility guarantee** — Gorgias documents an unreadable colour
combination as "the merchant's own risk to manage." Rebuy warns that styling written for its widget
does not stay inside the widget: a rule meant to square off the chat's buttons will square every
button on the store unless the merchant carefully limits it themselves, one rule at a time.

Read those together and the position is: if the agent comes out illegible, that is your
configuration. If our styling escapes and changes your product page, that is your mistake. Neither
is a defect anyone will fix, because the vendor never promised the result — only the controls. **The
merchant is left owning outcomes their vendor caused**, which is a strange place for the person who
cannot read a contrast ratio to end up. Everything below follows from that.

## How far "match my brand" goes, and where I stopped

"Close enough is usually not good enough" has an end point, and deciding where it sits was the first
real call. Mine: the agent adopts your colour and your type, and then **holds its own geometry.**
Every embedded UI that people actually trust works this way — Shop Pay warns that changing its core
UI "runs the risk of diminishing trust," Apple Pay says do not alter the artwork. They take on the
host's brand; they never pretend to be the host.

There is also a law now. **EU AI Act Article 50 has been binding since 2 August 2026**: an AI
interaction has to be clear and distinguishable at first contact. A widget engineered to disappear
into someone else's page is the hardest possible case to defend under it, and both target stores are
in the EU. So one small element stays constant under every brand. It is not a watermark — it is the
part you can point at across two storefronts and see unchanged, which is also the cleanest proof
that this is one agent and not two.

So the target is not mimicry. It is a guest who is welcome twice.

## What the merchant controls, and what we refuse to give them

Two colours, two fonts, type scale, corner radius, elevation, label case, density, the agent's voice
and name, and the launcher style. That is the whole surface. **No custom CSS.**

In exchange we take responsibility for the outcome: every text pair the widget can produce is
guaranteed readable, checked against 200 generated brands rather than only the two we designed
against. Which means we sometimes override a merchant's colour, on the one surface where fidelity
was the whole point — so the override is never silent. The page **names the pair it changed, shows
before and after**, and lets them pick a different colour. A guarantee applied behind their back is
worse than no guarantee.

Honest cost: this is stricter than anything in the field, and a merchant who wants something we did
not anticipate cannot have it today.

## The merchant approves; they do not describe

The page opens on **one field: your domain.** We read their site and come back with a filled-in
draft — colours, fonts, shape language, their catalog. Nothing is auto-applied. It lands on a
review screen where everything is editable, because an automatic read can be confidently wrong:
plenty of stores sit behind a bot check, and a challenge page has colours too. When the read is
blocked or thin we say which parts we could not get and drop those fields to manual, rather than
present a confident draft assembled from a security page. That screen is the trust moment either
way — it is where the merchant sees that we looked at *their* store.

The preview beside it is the agent **running on their own storefront**, not a phone mockup on a
gradient. If the promise is "it will look right on your site," the screen has to be their site. They
leave with a snippet and a "detected ✓" state confirming the first real load.

Their catalog comes from what the store already publishes for Google, so the merchant supplies
nothing. Next tiers are their product feed, then a Shopify app with live stock. The tier I rejected
outright is *the merchant builds us an API* — that inverts the work onto the person least able to do
it.

## Locking the storefronts, so we could not cheat

I built two complete stores, modelled on real Dutch retailers so the surfaces are honest — VELDE,
Amsterdam minimal apparel, and KRACHT, sports nutrition. Then **both were frozen the moment the
embed line landed: after that point, any bug that could be fixed by editing the shop is a bug in the
widget.**

That rule is the product claim. What we sell is zero integration — paste one line, change nothing —
and a demo where the store gets quietly nudged to fit the widget proves the opposite while looking
identical. It cost real time at least twice, and it is the constraint I would keep first. The same
idea runs through the contract: every word the widget says lives in the merchant's config, so fixing
a line of copy never sends them back to their site.

## Two brands that differ in ways paint cannot fake

They differ in spacing rhythm, shape language, label treatment, and in whether the agent is a person
at all — KRACHT's is Joep, a coach who speaks in the first person, because that is how a sports
nutrition store talks to you. VELDE never personifies.

**Our own test for this was, as first written, worthless.** It was meant to prove the two brands
diverge structurally, but the way it stripped colour also erased the difference between their page
backgrounds, so it was passing on colour alone: a widget that swapped two hex codes and ignored
every structural token would have cleared the check certifying this build's headline claim. Caught
by a reviewer, not by the agent that wrote it.

## The interface decision the whole conversation rests on

A chat log is a bad place to keep state. So the shopper's brief lives in a **row of constraint chips
above the composer** — `no sweeteners` · `lactose-free` · `under €30` — accumulated as they talk,
always visible, each one tappable.

It shows the shopper what the agent thinks they asked for, so a misread is caught in a second rather
than three replies later. It handles a change of mind by tap instead of by paragraph. It wraps
rather than scrolls at 375px, which is where this is actually used. And it turns the dead end into a
decision: when nothing matches, the blocking chip is *already on screen*, and dropping it is one tap
— struck through, still there, restorable. The shopper ends on a product they can act on with the
reason they got there still above it.

## The hard moment is arithmetic, not a script

The catalog was written as a plausible assortment first, then whatever the arithmetic did was
reported. On KRACHT the three constraints genuinely leave nothing, so the agent says so and names
the constraint whose removal opens up the most options. The tempting version writes the catalog
backwards from the demo — it survives exactly until a real merchant connects a real one.

## What the AI suggested that I overrode

- **Testing.** It proposed light self-checks and no framework. Overridden, on the principle that when
  agents write every line *and* grade their own work, self-reported success is not evidence. It paid
  repeatedly: the worthless test above, a contrast rule that passed its own seventeen tests and still
  shipped an unreadable pair, product labels that did not match their photos — each found by a second
  agent **after** the first reported success. The rule I would keep is that whoever makes a thing
  never checks it.
- **Fonts.** It designed a curated font picker. A picker cannot match a brand it has not heard of,
  so we take the merchant's own font stylesheet — in practice the one their theme already loads.
  Twelve of thirteen products offer no font control at all, so this is the cheapest large win on the
  board. The gap I know about: a merchant whose licence forbids a public stylesheet has no way in.
- **Localisation.** It was treating language as a fourth brand axis. Overridden — the Dutch market
  signal that matters is iDEAL, a VAT toggle and a next-day cut-off, not translated copy.
- **Market research.** Its plan filed "what the alternatives already do" under *not graded* and cut
  it. Overriding that produced the first two sections of this document.
- **Once in the other direction.** I told it to use a component library everywhere; it declined for
  the storefronts and showed me the dependency count against two native HTML elements. It was right.
  It also read a licence I would have skimmed — the Shopify theme we meant to start from restricts
  use to themes that interoperate with Shopify, which ours do not.

## What I cut

One failure moment rather than two. Auth, billing, analytics and conversation history. Fewer page
templates per store, though catalog depth stayed. A bounded escape hatch for custom styling. A
custom domain, which scores nothing.

## The weakest part

**The research that motivated this product came back empty.** Across eight competing products I
found essentially no merchant complaining that a widget clashed with their brand. Either they churn
silently, or the premise is overstated — and every pass was a partial sample. It is the joint most
likely to break under a question, and I would rather hand you that than let you find it. What I
would do about it is not more review mining: it is asking your own churned and stalled trials
whether appearance ever came up, which is data only you have.

Second, the one accessibility promise I cannot fully keep: on **14%** of brand colour combinations
there is no keyboard focus outline that stays visible against both the button and the page behind
it. Both demo brands sit outside that band — which I want to name rather than enjoy, because picking
demo cases that dodge your one known failure is the same accident the storefront freeze exists to
prevent. They were chosen before the analysis and we stress-tested pure yellow on white, but you
still will not see this fail in the demo, and that is the point. The fix is designed, not built.

## What I would do with another hour

Close that 14%. Accept an uploaded font file rather than a link, so a merchant on a licensed
typeface has a way in at all. Read the product feed they already maintain, which is the difference
between a snapshot and live stock. And open a narrow hatch that does **not** reopen the question
above: a short list of named parts and an allowlist of properties, so a merchant gets more reach
while the legibility guarantee still holds. That is the opposite of a CSS box — a CSS box is what
makes the guarantee impossible to keep.

*Every decision above was written down in the session it was made, as it was made:
`DECISIONS-LOG.md`.*
