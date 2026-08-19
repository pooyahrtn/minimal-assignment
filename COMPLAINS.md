# COMPLAINS.md

The live failure log. Each task's close-out appends what went wrong [pickup skill, step 7].
The T1/T2/T3/T4/T8/T12 wave's 15 findings were addressed and deleted — they live in git at
`c26ec67:COMPLAINS.md` if the reasoning is ever needed. What survived them is the rules they
produced: `ENGINEERING §3.13`, the set-review and non-author sign-off boxes in `TASKS §2`, and
the task-text refutation in pickup step 2.

---

## Open

### 1. T6 cannot close its own DoD without breaking the storefront freeze

Both storefronts hardcode the platform origin in their one embed line —
`apps/shop-velde/render.ts:197` and `apps/shop-kracht/app/layout.tsx:140`, both
`http://localhost:4003/v1/agent.js`. T6's DoD requires the config fetched cross-origin from two
different `*.vercel.app` origins, which those lines cannot satisfy unchanged. `ENGINEERING §1.1`
and `PRINCIPLES §296` freeze storefront source after the `<script>` tag lands (`9aa8c0b`), "no
exceptions".

Nobody owns this: it is not a row in the `TASKS §1` graph, which is the recurrence of archived
item 2 (integration work is invisible to a graph built for parallelism) — this time against an
irreversible rule. **Needs a decision before T6 starts**, not during. Candidates: exempt the embed
line's origin in `§1.1` explicitly; or point both storefronts at the final hostname now and have
the local stub answer there.

### 2. `bench/run.ts:38` still grades a check by its case count

`ok: count > 0` proves a check *collected* cases, not that it *passed* them. `BENCHMARKS §4` rule 2
and `ENGINEERING §3.1` require a check that finds failures to fail. Every check is believed to
throw on failure, which is what makes the current form safe — that belief is unverified, and the
harness every other check depends on should not rest on it. Verify each check throws, or grade on
a failure count the check returns.

### 3. `PROGRESS.md` rows are written in retrospective batches

Pickup step 6 already prescribes appending the row at each task's own close. The last wave batched
five tasks' actuals into one commit written from memory (`040aaf4`). No fix needed beyond doing it
— flagged so the next batch is noticed rather than repeated.

---

## T10 (draft half) — 2026-08-19

**What changed:** `DECISIONS.md` written — the brief's named deliverable, one page covering its six
bullets plus the ingestion ladder, the shadow-DOM `@font-face` trade-off, the crawl-staleness cost
and the Dawn licence finding. The BENCHMARKS §2 SOFT tier went from a documented idea to a
registered `bun bench` check (`scorecard`) over ten landed tasks. Two false demo claims in
`COMPETITORS §6` narrowed to what the tree actually contains.

