# TASKS.md — Maximal AI build plan

Derived from `TAKE_HOME.md` (the actual brief) and `PRINCIPLES.md` (our contract).
Where the two disagree, the brief wins. Deviations from PRINCIPLES are listed in §0 and
mirrored into `DECISIONS-LOG.md`.

**Budget: 36h wall clock, and the constraint is NOT typing.**
100% of this code is agent-written. T0 was estimated at 2.5h and landed in **6 minutes**, because
its scope was config files and type declarations — the cheapest thing an agent does. Every estimate
below is therefore in **two units**:

- **A** = agent wall-clock — how long producing it takes.
- **R** = human review time — Pooya reading the diff, opening the screen, deciding, correcting.

The real budget is R, plus the taste iterations that R triggers. This changes the plan's shape:
the build is ~8h of A, which leaves the majority of the window for the thing the brief actually
grades — how the screens feel, the quality of the copy, and the photography. Slack is not banked,
it is **spent on iteration loops over T2/T5/T7**.

---

## 0. What changed from PRINCIPLES, and why

| # | PRINCIPLES said | Doing instead | Why |
|---|---|---|---|
| 1 | 6 pages × 2 storefronts | **3 templates × 2** (home+listing, PDP, cart drawer) | About / shipping pages are never opened in a review. Templates cost hours; catalog *data* stays at 30+ per store because it is a JSON file. |
| 2 | Start from Shopify Dawn's CSS | **Do not ship Dawn.** KRACHT from Next.js Commerce (MIT, Vercel). VELDE derived from Dawn's *rendered structure*, CSS regenerated. | Dawn's LICENSE.md is MIT **with a field-of-use clause**: rights "may only be exercised to develop themes that integrate or interoperate with Shopify software or services… All other uses are strictly prohibited." A storefront on our own domain is not that. PRINCIPLES §4 already said "derive if restrictive" — this resolves it. |
| 3 | Live tier-0 crawl is a build stage | **Crawl is a build-time script**, output committed as a JSON snapshot. Live-URL crawl is the config page's *brand* extractor only. | The crawl is real, provable, and same-code-path — but nothing in the live demo depends on a network fetch of a site we don't control. Cloudflare blocking a datacenter IP mid-presentation is a losing coin flip. |
| 4 | Preview over a *capture* of their page | **Preview is an iframe of the live storefront** with the widget mounted inside it. Screenshot fallback only for foreign URLs. | Headless Chrome on Vercel (`@sparticuz/chromium`, cold starts, 50MB) buys a static image. An iframe is less work *and* a better demo — it is live and interactive. |
| 5 | Obstacle lands in "Car" (stage 3) | **Obstacle lands with the first agent slice.** | The brief says the happy path is the easy part. Empty-intersection + which-chip-to-drop is ~20 lines of set logic and it is the graded moment. Build it before `product-compare`. |
| 6 | 7-row adversary table | **Build 3 on purpose** (max-z cookie banner, global reset + Tailwind preflight, 375px sticky ATC bar). Rest are stretch. | Those three are visible surviving. A focus-trap modal that works looks like nothing happened. |
| 7 | 3 Vercel projects on `releashed.io` apex | **3 Vercel projects on free `*.vercel.app`** first; custom DNS last, if slack remains. | Still genuinely cross-origin, so the CORS point stands. Zero DNS yak-shaving. Brief: "your code does not have to be deployed anywhere." |
| 8 | `product-compare`, 2nd obstacle (mind-change) | **Explicitly optional.** Cut candidates #1 and #2. | Named now so they can't quietly eat the polish budget. |
| 9 | PRINCIPLES §4: MARENNE (warm editorial skincare) + KLYFT (Nordic technical outdoor) | **VELDE** (Amsterdam minimal apparel, EN) + **KRACHT** (Dutch sports nutrition, NL) | The originals were `TAKE_HOME.md`'s own example sentence handed back to its author. Replaced with archetypes of Minimal's published client list (ETQ, XXL Nutrition). Full entry in `DECISIONS-LOG.md`. **Cost, measured and owned:** the old accents stressed the contrast clamp harder (MARENNE sage was 3.23:1 against its surface); the new ones are 16.5:1 and 14.7:1. T11's pale-yellow brand is therefore promoted from stretch to **required** — it is now the only place the clamp visibly does its job. |
| 10 | PRINCIPLES §10 listed i18n as explicitly not built | Locale is a real axis; an i18n *framework* is not built | KRACHT ships in Dutch, so the old line was false. §10 now says exactly what is and isn't built. |

