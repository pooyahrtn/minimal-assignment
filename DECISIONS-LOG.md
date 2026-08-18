# DECISIONS-LOG.md

Append-only, written in the session the decision is made [PRINCIPLES §12, AGENTS.md].
`DECISIONS.md` is distilled from this at the end — never reconstructed.

**Format** — one bullet per decision, grouped by topic so a topic can be read in one place:

`- **What we did** ← what was proposed · why (cite the number, clause or section) [session]`

Reversed later? Leave the row, prefix `~~⊗~~` and point at the row that replaced it. Sessions, in
order: `plan` · `law` · `review-1` · `T0` · `re-plan` · `review-2` · `descope`.

**Topics:** [Scope](#scope) · [Brands](#brands--storefronts) · [Tokens](#tokens--accessibility) ·
[Agent](#agent-behaviour) · [Contracts](#contracts--api) · [Testing](#testing--benchmarks) ·
[Tooling](#tooling--gates) · [Process](#process--planning)

---

## Scope

- **3 templates per storefront** (home+listing, PDP, cart drawer), catalog stays 30–40 products ← 6 pages each [PRINCIPLES §4] · about/shipping are never opened in a 10-min review; templates cost hours, catalog *data* costs minutes `[plan]`
- **3 adversary-table rows on purpose** (max-z cookie banner, global reset + Tailwind preflight, sticky 375px ATC bar); rest are stretch ← all 7 [PRINCIPLES §4] · those three are visible surviving; a working focus trap looks like nothing happened `[plan]`
- **Tier-0 crawl runs at build time, output committed as JSON**; live crawl kept only for the config page's brand extractor ← live runtime feature [PRINCIPLES §6] · same code path, same claim, but the demo never depends on a foreign server; Cloudflare blocking a datacenter IP mid-presentation is a coin flip `[plan]`
- **Preview is an iframe of the live storefront with a real shadow root**; screenshot only as foreign-URL fallback ← screenshot capture [PRINCIPLES §9.3] · headless Chrome on Vercel (`@sparticuz/chromium`, cold starts, 50MB) is hours of infra for a static image; the iframe is less work and live `[plan]`
- **3 Vercel projects on free `*.vercel.app`** ← custom DNS on `releashed.io` · still cross-origin so the CORS point survives; brief says deployment is optional and DNS scores nothing `[plan]` — reaffirmed over "slack funds custom DNS", which the re-plan listed as both cut #4 and back-on #1 quoting the same sentence `[review-2]`
- **One obstacle, not two** ← both obstacles funded by slack · brief says "pick the one you have something to say about"; shipping both declines the question `[review-2]`
- **Brand extractor demos three unaffiliated Dutch shops** ← a live crawl of Minimal's own clients · same impersonation logic that rejected cloning them, and one already 403'd us `[review-2]`
- **Localization descoped; Dutch *market* furniture kept** (iDEAL, Excl./Incl. VAT toggle, next-day cut-off badge, Kiyoh-style score /10) ← locale as a fourth brand axis · Pooya's call. The market signal lives in the furniture, not the language, and translation carried the one risk no gate can check — `TASKS.md` had a DoD box "nothing reads machine-translated". Restores PRINCIPLES §10, where i18n sits as not built `[descope]`

## Brands & storefronts

- **KLYFT structure from Next.js Commerce (MIT), CSS regenerated; MARENNE derived** ← start from Shopify Dawn's rendered CSS [PRINCIPLES §4] · Dawn's `LICENSE.md` is MIT **plus a field-of-use clause** — rights "may only be exercised to develop themes that integrate or interoperate with Shopify software or services… All other uses are strictly prohibited". A storefront on our own domain is not a Shopify theme `[plan]`
- **VELDE** (Amsterdam minimal apparel) and **KRACHT** (Dutch sports nutrition) ← MARENNE / KLYFT [PRINCIPLES §4] · the originals were `TAKE_HOME.md`'s own example sentence handed back to its author. Minimal AI (YC S25, Amsterdam) publishes a near-entirely Dutch client list — ETQ, XXL Nutrition, Girav, Boldking… VELDE is the ETQ archetype, KRACHT the XXL Nutrition one `[re-plan]`
- **Model the category and its conventions; names, logos, copy are ours** ← clone two real client storefronts · cloning is impersonation and a *weaker* demo: the claim is "adapts to a brand it has never seen", which a copy cannot show `[re-plan]`
- ~~⊗~~ **KRACHT ships Dutch, VELDE English** ← both English · superseded by *Localization descoped* under [Scope](#scope) `[re-plan → descope]`
- **VELDE accent is ink-blue `#2C3E5C`** ← near-black `#1C1B19` · black derives to ≈`textPrimary` on paper, so the config page's accent control — the merchant-facing demo of "accent drives the brand" — looked inert, and the focus ring on VELDE's own CTA computed **1.0:1**. Ink-blue: **10.32:1** on surface, flips `textOnAccent` to white at **10.77:1**, keeps the restrained read `[descope]`
- **Not accepted from review-2:** that a Dutch storefront is too risky to read. Titus Ex is a Dutch co-founder selling to Dutch merchants; he reads it. The real risk lived in the *agent's* Dutch register, not the furniture — which is why the obstacle moved off it `[review-2]`

## Tokens & accessibility

- **T11's pale-yellow brand is required, not stretch**; the "VELDE black is the clamp's hard case" comment in `brands.ts` deleted as false ← keeping it as a comment · measured: VELDE accent-on-surface **16.50:1**, KRACHT **14.65:1** — 3.6× the 4.5:1 bar. Old MARENNE sage was **3.23:1**; the brand swap quietly removed the only place the clamp visibly did anything `[review-2]`
- **`focusRing` derived against the surface it lands on, clamped ≥3:1 against both** ← derived from `accent` · measured **1.0:1** for VELDE's ring on its own accent-filled CTA. The 4.5:1 clamp covers text pairs only, so WCAG 1.4.11 fell through the gap. One line in T1, invisible until T9 if missed `[review-2]`

## Agent behaviour

- **Obstacle lands with the first agent slice, before `product-compare`** ← stage 3 [PRINCIPLES §11] · brief says the happy path is the easy part; empty-intersection + which-chip-to-drop is ~20 lines and it is the graded moment `[plan]`
- **The obstacle fires on KRACHT; VELDE resolves happily** ← both brands hit it `[review-2]`, then ← VELDE hits it `[descope]` · both-brands reads as a broken retriever and never demonstrates the product. Between the two, language was the tiebreaker and language is gone; KRACHT's three constraints (no sweeteners · lactose-free · under €30) collide most plausibly across a supplements catalog, so "nothing clears all three" reads as a finding, not a bug `[descope]`
- **The obstacle is fixed in the catalog** — never in the brain, never in the opening message; T8 owns a DoD box proving it fires on the **real** catalog `[review-1]`

## Contracts & API

- **`/v1/config` returns derived tokens** ← the merchant's raw tokens, widget derives · [ENGINEERING §2.1] the embed script is a binary we cannot recall; a clamp fix has to reach embedded scripts through the payload, not a redeploy nobody performs `[T0]`
- **`ConfigResponse` carries a flat server-owned `strings` deck** ← copy lives in the widget · same §2.1 rule: copy inside the binary can only be fixed by every merchant re-pasting their script tag. Added for localization, kept after it was cut — one language still benefits `[review-2, descope]`
- ~~⊗~~ **`ConfigResponse.locale`** · dropped with localization — a one-member union is speculation `[review-2 → descope]`
- **Invented in T0** (not specified by the task): `CssVarName` as a closed union, so `Record<CssVarName, string>` makes a missing or invented custom property a *type* error · `Product.image: string | null` rather than optional, so the missing-image case cannot be skipped · `no-match` carries `alternatives` (the chip row as it would read after the drop) beside `blocking` and `closest` · brand literals and voices in `packages/tokens/src/brands.ts` `[T0]`
- **`Voice.tone: string`, `avatar` nullable** ← `tone: 'warm' | 'clipped'`, avatar always present `[T0]` · the brief's bar is "many configurations, not just the one you designed it against" — a two-value union is that failure encoded in a type, and it made T11's "one object, typed live in 60 seconds" false `[review-2]`

## Testing & benchmarks

- **`bun test` for pure logic + Playwright for anything with a DOM, plus a benchmark suite (`BENCHMARKS.md`)** ← no framework, `assert`-based self-checks ((me)) · Pooya overrode, correctly: with 100% AI-written code and agents self-reporting success, hand-rolled asserts measure nothing consistently. Playwright was needed anyway for the greyscale cross-brand check and 375px screenshots `[law]`
- **Benchmarks assess the product AND the coding agents, one suite, one report** ← product only · per-task retry count measures the quality of `TASKS.md` as much as the agent — a task needing four attempts is usually under-specified `[law]`
- **The LLM judge stays SOFT — prints and ranks, never blocks** ← judge as a merge gate · an uncalibrated judge must not block, and calibrating one needs a human gold set (Cohen's κ vs a human–human baseline) that 36h does not buy `[law]`
- **Each HARD check is a DoD box on the task that would break it** — H1→T1, H2→T5, H3→T4, H4/H5→T9, H6→T6; only the `bun bench` runner is new work, in T0 ← a T12 owning the whole suite ((me)) · a late benchmark task is exactly the "failure discovered only at the end" shape the verifiability lens warned about `[review-1]`
- **T4's checker takes a catalog path argument and ships against a declared placeholder fixture** ← "replays both opening messages against both catalogs" [TASKS T4] · **the one surviving blocker of review-1.** The DoD was unsatisfiable in its own worktree — arithmetic on a catalog T2/T8 build in parallel. The agent would have invented a 6-product fixture tuned so the obstacle fires, gone green, and the graded moment would have evaporated when the real 35-product catalog turned out to intersect — found in T10 rehearsal, no catalog budget left `[review-1]`
- **H2 `brand-divergence` normalises ground luminance and adds a second assertion over computed `padding`/`radius`/`tracking`/`shadow`/`text-transform`** ← measures cross-brand structure as written ((me)) · desaturation removes hue, not luminance: greyscale grounds are VELDE **250** vs KRACHT **25**. A widget theming only `surface` and `accent` would have passed the #1 graded benchmark. Not introduced by the brand swap — the old pair was 241 vs 20, so H2 has been vacuous since it was written `[review-2]`
- **`bench/no-empty-test-run.sh` guards the test gate** ← `bun test` satisfies "test runner wired" ((me)) · `bun test` exits **0** having collected zero tests — the precise failure ENGINEERING §3.1 forbids. An agent writing no test would have gone green `[review-2]`

## Tooling & gates

- **`git config core.hooksPath .githooks` + a 4-line `sh` hook** (`bun run typecheck` && `biome check --staged`) ← husky [TASKS T0] · identical gate, one fewer dependency, no `prepare` script. Cost: local config, so a fresh clone runs one command `[T0]`
- **Biome 2.5.9** ← Biome 1.x · `noRestrictedImports` and `noExcessiveCognitiveComplexity` are nursery rules in v1 — a gate on a nursery rule can change under us. Both are stable in v2, which also has nested configs and `--staged` `[T0]`
- **`noExcessiveCognitiveComplexity` cap 15** ← the usual 40 ((me)) · 40 is what you land on retrofitting a cap onto years of existing code. A repo with zero lines starts tight; loosening is one config line `[law]`
- **Import boundary = nested `packages/agent/biome.json`** (`"root": false`, `extends: "//"`) with glob **patterns** blocking `**/apps/**`, `apps/*`, `@maximal/platform`, `@maximal/shop-*` ← a root rule listing `apps/*` · Biome's `paths` is exact-match only, so it would miss `../../../apps/platform/…` — the form an agent actually writes. Verified both forms error and that the same import outside `packages/agent` does not `[T0]`
- **Four T0 gate defects fixed** ← "T0 shipped exactly ENGINEERING §4, nothing invented" ((me)) · `organizeImports` was **on** by default though §4.9 rejects import sorting · `tsconfig` covered only `packages/*/src`, so the config page and the KRACHT storefront — the two highest-scoring surfaces — went untypechecked · `@maximal/shop-*/subpath` slipped the boundary globs · §4.2 claims `noExplicitAny` enforces "never cast with `as`", which it does not (`as Foo` and `as unknown as Foo` both passed clean) → `as`-cast grep added to the hook `[review-2]`
- **Playwright browser download deferred to T5** (`bunx playwright install chromium`); only `@playwright/test` in T0's `devDependencies` ← installed in T0 [TASKS T0] · nothing in T0–T4 opens a browser, and a ~150MB download inside the task that blocks eight others is the wrong place for it `[T0]`
- **Guardrails folded into T0** ← their own task after T0 ((me)) · ENGINEERING §4 requires guardrails before the first line of feature code and T0 is the only pre-code task; a separate task lands after agents have started `[review-1]`
- **No standalone code-standards or review-loop task** ← both proposed by reviewers · two refuters independently found `ENGINEERING.md` already owns them, including the hand-off list and the enforced import boundary. A standards *doc* every agent must read converts one ambiguity into eleven; a lint *config* does not — standards belong in `biome.json`, not prose `[review-1]`

## Process & planning

- **Replanned to ~29h with 6.5h real slack and a pre-committed cut order** ← 33h of a 36h window, "buffer will be consumed" [PRINCIPLES §11] · 100% utilisation on a solo build starves criterion #1 (how the screens feel), weighted above code structure `[plan]`
- **Estimates split into A (agent wall-clock) and R (human review), ~8h + ~10h** ← hours of hands-on work · T0 was estimated at 2.5h and landed in **6 minutes**; the plan was budgeted against a typing constraint that does not exist on a 100%-agent-written build. Asset and taste work does not compress — the freed budget moves onto the graded surface. Tracked in `PROGRESS.md` `[re-plan]`
- **Cut order demoted to last resort**; deployment, both obstacles, third brand and photography quality move back on plan ← §3 cut order as plan of record · cutting `product-compare` to save 20 min of agent time is not a trade worth making at ~18h planned against 36h `[re-plan]` — partially reversed the same session: one obstacle, no DNS (see [Scope](#scope)) `[review-2]`
- **`.claude/skills/pickup/SKILL.md`** — read contracts → plan → adversarial plan refutation → build (Sonnet for mechanical slices) → adversarial diff review → gates → status + estimate accuracy ← ad-hoc pickup (Pooya asked for a repeatable process) · encodes the review discipline ENGINEERING §3 and BENCHMARKS §2 demand but nothing enforced per task `[re-plan]`
- **Review-1: 24 findings across 6 lenses, 1 applied.** Each finding went to its own refuter agent, defaulting to "refuted" under uncertainty. Rejections cite line numbers and catch selective quoting — "chips cannot cross the config API" was refuted because chips never cross a wire at all. A high rejection rate on a plan doc is the point; the survivor is T4's fixture, see [Testing](#testing--benchmarks) `[review-1]`