**Complaints**
- Plan review found the "DECISIONS-LOG has no dates" premise false (dates are one `git log -S` commit-date lookup away) and used it to declare DoD box 3 unsatisfiable — harm: a wrong write-up in the plan that had to be caught by a separate adversarial pass rather than by reading the log's own history before claiming it; risk: any future "X is unsatisfiable" claim in a plan gets trusted at face value and closes a box that was actually open, or vice versa.
- The same plan round also declared box 4 (`bun bench` green) uncloseable and box 8 already closed when two of its three claims fail against the tree — harm: 3 of 14 refuter findings were BLOCKERs against a plan for a documentation task, meaning the plan misjudged the state of the repo it was supposed to be summarising; risk: a plan that gets the tree's own state wrong wastes a full adversarial round every time, and a false "already closed" claim is the more dangerous failure mode since nothing downstream re-checks a box marked done.
- Four of the five first-chosen "what AI suggested that I overrode" entries didn't satisfy the brief's bullet at all — one ran backwards (a human-owned doc proposed it, an agent overrode), three were the AI overriding itself in `((me))` proposals rejected during agent review — harm: a full selection pass over the log was thrown out and redone after the refuter caught it, not before; risk: the brief's direction (AI suggests, human overrides) is easy to invert silently, and a demo built on the wrong four entries reads as dishonest on stage, which is exactly the failure mode this task exists to prevent.
- `DECISIONS.md` went through a full rewrite twice plus three word-trimming passes (1398 → 1238 → 1455 → 1421 → 1347 → 1313 → 1290 words) and never got under "one page" — harm: six editing passes spent, with word-level trims moving almost nothing because the content is structurally dense, only structural cuts moved the number, and box 1 is still open at close; risk: repeating word-trimming instead of structural cutting on a dense doc burns rounds without ever closing the box.
- DoD box 5 ("every landed task") and `BENCHMARKS §2` ("one row per task T0…T11") specify different row sets with nothing in either doc reconciling them — harm: had to be logged as an open, unresolved contradiction rather than closed, so the scorecard's row set is a judgment call with no doc backing it; risk: the next task that reads either source for "which tasks get scored" gets a different answer depending on which doc it opens first.
- DoD box 3's "with dates" contradicts `DECISIONS-LOG.md`'s own documented format (line 8: a `[session]` tag, explicitly no date field) — harm: citing entries "with dates" meant reconstructing dates via `git log -S` per entry rather than reading a field the log promises to carry; risk: any future task that needs dated citations from this log pays the same reconstruction cost, since the log's spec was never brought in line with how it's actually being cited.
- Closing box 4/5 required editing the shared `bench/checks.ts` to register the scorecard check, which is exactly the file `PROGRESS.md`'s own in-flight claim row asserted T10 would not touch — harm: the claim row was wrong the moment it was written, and the same file is simultaneously hot with the concurrent T5/T6 desks whose `budget.ts`/`divergence.ts` checks sat untracked and unregistered; risk: two sessions editing one shared registry file without coordination is a clobber or duplicate-registration waiting to happen, and the rule this exact scenario was supposed to prevent (`[T1348]`: "the main session owns every shared file") was not followed here.
- The tree stayed dirty with ~20 files belonging to two other live sessions for the entire task, `bench/report.md` was already dirty going in, a peer session wrote a new section into `DECISIONS.md` while T10 was mid-edit on it, and a peer commit (`770889b`) landed mid-task changing files T10 had already read — harm: every "read the tree, cite what's actually there" claim in this task was only as accurate as a moving target allowed, and the `DECISIONS.md` edit collision had to be reconciled by hand; risk: a docs task that depends on a stable snapshot of the repo cannot actually get one while other desks are live in the same working tree, and this will recur every time docs work is scheduled alongside build work instead of after it.
- The BENCHMARKS §2 scorecard is documented by BENCHMARKS §3 itself as uncalibrated and untrusted, yet closing box 5 required a 10-agent run costing 838k tokens, 302 tool calls and ~4.5 minutes to produce a full ranking across every task — harm: heavy spend on a signal the governing doc says not to trust, producing a ranked list nobody has time to re-read past the two worst-scoring rows it was scoped to; risk: this cost repeats every time the scorecard is regenerated, for a signal whose main defensible use was always the bottom two rows, not the full ranking.
- Boxes 6 and 7 (demo rehearsal on deployed links, rehearsed live extension) were structurally uncloseable before any T10 work started, since T15 (deploy), T7 (config page) and T11 (third brand) are all unbuilt — harm: two of the task's eight DoD boxes were dead on arrival, known from reading `TASKS.md` alone; risk: a DoD written with boxes that depend on unlanded sibling tasks will keep reporting a task as partially closed no matter how much work lands inside the task's actual scope, which misrepresents progress on the task itself.
- `DECISIONS-LOG.md`'s header list of sessions "in order" had gone eight tags stale before this task reconciled it against a grep of the file's own citations — harm: a bookkeeping debt silently accumulated across roughly eight prior sessions before anything caught it, and the catch happened only because T10 needed to cite the log and noticed its own session tag wasn't declared; risk: an append-only log whose index silently drifts from its own content will keep drifting until the next task happens to need the index for something, which is not a reliable trigger.

---

## T11 — 2026-08-19

**What changed:** Added HELDER, a third `MerchantTokens`/`Voice` pair with its surface (not accent) tinted pale yellow so the AA contrast clamp visibly tints muted text instead of falling back to grey, plus registration across `brands.ts`, `index.ts`, `tools/build-config.ts`, `packages/agent/src/fallback.ts` and `shell.test.ts`.

