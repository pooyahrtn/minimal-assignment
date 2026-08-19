# DECISIONS.md

Every line of code here was written by an agent. None of the decisions were, and the reviews that
caught the defects were not either. Reasoning in full, written in the session each call was made
and never reconstructed afterwards: `DECISIONS-LOG.md`.

## The configuration page opens on one field: your domain

We crawl it — brand out of the CSS, catalog out of the JSON-LD — and hand back a filled-in draft
that **lands on a confirm screen and is never auto-applied.** Shopify sits behind Cloudflare: a
silent fallback can read a challenge page's colours and call them your brand.

Catalog arrives on a four-tier ladder and **tier 0 is what shipped** — sitemap plus JSON-LD, the
store as Google already requires it to be readable. Tier 1 is the Merchant Center feed, tier 2 a
Shopify/Woo app with live stock, same `Product[]` boundary throughout. Tier 3, *the merchant builds
us an API*, is rejected outright: it inverts the work onto the person least able to do it. The cost
of stopping at tier 0 is real — a crawl is a snapshot, so price and stock go stale.

What they control is eleven inputs and **no custom CSS.** That is the field's most common feature
and I refused it on evidence, not taste: Rebuy's own documentation tells merchants to scope every
selector by hand because Smart Cart CSS "styles any element on the page that your selector
matches." Of eight products checked, zero ship a contrast guarantee; Gorgias's docs call an
illegible combination "the merchant's own risk to manage."

## What embedding this actually costs the host page

The launcher's `z-index` is `2147483647` **and** it is appended as the last child of `<body>`.
That number is where OneTrust and Cookiebot already sit — it is the 32-bit signed maximum, so
nobody wins by counting higher, and paint order breaks the tie. DOM position is the load-bearing
half of the constant, and I only know that because the launcher painted *under* a banner at the
same z-index on screen.

It also measures the storefront's sticky add-to-cart bar (`elementsFromPoint` at the bottom edge)
and lifts above it, because a collision on someone else's page is our bug, not theirs. Named
ceiling in the code: a bar injected minutes after load still wins.

All widget CSS lives in a shadow root **except `@font-face`**, which does not resolve inside one,
so the merchant's own font stylesheet goes on the host page as a single `<link>`. Fully isolated
and exact brand font cannot both be true; I took the font. Total: one `<script>`, 11.6 kB gzipped,
nothing painted until tokens resolve, and an unknown shop key answers 200 with a neutral config —
the widget must never be why a merchant's page breaks.

## Two measurements that changed the build

Components read **no merchant input at all**, only derived tokens; `accent` reaches exactly two
places, primary fill and focus ring. The 4.5:1 clamp is measured on the **rounded sRGB bytes that
ship**, not the float: one candidate cleared 4.5182:1 in float and 4.4807:1 once both colours
rounded to hex. It is green now over 200 seeded configs and 1400 pairs, worst ratio 4.500:1.

The benchmark certifying the brief's own top-line criterion was, as first written, worth nothing.
It desaturated both brands and compared them — but desaturation drops hue and keeps luminance, and
our two grounds are greyscale 250 and 25. The field delta cleared any floor before a single spacing
or radius token contributed, so a widget that themed two colours and ignored every structural token
would have passed. It now normalises the ground first and asserts ≥4 non-colour properties differ.

## The failure moment is arithmetic, not a script

KRACHT's three constraints collide on the real catalog and nothing clears all three. The fixture was
authored as a plausible assortment first and the arithmetic reported whatever it did — an assortment
tuned to produce the graded moment evaporates the day a real catalog lands.

Two things fell out of that. Three different single-chip removals each rescued the set, so the rule
had to be invented rather than read off the spec: name the chip that recovers the most options.
And the obvious phrasing — "stretch the budget, or drop *no sweeteners*" — promises a second option
this catalog does not have. Dropping `no sweeteners` while keeping `under €30` still returns
nothing. The copy offers what the arithmetic can actually deliver.

## What the AI suggested that I overrode