**Additions not in PRINCIPLES:**
- **T10** makes "what AI suggested that I overrode" a tracked artifact, not an end-of-build reconstruction.
- **T11** adds a *third brand config as a 10-line object* — because the office session says "extend the build live", and adding a brand on stage in 60 seconds is the rehearsed party trick.

---

## 1. Task graph

```
T0 contracts  (blocks everything, ~1h, do alone)
   |
   +-- T1 tokens engine      ------\
   +-- T2 storefronts A+B    ------ +-- T7 config page ---\
   +-- T3 agent shell        ---\   |                      +-- T9 hardening -- T10 docs/demo
   +-- T4 agent brain        ---- +-- T6 platform API ----/
   +-- T5 message renderers  ---/   |
   +-- T8 ingest + extractor ------/
```

Truly parallel after T0: **T1, T2, T3, T4, T8**. T5 needs T3's style primitives.
T8's *build* is parallel; T8's last DoD box (obstacle fires on the real catalog) is a **landing gate** —
run it once T4's checker is in the tree. T8 is not done before then, and fixing a failure is T8's job, not T4's.
T7 needs T6 + a running storefront. T9/T10 are last.

| ID | Task | A (agent) | R (review) | Depends on | Parallel-safe |
|----|------|-----------|------------|-----------|---------------|
| T0 | Contracts, guardrails & repo skeleton | ~~2.5h~~ **6m actual** | 20m | — | no (blocking) |
| T1 | Token derivation engine | 20m | 15m | T0 | yes |
| T2 | Two storefronts | 90m + photo sourcing | **90m** | T0 | yes (split A/B) |
| T3 | Agent shell — embed, shadow root, chrome | 45m | 45m | T0 | yes |
| T4 | Agent brain — FSM, retrieval, obstacle | 30m | 20m | T0 | yes |
| T5 | Message block renderers | 60m | **90m** | T3 | yes |
| T6 | Platform API + snippet delivery | 15m | 10m | T0 | yes |
| T7 | Configuration page | 90m | **120m** | T6, T2 | yes |
| T8 | Catalog ingest + brand extractor | 45m | 30m | T0, T2 · T4 to close last DoD | yes (build) |
| T9 | Hostile-page hardening + polish pass | 45m | 60m | T3, T5, T2 | no |
| T10 | DECISIONS.md, log, demo rehearsal | 20m draft | **90m** | all | no |
| T11 | Third brand (stretch / live-extend prep) | 10m | 10m | T1, T6 | yes |

**Total: ~8h A + ~10h R ≈ 18h of the 36h window — provisional, one measured data point.**
The bolded R values are the graded surfaces. Note what "the remaining 18h" actually costs: A
parallelises across desks, **R serialises on one human**, and 36h is 1.5 calendar days containing
sleep. Booking all 18h as iteration would restore the 100% utilisation that `DECISIONS-LOG`
already rejected once for starving criterion #1. Plan iteration against ~8h of real remaining
attention, not 18.

**Two caveats this table must carry.** (1) `PRINCIPLES §4` time-boxes both stores at **6h**; the
90m here halves the contract's own number on the strength of one config-file task, so treat it as
unmeasured until T2 actually runs. Sourcing 60–80 coherent product photos is the least
compressible hour in the project and is *not* in the 90m. (2) The A column excludes the process
overhead the `pickup` skill mandates — two adversarial agent rounds per task, of which the first
one on this very re-plan took **~8.5 minutes and 95k tokens**. A-plus-overhead is the real number
and T1 is the first task that will measure it.