**Complaints**
- The task text's own justification for HELDER ("the one place the clamp is visible") specified a pale-yellow **accent**, but `derive()` emits `accent` verbatim and the clamp reads only `surface`/`surfaceRaised`/`surfaceSunken` — the brand as written would have demonstrated nothing — harm: only caught because the plan was sent to an adversarial reviewer before a line of `brands.ts` was written; the task's central premise was false as stated; risk: a task text whose "why" rests on an unchecked claim about what a downstream function reads will keep costing a full plan-refutation round to catch, and skipping that round on a task this small (10 lines, no new code) would have shipped a demo beat that proves nothing.
- 2 of 3 DoD boxes were unsatisfiable as written and had to be reported rather than closed: box 1 ("one object in one file") is actually two hand-edited objects (`MerchantTokens` + `Voice`) across `brands.ts`, `index.ts`, `build-config.ts` plus two generated files; box 3 ("typed live on stage in under 60s") has no render surface because both storefronts hardcode `data-shop`, `bench/checks/budget.ts:37` hardcodes `data-shop="velde"`, H2's brand list is a fixed pair, and `apps/platform/server.ts` enumerates `config/*.json` once at startup so a new file is invisible without a restart — none of which closes until T7 — harm: two-thirds of this task's own DoD was unachievable by construction, discovered only mid-build rather than during wave planning, even though §1.1 already orders T11 before T7 for exactly this reason; risk: a DoD with boxes gated on unlanded sibling tasks keeps reading as "task failed" no matter what ships, and that ordering dependency is nowhere machine-checked, so it reproduces for the next task shaped like this one.
- The pill-radius defect (`RADIUS_MAP.pill` mapping every step to 9999px, clipping the merchant's own name to "elder" at 1440px) was found, filed in the decisions log, and shipped anyway — described as "T1's contract change" by citing `derive.test.ts:103-106`, a test that was encoding the same bug rather than a real frozen contract — harm: a self-identified, demo-breaking visual defect (the brand's name unreadable on stage) shipped past the author's own gates and required a second adversarial diff-review round to force the fix in the same session, doubling the diff-review cost for a defect that was already known and already named before that review even started; risk: "found it, filed it, shipped around it, mislabeled the reason" is a specific rationalization pattern that passed the author's own check and would recur on any task touching a value `packages/tokens` tests happen to assert as current behavior.
- A fabricated contrast ratio ("4.44:1 on this surface") shipped in a `derive.test.ts` comment, in the one file whose entire job is measurement — the real value, found by fault-injecting the regression during review, was `#606060` at 5.423/4.506/6.289, and every ratio assertion in the file stayed green against it; only an unrelated hue-tint assertion would have caught the regression — harm: a false empirical claim sat in the AA-contrast test suite until an adversarial reviewer happened to inject the exact regression it claimed to guard against; nothing in the author's own gates checks comment prose against reality; risk: this is the exact failure mode this session's own decisions log names `ENGINEERING §3` as existing to prevent, and it shipped anyway — a fabricated number in test rationale is caught only when a reviewer chooses to fault-inject that specific line, which is not reliable.
- HELDER's first draft shipped with typography byte-identical to `DEFAULT_BRAND`'s fallback font block and a `clarify` string near-duplicating its own greeting, on the one brand whose stated job is looking deliberately unlike the "not configured" fallback — harm: shipped past the author's own review and had to be caught and corrected by the adversarial reviewer; risk: no DoD box tests "distinct from the fallback" directly, so the same fast-copy shortcut reproduces on the next brand added the same way.
- HELDER's catalog is byte-identical to VELDE's, including every product URL pointing at VELDE's `localhost:4001` origin — the third "brand" is a reskin serving another merchant's products, not a distinct merchant — and this is disclosed only as prose in `DECISIONS-LOG.md`, not in anything a demo rehearsal would surface — harm: clicking any HELDER product opens VELDE's shop under HELDER's name, and no DoD box or gate checks catalog distinctness; risk: a live "extend the build" demo beat that follows a product link exposes this on stage, and the only warning against it is a log entry a presenter would have to already know to read.
- The two adversarial rounds (plan refutation + diff review) took a task `TASKS.md` scoped as "ten lines, no new code" and estimated at 10 minutes of agent time to ~55 minutes over 2 rounds, each round separately costing roughly 100k tokens and 6-10 minutes — harm: review scaffolding alone cost roughly 5x the entire task estimate, for a task PROGRESS.md's own standing lesson 5 already flagged this class of overhead against before this task added a worse ratio; risk: applying the same fixed two-round process regardless of task size means the smallest, most mechanical tasks pay the highest overhead-to-content ratio, with nothing in the process scaling review depth to the task's own estimate.