One honest caveat first, because it changes how you read the list: the planning documents in this
repo were themselves AI-drafted and then owned by me. So "what the AI suggested" includes what its
own plan proposed. The line that matters is whether a human read it, disagreed, and reversed it —
each of these is dated to the commit that recorded it in `DECISIONS-LOG.md`.

- **Testing — 18 Aug.** It proposed `assert` self-checks, no framework. Overridden to `bun test`,
  Playwright for anything with a DOM, and a benchmark split HARD (blocks) / SOFT (ranks, never
  blocks). With agents writing every line and grading their own work, hand-rolled asserts measure
  nothing. It paid for itself four times: every real defect in this build was caught by an
  independent check *after* the implementer's own tests were green.
- **Localisation — 18 Aug.** Its re-plan made one store Dutch and treated locale as a fourth brand
  axis. Overridden: the Dutch market signal lives in the furniture — iDEAL, an Excl./Incl. VAT
  toggle, a next-day cut-off — not in translated copy, which was also the one surface no benchmark
  could check.
- **Fonts — 19 Aug.** It designed a curated font picker inside the shadow root. Overridden to the
  font URL the merchant's own theme already serves: a picker cannot match a brand it has not heard
  of, and the shadow root makes its premise false anyway.
- **Market research — 19 Aug.** Its plan filed "what the alternatives already do" under *not graded*
  and cut it. Overridden, and it is why the claims above cite Rebuy and Gorgias instead of my taste.
- **Once in the other direction — 18 Aug.** I told it to use shadcn/ui wherever it could. It
  declined for the storefronts — ten runtime dependencies and three gate exemptions to replace a
  cart drawer and an accordion that are `<dialog>` and `<details>` natively. It was right. It also
  read a licence I would have skimmed: Dawn is MIT *plus a field-of-use clause* limiting use to
  themes that interoperate with Shopify, which a storefront on our own domain is not.

## What the process cost, since you will ask about the tooling

Agents ran in parallel worktrees, and the rule I would keep is that **the agent that builds a thing
never checks it.** That split caught four real defects, every one of them after the implementer's
own tests were green — the rounded-byte clamp among them. Nothing self-reported found any of them.

The estimates were wrong in a way worth naming: pure-logic tasks landed at roughly 25× faster than
planned, but **41% of the agent time spent went to work with no row in the task graph at all** —
sourcing product photography (88 minutes, the largest single line), a storefront fix pass, and the
seam joining the brain to the shell that was 15 minutes of work and zero minutes of plan. The
schedule risk was never the tasks. It was the work between them.

## What I cut

One failure moment, not two. Three templates per store rather than six pages, though catalog depth
stayed because that is a JSON file. A bounded `::part()` escape hatch. A custom domain.

## The weakest part

The focus ring. It clamps to 3:1 against both the accent it may sit on and the surface behind it,
because a ring derived from `accent` alone computed **1.0:1** on one brand's own primary button.
But a complete search over 1500 chromatic pairs found **207 — 14% — admit no ring colour at all**
that clears 3:1 against both; `bun bench contrast` reports the same hole at 45 of its 200 seeded
configurations. Both demo brands sit inside the feasible region, so you will not see
it, which is exactly why it is the weakest part and not a known bug: a merchant with a saturated
accent gets a focus indicator that quietly fails WCAG 1.4.11. The two-tone fix is specified and not
built.

Second, less comfortable: the research motivating the product came back **empty.** Across eight
competing products, essentially zero merchant complaints about a widget clashing with a brand.
Either merchants churn silently, or the premise is overstated. Every pass was a partial sample.
It is the joint most likely to break under a question.

## What I would do with another hour

Build the two-tone ring and close that 14%. Accept a raw `.woff2` rather than a stylesheet URL, so
a merchant on a licensed face is not quietly pushed onto Google Fonts. Parse the Merchant Center
feed — same `Product[]` boundary, and the difference between a snapshot and live stock. And ship
the escape hatch in Stripe's shape: named parts, an allowlist of properties, no arbitrary selectors.
We ship none today, and because the shadow root closes that door *structurally*, "no custom CSS" is
harsher here than anywhere in the field. A stated ceiling, not a feature.
