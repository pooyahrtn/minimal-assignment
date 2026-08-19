# DECISIONS

Maximal is one `<script>` tag. It has to land on a store it has never seen and look like it was
always there. Everything below comes out of that one sentence.

## One field, then a review screen

The configuration page opens on **your domain** and nothing else. One crawl returns both halves —
brand *and* catalog — and hands back a filled draft on a screen that **never auto-applies**. The
merchant approves our guess before it becomes their brand.

Beside the draft, the preview is the agent **inside the merchant's own live storefront**, in an
iframe. Every competitor I looked at previews against a dashboard mock, which cannot show the one
thing that matters — how it sits next to their own buttons.

They control two colours, two fonts, type scale, radius, elevation, label case, density, voice and
launcher. **No custom CSS.** Of twelve competing products, the eight I could check ship *zero*
legibility guarantee — one files an unreadable colour pair as the merchant's own risk to manage,
another warns that its widget's CSS escapes and restyles the store. The merchant ends up owning an
outcome their vendor caused. We take the opposite trade: a closed vocabulary, and the outcome is
ours. Every text pair the widget can emit is checked against 200 generated brands — 1400 pairs,
worst ratio **4.500:1**, none below AA. Where a merchant's colour would ship something unreadable
the page **names the pair and the ratio** instead of quietly substituting one.

Honest cost: a merchant who wants something we did not anticipate cannot have it today. One element
is not settable at all — the AI signature, per EU AI Act Article 50.

## Frozen stores

Both storefronts were **frozen the moment the embed line landed** — so that we could never cheat.
Any bug you could fix by editing the shop is a bug in the widget, and a demo where the store gets
quietly nudged to fit proves zero-integration false while looking identical.

Same reason we test the widget on the two real stores as they actually run, not on a stripped-down
stand-in. That is how we found the widget was nowhere near as sealed off as we assumed: one
ordinary rule on the merchant's page was reaching inside and changing **31 things** in the widget.
On a fixture it looked perfect.

One deliberate exception. The widget lives in a sealed box: the store cannot style it, and it
cannot style the store. Fonts are the one thing that box cannot load for itself — a browser only
loads them in the page around it. So to show a merchant's real typeface, we add one `<link>` to
their page pointing at a font file they already own.

For the merchant that is one extra file on the page and nothing else. It cannot restyle their
store, because we only add a font their page is not already loading itself — if their theme
serves it, we add nothing. And if the file fails to load, only our widget falls back to a system
font; their store never notices.

## The dead end we designed

The happy path is the easy part, so the demo's centre is a failure. Ask KRACHT for a protein shake
with no sweeteners, lactose-free, under €30 — nothing in 36 products does all three. The agent names
the **blocking constraint and the number** (€32.95, the nearest thing that fits) and offers to drop
that one chip. Shopper state lives in tappable chips above the composer, not buried in the
scrollback, so the dead end arrives with the blocker already on screen and one tap from being gone.
None of the twelve names the blocking constraint back to the shopper.

## The one the evals found

We wrote automated evals and tests so the agent's quality is a number rather than an impression,
and so a later fix cannot quietly break something that already worked. Each case is one shopper
message, paired with what the agent should understand and what it should admit it cannot do. A case
checks only that the shopper is *told* — never the wording — so rewriting copy never breaks it.
Cases we fail stay in the suite, red, instead of being deleted; the score is always on screen.

They found the failure we would have demoed straight past: **the agent tells the shopper what it
did, and says nothing about what it could not do.** Ask for "a bag, nothing leather" and it ignored
"nothing leather" completely — leather bags came back, presented as the answer. Ask for "something
waterproof", or "a jacket that arrives before Friday", and the shop's product data has no such field
at all; the agent dropped those words and answered with full confidence anyway. Either way the
shopper cannot tell *nothing here matches* from *I never checked*. It almost stayed invisible: the
first time we looked the results happened to be right, because in that catalog no leather item was
a jacket — so ignoring "nothing leather" changed nothing on screen.

The agent now names what it cannot filter on, in the same chip row the shopper already reads. Real
exclusion is not built, and those cases stay red on purpose.

## The model reads; it never decides

The model only reads the shopper's message and turns it into constraints. Everything after that —
which products match, what is blocking, the chip row — is plain arithmetic, so the moment that
matters is computed rather than improvised. It can only pick from the merchant's own catalog tags,
and it never writes a product, a price, or a sentence the shopper reads. No key, no network or a
slow reply and the agent falls back to its own logic mid-conversation, which is why the demo
survives hotel wifi. Typical turn **3.5 s**.

## What the AI suggested that I overrode

- **It wanted `assert` self-checks and no test framework.** I insisted on a real suite plus
  benchmarks: agents that write every line *and* grade their own work produce worthless evidence.
  It paid three times — the cross-brand check passed on colour alone (a widget swapping two hex
  codes and ignoring every structural token would have cleared our headline claim), the contrast
  rule passed its own seventeen tests and shipped a pair at 4.4807:1, and the isolation assertion
  compared only pinned properties, so it could not fail. Rule kept: **whoever makes a thing never
  checks it.**
- **It designed a curated font picker.** A picker cannot match a brand it has never heard of, so we
  take the merchant's own font file. One product in thirteen does this.
- **Its plan filed "what the alternatives already do" under *not graded*.** Overriding that is where
  the contrast clamp turned out to be a position no competitor claims at all, and where "no custom
  CSS" stopped being a preference and became evidence.
- **It wanted language as a fourth brand axis.** I cut Dutch translation and kept the Dutch *market*
  furniture: iDEAL, VAT toggle, next-day cut-off. The signal lives in the furniture; translation
  carried the one risk no gate can check.

## Cut · weakest · one more hour

**Cut:** one failure moment instead of two; auth, billing, analytics, conversation history; fewer
page templates per store.

**Weakest: the research motivating this product came back empty.** Across eight products I found
essentially no merchant complaining that a widget clashed with their brand — either they churn
silently, or the premise is overstated. More review-mining will not settle that; asking your own
churned trials will. Second: on **14% of brand colour pairs no focus ring stays visible** against
both the button and the page behind it. Both demo brands sit outside that band, which I name rather
than enjoy — a demo that dodges its one known failure is the accident the freeze exists to prevent.

**Another hour, most urgent first:** keep the conversation alive across page navigation. It lives
in memory today, so tapping the agent's own product link and coming back opens an empty panel —
acting on the recommendation is what destroys the conversation. Then: feed the shopper's own
history into the conversation, and let the merchant write the prompt behind the greeting bubble, so
the opening line reacts to what that shopper has been doing instead of being one fixed sentence.
Both of those need proper speccing before they need code. Last, the two-tone focus ring that closes
the 14%.

*Every decision above was written down in the session it was made: `DECISIONS-LOG.md`.*