**What this re-baseline changes.** Pure-logic tasks (T1, T4, T6, T8) collapse to minutes and stop
being schedule risks. Asset-bound and taste-bound work (T2's photography and Dutch copy, T5's
seven blocks × two brands, T7's whole surface) does **not** compress, because it is bounded by a
human looking at a screen. Estimation is now tracked per task in `PROGRESS.md`; a systematic miss
re-baselines the whole class, not the single row.

The benchmark suite is no longer a trade against the buffer — the buffer is now ~18h. It is
straightforwardly worth it: it is what makes it safe to let agents write fast, and its per-task
retry count measures `TASKS.md` as much as it measures the model.

---

## 2. Universal Definition of Done

Every task inherits these. A task is not done without them.

- [ ] Seen under **both brands** at **375px** and 1440px. (T1/T4/T6/T8 exempt — no UI.)
- [ ] No hardcoded colour, radius, spacing, or font size outside `packages/tokens`.
- [ ] `packages/agent` has zero imports from `apps/`.
- [ ] Any override of an AI suggestion appended to `DECISIONS-LOG.md` **in the same session**.
- [ ] Non-trivial logic leaves one runnable check behind (an `assert` self-check, not a suite).

---

## T0 — Contracts, guardrails & repo skeleton
**Blocking. Nothing else starts until this lands.** Guardrails go in *before the first line of
feature code* — retrofitting a complexity cap onto eight parallel worktrees is a rewrite, not a
lint pass. [ENGINEERING §4]

**Scope, part A — the guardrails.** Exactly the config in `ENGINEERING.md` §4, nothing invented:
Bun workspaces · `tsconfig` with `strict`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax` ·
Biome with `noExplicitAny: error`, `noExcessiveCognitiveComplexity: 15`, `noUnusedImports`/
`noUnusedVariables` at error, and `noRestrictedImports` blocking `apps/*` from `packages/agent`
**with the reason in the error message** · husky pre-commit running `tsc --noEmit` + `biome check`
on staged paths · `bun test` wired · Playwright installed · a `bun bench` runner that executes
named checks and writes `bench/report.md`.

**Scope, part B — four type contracts**, in code, no implementation:
1. `MerchantTokens` — exactly the merchant-set surface in §7, nothing more.
2. `DerivedTokens` — the derived list in §7, plus the CSS custom-property names they emit.
3. `Product` — the normalised shape in §6, `specs: {label,value}[]`.
4. `Block` — the discriminated union of the 7 message blocks in §8.
Plus the config API response envelope: `{ tokens, voice, catalog }`.

**DoD**
- [ ] Four types exported from `packages/tokens` and `packages/agent/src/types.ts`.
- [ ] `bun run build` produces a single IIFE at `packages/agent/dist/agent.js` (empty body is fine).
- [ ] Two literal token objects (VELDE, KRACHT) typecheck against `MerchantTokens`.
- [ ] An `import` from `apps/` inside `packages/agent` **fails `biome check`**, and the message says why.
- [ ] `bun bench` runs, finds zero checks, and **exits non-zero** — a run that collected nothing must never read as a pass. [ENGINEERING §3.1]

**QA (independent).** `bun run typecheck` passes. Then deliberately break each guardrail one at a
time — add a bogus token field, an `as any`, an unused import, an `apps/` import, a 3000-line
function — and confirm each is caught by name. A guardrail nobody has seen fail is not installed.

---

## T1 — Token derivation engine
`packages/tokens`. Pure functions. **No UI, no DOM.**

**Scope.** `derive(merchantTokens) -> DerivedTokens`, in OKLCH, with a hard AA clamp.
`textOnAccent` flips black/white by contrast. `surfaceRaised`/`surfaceSunken`/`border`/
`textPrimary`/`textMuted` derived from `surface`. `focusRing` from `accent`. Scale/density/
radius/elevation map to a numeric spacing + radius + shadow ramp.

**DoD**
- [ ] Every derived pair that renders text on a background is ≥ 4.5:1. **No exceptions, including pathological accents.**
- [ ] `focusRing` clears **3:1 (WCAG 1.4.11) against both `accent` and `surface`** — it is derived against the surface it lands on, never from `accent` alone. VELDE's near-black accent makes the naive derivation compute 1.0:1 on its own CTA; H1 must cover non-text indicators or it misses this entirely.
- [ ] `labelCase`, `density`, `radius`, `elevation` emit values that change *layout*, not just paint.
- [ ] Emits a flat `--mx-*` custom property map, ready to write onto the shadow host.

- [ ] **Owns benchmark H1 (`contrast`).**

**QA (independent).** `bun bench contrast` fuzzes 200 **seeded** (reproducible) accent/surface pairs, asserts every text/bg pair clears 4.5:1, prints the count checked and the worst ratio with the config that produced it. Pass = zero failures, count > 0. Runs with no browser and no other task landed.

**Not in scope.** Colour *extraction* from a URL (that's T8). Any component.

---

## T2 — Two storefronts
`apps/shop-velde` (static HTML/CSS, **English**), `apps/shop-kracht` (Next + Tailwind, **Nederlands**).
**Integration-blind: build as if the agent is never coming.** Splits cleanly across two desks.

**The realism bar changed.** These are archetypes of Minimal's own clients — VELDE after ETQ
Amsterdam, KRACHT after XXL Nutrition (PRINCIPLES §4). A reviewer at Minimal should recognise the
*category* immediately. Model the conventions, never the identity: our names, our logos, our copy.

**Scope per shop.** 3 templates only — home (with inline listing grid), product detail, cart drawer.
30–40 products as a JSON file, rendered by template. Real stock photography. Real copy in-voice,
**in the shop's own language**. `sitemap.xml` + `schema.org/Product` JSON-LD on every PDP with
`additionalProperty` specs. Deliberate mess: one out of stock, one on sale with strikethrough, one
missing image, odd ratings.

**Dutch e-commerce furniture — the detail no generic take-home has.** On KRACHT: comma decimals
(`€36,95`), an `Excl./Incl. BTW` toggle, `Gratis verzending vanaf €50`, `Voor 23:00 besteld,
morgen in huis`, iDEAL + *achteraf betalen* badges, a Kiyoh-style `9,6/10` score with a review
count, an AVG *cookiemelding*. On VELDE: `Free shipping over €150`, `14 days to decide`, iDEAL /
Klarna / Bancontact / Apple Pay. Both sets are lifted from what ETQ and Proforto render today —
verified, not imagined.

**Adversaries to build on purpose (3 required):**
- cookie banner at `z-index: 2147483647` (VELDE)
- global `*{}`/`button{}`/`input{}` reset (VELDE) + Tailwind preflight (KRACHT)
- sticky mobile add-to-cart bar on PDP (both) — this is the 375px collision case

Stretch adversaries: focus-trap newsletter modal, announcement bar that reflows on load, a fake third-party chat bubble, junk scripts + font loader.

**DoD**
- [ ] Zero occurrences of `maximal`, `agent`, or any mount point in storefront source. `grep -ri` proves it.
- [ ] The two shops are visibly different products in **greyscale** — spacing rhythm, border-vs-shadow, label case, not just hue.
- [ ] A Dutch reader finds nothing machine-translated on KRACHT. Product copy, USP bar, and the cookiemelding read as written by the merchant.
- [ ] Every PDP validates as `schema.org/Product`.
- [ ] Shops share **no** code, no assortment service, no common component.
- [ ] **Frozen after the `<script>` tag is added.** From that point, any visual bug is a widget bug.

**QA (independent).** Open each shop at 375px with JS disabled — pages still read. Paste a PDP URL into Google's Rich Results Test → valid Product. `grep -ri "maximal\|widget\|agent" apps/shop-*` → no hits.

**Not in scope.** Checkout, auth, payments, search, filters, About/Shipping pages.

---

## T3 — Agent shell (embed, shadow root, chrome)
`packages/agent`. **Renders against a literal token object — does not wait on T1 or T6.**

**Scope.** The loader: read `data-shop` from its own `<script>`, fetch config, cache in
`localStorage`, inject the font `<link>` into host `<head>` (the documented shadow-DOM
`@font-face` trade-off), mount a custom element with a shadow root, paint nothing until
tokens resolve. Then the chrome: launcher (bubble / pill / text-anchor × corner), panel
open/close, header with persona, scrolling message list, composer, constraint-chip row.

**DoD**
- [ ] One `<script>` line on a frozen storefront produces a fully branded widget. No second line, ever.
- [ ] **No unbranded flash** — nothing paints before tokens resolve.
- [ ] At 375px: panel is full-height, composer clears the mobile keyboard, chips wrap, and the launcher does not collide with the sticky ATC bar.
- [ ] Focus is trapped in the panel while open, `Esc` closes, focus returns to the launcher.
- [ ] Launcher z-index sits above the cookie banner **deliberately** — a named constant with a comment, not a lucky number.

**QA (independent).** Add the script tag to both shops. Toggle the literal token object VELDE↔KRACHT and reload: it must read as a different product, not a recoloured one. Keyboard-only: Tab to launcher, Enter, Tab through panel, Esc. Never touch storefront source to make any of it work.

**Not in scope.** Any conversation logic. Any message block beyond `text`.

---

## T4 — Agent brain (FSM, retrieval, the obstacle)
`packages/agent/src/brain`. **Pure logic, headless, no DOM.**

**Scope.** The FSM `idle → intake → clarify → recommend → obstacle → resolve → act`.
Intake: keyword/synonym map from free text → constraint chips (not a scripted branch —
the opening message is parsed). Retrieval: each chip is a predicate over `tags`/`price`;
recommendation is the intersection.

**The obstacle is computed, never scripted:** intersect all chips → empty set → for each chip,
test the intersection *without* it → return the single removal that yields results, plus the
quantified cost ("closest is €48"). Chip removal is reversible.

**DoD**
- [ ] Feeding the VELDE opening message produces ≥3 chips with no hardcoded string match on the whole sentence.
- [ ] The no-match state is reached by *arithmetic on the real catalog*, not a flag.
- [ ] The agent names the blocking constraint and quantifies the trade-off.
- [ ] Dropping a chip is one call and is undoable; the dropped chip survives in state.
- [ ] Works against **both** catalogs with **different spec schemas** — zero brand-specific branches. `grep -i "velde\|kracht"` in `brain/` → no hits.
- [ ] The checker reads its catalog from a **path argument**, never an inlined array. Swapping in a different catalog file is the only change needed to re-verify.
- [ ] **Owns benchmark H3 (`transcript`).** Golden block sequences for both brands land in `bench/gold/`. Fixtures use MORE chips than the number that first empties the set — an invariant that co-exists with a limit is tested above that limit. [ENGINEERING §3.3]

**QA (independent).** `bun bench transcript [catalogPath]` replays both opening messages (verbatim from PRINCIPLES §8) against a catalog and asserts: chips extracted, intersection empty, correct single chip identified for removal, non-empty result after removal. Defaults to the committed snapshot at `packages/agent/src/brain/catalog.{velde,kracht}.json`. T2/T8 have not landed yet, so ship a small placeholder at `packages/agent/src/brain/fixture.json`, run against that, and **say in the hand-off that the numbers came from a fixture you wrote** — the fixture proves the logic, only T8's snapshot proves the demo. No browser needed.

**Not in scope.** Rendering. `product-compare`. The mind-change flow (both optional).

---

## T5 — Message block renderers
7 renderers: `text` · `quick-replies` · `chips-update` · `product-card` · `product-compare` · `no-match` · `cta`.

**Scope.** One renderer per block type, each consuming derived tokens only. The product card
renders `specs: {label,value}[]` **generically** — it never knows what an ingredient is.
`no-match` is the designed screen, not an error state: struck-through chip, restorable in one tap,
the trade-off stated as a choice.

**DoD**
- [ ] Product card renders VELDE specs (`material`, `fit`, `made in`) and KRACHT specs (`eiwit per portie`, `smaak`, `dosering`) with **no schema-specific code** — two schemas, two languages, one renderer.
- [ ] `no-match` looks designed, not apologetic. A reviewer should stop and read it.
- [ ] Every block survives a 40-character unbroken word and a 3-line title at 375px.
- [ ] `labelCase: upper-tracked` visibly changes label treatment across all 7.
- [ ] Out-of-stock, sale price, and missing image all render deliberately.

- [ ] **Owns benchmark H2 (`brand-divergence`) — the most important number in the project.**

**QA (independent).** `bun bench brand-divergence` renders the gallery (all 7 blocks × 2 brands), screenshots at 375px, desaturates, and asserts perceptual distance between the two brand columns is **above** a pinned floor. Pin the floor once, from the first side-by-side that genuinely looks right, and only ever ratchet it up — a threshold tuned down to make a run pass is a lie. [BENCHMARKS §4.4]

**Not in scope.** `product-compare` may ship as a stub if time is short (cut candidate #1).

---

## T6 — Platform API + snippet delivery
`apps/platform`.

**Scope.** `GET /v1/config/:shopKey` → `{tokens, voice, catalog}` with permissive CORS.
`GET /v1/agent.js` → the IIFE with correct caching headers. Config persisted in a JSON file or
KV — **no database**.

**DoD**
- [ ] Fetched **cross-origin** from both storefronts (different `*.vercel.app` origins) with no CORS error in console.
- [ ] Unknown `shopKey` returns a safe default config, not a 500 — the widget must never break a merchant's page.
- [ ] `agent.js` is one file, no source map in prod, gzipped size recorded in DECISIONS.md.
- [ ] **Owns benchmark H6 (`budget`)** — gzip size and config-fetch-to-first-paint, both under a pinned cap.

**QA (independent).** `curl -H "Origin: https://velde.example" .../v1/config/velde -i` → correct `Access-Control-Allow-Origin`. Request `/v1/config/nonsense` → 200 + defaults.

**Not in scope.** Auth, rate limiting, multi-tenant permissions.

---

## T7 — Configuration page
`apps/platform`. **The highest-scoring surface after the agent. Do not start it tired.**

**Scope.** The layered flow from PRINCIPLES §9:
1. Paste store URL → extraction (T8) runs.
2. "Here's what we found" — review screen, everything editable, nothing assumed correct.
3. Controls left, **live preview right: a real iframe of the storefront with a real shadow root inside it.** Every control mutates the preview instantly.
4. Natural-language refinement field ("warmer, less rounded, more compact") → visible token deltas on the left. Reuses T4's phrase→predicate parser; a fixed vocabulary, no LLM.
5. Copy snippet + a "waiting for first load / detected ✓" verification state.
Undo and reset-to-detected throughout.

**DoD**
- [ ] A non-technical merchant can go URL → snippet **without typing a single hex code**.
- [ ] A merchant *with* a hex code and a font name can override everything the extractor guessed.
- [ ] The NL field moves at least 4 distinct token groups and the change is *visible in the preview*, not just in a JSON blob.
- [ ] No configuration reachable through this UI can render an illegible or broken widget. Try to break it deliberately.
- [ ] Undo works on every control including the NL field.
- [ ] The config page itself is Maximal-branded — it is our product, not an unstyled admin.

**QA (independent).** Fresh browser, paste the VELDE URL, walk to a copied snippet without touching a hex field. Then set accent to `#FFFF00` and surface to `#FFFFFF` and confirm the preview is still readable. Then 375px — the config page needs to *work* small even though merchants use it on a desktop.

**Not in scope.** Saving multiple configs per account, versioning, publish/draft.

---

## T8 — Catalog ingest + brand extractor
Two things that share one crawl.

**Scope.**
*Ingest (build-time):* `sitemap.xml` → product URLs → parse JSON-LD → normalised `Product[]`
→ committed JSON snapshot per shop. Runs offline; nothing in the demo depends on it live.
*Extractor (runtime, server-side):* fetch a URL → extract palette (computed styles /
CSS custom props / og:image dominant colours), font stack, dominant border-radius, logo.
Returns a `MerchantTokens` draft. Must degrade to sensible defaults on any failure.

**DoD**
- [ ] Ingest produces 30+ normalised products per shop from the storefronts' **public JSON-LD only** — no private import, no shared module.
- [ ] Two different spec schemas normalise into the same `{label,value}[]` shape.
- [ ] Extractor returns *something usable* for a store we did not build. **Test it on 3 real webshops.**
- [ ] Every failure path (timeout, 403, no JSON-LD, Cloudflare) returns a default draft plus an honest "we couldn't read this — here's a starting point" state. Never a crash, never a spinner that never ends.
- [ ] Extractor results for `velde`/`kracht` are cached/seeded so the live demo never depends on a network round-trip.
- [ ] **T8 owns both paths firing on real data, and they are different paths.** `bun bench transcript packages/agent/src/brain/catalog.velde.json` passes: VELDE's three chips intersect to **empty**, and exactly one chip's removal yields a non-empty result. `catalog.kracht.json` passes the **opposite** assertion: KRACHT's opening message intersects to a **non-empty** set of 2–4 products, so the Dutch demo has a genuine happy path. Fix the **catalog**, never the brain and never the opening message.

  **Why they differ.** The brief says *"take them from there to the point where they can confidently act on a product"* and only then *"somewhere in the flow, show us at least one moment where things do not go smoothly."* An agent whose first answer on every brand is "nothing matches" never demonstrates the thing it is for, and reads as a broken retriever rather than designed recovery. One brand must complete the journey. The obstacle sits on **VELDE**, in English — the graded four seconds belong in the language we can fully control, while Dutch carries the storefront realism where the copy is short and formulaic.

**QA (independent).** `node tools/ingest.js https://velde.../sitemap.xml` prints 30+ normalised products. Point the extractor at 3 real stores and at `https://example.com` — four sane results, zero crashes.

**Not in scope.** Ingestion tiers 1 and 2 (spec them in DECISIONS.md, build neither).

---

## T9 — Hostile-page hardening + polish pass
**The task that proves the storefront freeze.**

**Scope.** Every bug found on a real storefront gets fixed **inside the widget**. Defensive
`all: initial` on the host element, explicit `font-size`/`line-height` (inherited properties
still cross the shadow boundary). Motion, focus rings, loading and empty states, reduced-motion.

**DoD**
- [ ] Widget is visually identical on the reset-heavy shop and the Tailwind-preflight shop.
- [ ] Launcher survives the announcement bar reflow, sits deliberately relative to the cookie banner, and does not collide with the sticky ATC bar at 375px.
- [ ] Opening the widget while the newsletter modal's focus trap is active still works (if that adversary was built).
- [ ] `prefers-reduced-motion` respected.
- [ ] **Owns benchmarks H4 (`viewport-375`) and H5 (`isolation`).** H5 mounts the widget on both hostile storefronts and asserts computed styles inside the shadow root are **identical across hosts** — a difference means the host leaked in, and the storefront freeze forbids fixing it at the source.
- [ ] **Zero commits to `apps/shop-*` after the script tag landed.** `git log` proves it.

**QA (independent).** `git log --oneline apps/shop-velde apps/shop-kracht` — no commits after the integration commit. Full flow on both shops at 375px and 1440px, keyboard only.

---

## T10 — DECISIONS.md, the log, and demo rehearsal

**Scope.** One page, honestly written, covering exactly the brief's six bullets:
merchant thinking / cross-brand approach / **what AI suggested that I overrode** / what I cut /
weakest part / what I'd do with another hour. Plus: the four-tier ingestion ladder, the
shadow-DOM `@font-face` trade-off, the crawl-goes-stale cost, and the Dawn licence finding.

`DECISIONS-LOG.md` is appended **during** the build, not reconstructed here — this task only
distils it.

**DoD**
- [ ] One page. Not two.
- [ ] The "weakest part" names something a reviewer would actually find. If it reads as a humblebrag, rewrite it.
- [ ] "What AI suggested that I overrode" cites ≥3 real entries from `DECISIONS-LOG.md` with dates.
- [ ] `bun bench` fully green, with its report committed.
- [ ] The SOFT-tier agent scorecard (BENCHMARKS §2) run over every landed task, and the two worst-scoring tasks re-read by a human with their own eyes.
- [ ] A 6-minute demo run twice end to end, on the deployed links, at 375px.
- [ ] One rehearsed live extension for the office session (see T11).

---

## T11 — Third brand (stretch)
**Scope.** A third `MerchantTokens` literal — deliberately ugly/hostile (pale yellow accent,
pill radius, generous scale, no personification). Ten lines, no new code.

**DoD**
- [ ] Adding a brand is one object in one file, and nothing else.
- [ ] The clamp keeps it legible without a single manual override.
- [ ] Can be typed live, on stage, in under 60 seconds.

**Why.** The office session says "extend the build live". This is the rehearsed answer to it.

---

## 3. Cut order, decided in advance

**The re-baseline puts every previous cut candidate back on the table.** At ~18h of planned work
in a 36h window, cutting `product-compare` to save 20 minutes of agent time is not a trade worth
making. The list below is now an *order of last resort*, not a plan:

1. `product-compare` block (T5)
2. Mind-change / second obstacle (T4)
3. Stretch adversaries — focus-trap modal, junk scripts, third-party bubble (T2)
4. `releashed.io` custom DNS (ship on `*.vercel.app`)
5. Third brand (T11)
6. NL refinement field (T7) — **last resort only.** It is a differentiator; losing it costs real points.

**Never cut:** the obstacle flow, the two-brand proof, 375px, DECISIONS.md.

**Back ON the plan, funded by the re-baseline** — in the order they earn points:
1. **Deploy for real** on `*.vercel.app`. The brief lists "a deployed link" first under What to
   send. **Custom DNS stays cut** — it is item 4 above, the brief explicitly exempts deployment,
   and using that same sentence as a licence in §0 #7 and ignoring it here would be selective.
2. **T11's third brand — promoted from stretch to required.** It is no longer a party trick: with
   VELDE at 16.5:1 and KRACHT at 14.7:1, the pale-yellow brand is the only place a reviewer can
   *see* the contrast clamp do its job. It also has to pass its own DoD, which currently fails —
   `Voice` demanded two objects and an avatar SVG per brand, so "one object, typed live in 60
   seconds" was false. `avatar` is now nullable and `tone` is an open string.
3. **Photography and copy quality on T2**, which is where a "looks real" judgment is actually made.
4. **Test the T8 extractor on three unaffiliated Dutch webshops**, not on Minimal's own clients.
   Same proof, and it avoids demoing a crawl of the reviewer's customers — one of whom (XXL
   Nutrition) already returned **403** to a datacenter fetch, which is the live evidence for §0 #3.

**Still one obstacle, not two.** The brief lists no-match and mind-change as alternatives and then
says *"pick the one you have something to say about."* Shipping both declines the question and
doubles the highest-risk copy surface. The no-match flow is the one we have something to say about.
