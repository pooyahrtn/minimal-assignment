# COMPLAINS.md

Failure log for the session that delivered T1, T2, T3, T4, T8, T12 (~22 commits, `e0db35d`
"Plan refutation survivors" through `6dcb6f1` "T12, widget half"). Written from the evidence —
`git log --format=full`, `DECISIONS-LOG.md`, `PROGRESS.md`, `TASKS.md`, `PRINCIPLES.md`,
`ENGINEERING.md`, `BENCHMARKS.md`, `.claude/skills/pickup/SKILL.md` — not from a memory of the
session, because there isn't one. Ranked most expensive first. A short section at the end covers
what the process caught, so the checks that worked don't get thrown out along with this list.

---

## 1. The first photography set was reported good, and it was not

**What happened.** The first VELDE photography pass reviewed 3,506 candidates, filtered mechanically,
and kept 32 images, each judged individually against a checklist (border uniformity, palette,
saturation, aspect). It was reported done. A contact sheet of all 32 shown as a grid — not one at a
time — showed the set for what it was: "green grass, orange wood, red carpet, a bedspread, faces, a
visible Carhartt logo, a hot-pink turtleneck in a monochrome store" (`16d5c90`). Two observers reached
that independently. The whole set was discarded and rebuilt with the review method inverted: filter
mechanically first, judge as a grid second (`16d5c90`, then re-run again in `6507f6b` for coverage,
then trimmed a third time in `65b93af`).

**How it was found.** Not by any check — by looking at the images together instead of one at a time.
Nothing in the plan or DoD required a grid review; per-item review was what got run first, and it
missed a property that only exists at the set level.

**What it cost.** `PROGRESS.md` line 19: "T2 photography ... **88m over 2 full attempts** ... The
largest single line in the session and the one no estimate existed for." This is the single biggest
line item in the whole session, and it was entirely rework: the first set was thrown away, not
patched. KRACHT's packshots had the identical failure mode one layer down — "every one of the 34
packshots was the identical tub" (`6507f6b`) — caught the same way, by looking at the set, not the
item.

**The check that would have caught it earlier.** A per-item checklist cannot see a set-level
property (variety, repetition, coherence as a grid). The fix is procedural, and the second attempt
already encodes it: judge deliverables that are sets as a set, not as their items, before calling
them done. Concretely, "open the contact sheet, not the folder" belongs in the QA box for any task
that ships more than one of something.

---

## 2. The task graph had no line item for the work between the tasks

**What happened.** `TASKS.md` §1 schedules T1, T2, T3, T4, T8 as "truly parallel," which was true and
useful for the build itself. What it does not schedule is the seam: once all five land, the widget
still cannot hold a conversation, because nothing owns joining T3's shell to T4's brain. That work
happened anyway — `fff0d0b` "Wire the brain to the shell over a real cross-origin config endpoint" —
and a second unscheduled pass, `ffdec39` "Last storefront pass before the freeze," did the
merchandising, layout and photo-mapping fixes that had to land before the `<script>` tag froze the
storefronts. Neither is a task in `TASKS.md`.

**How it was found.** `PROGRESS.md` lesson 9, written after the fact: "Integration work is invisible
to a task graph that was built for parallelism... after they land the widget still cannot hold a
conversation, because nothing owns the seam. That was 15 minutes of work and zero minutes of plan."
Lesson 6 makes the same point about the fix pass: "the two largest lines in this session — photography
at 88 minutes and the pre-freeze storefront fix pass at 32 — had no estimate at all, because neither
is a task in TASKS.md."

**What it cost.** 15m (wire) + 32m (fix pass) directly, per `PROGRESS.md` rows 21–22 — small in
isolation, but both were also schedule-critical: the wire step was the only thing standing between
five "done" tasks and a working demo, and the fix pass was the *last* point at which the storefronts
could be touched at all before `ENGINEERING §1.1`'s freeze made every remaining bug a widget bug.
Both had to be discovered as necessary rather than planned as necessary, which is the more expensive
way to find out.

**The change that would prevent it.** The task graph needs a category, not just a row: after any wave
of "truly parallel" tasks that were deliberately built apart, the graph should name the integration
step as its own node with its own estimate — even a rough one — rather than leaving it to be
discovered when someone notices the widget still doesn't talk.

---

## 3. T1's contrast clamp was green on 17 of its own tests and failed on the bytes it shipped

**What happened.** `f3a00b4` implements the AA contrast clamp and reports 17 passing tests. An
independently written check found two real defects the implementer's own tests did not catch:
(1) contrast was measured on unrounded float RGB — a candidate cleared 4.5182:1 in float, then
candidate and background rounded to hex independently and the shipped pair measured **4.4807:1**, a
real AA failure in the actual bytes; (2) at mid-luminance surfaces the fixed ±0.06 lightness nudge
made the constraint unsatisfiable — "brute-forced ceiling 4.478:1" — so the clamp was chasing a target
that did not exist for that input. Both are in `f3a00b4` and restated in `DECISIONS-LOG.md`, Tokens &
accessibility: "A pass in float space, a fail in the bytes."

**How it was found.** Not by the implementer's own suite — by H1, the contrast benchmark, written
independently by a separate agent (`7b7256d`) and required by `ENGINEERING §3.2` ("green" means the
gate run the gate-exact way, not the implementer's local tests).

**What it cost.** Contained here — this is exactly what the split between implementer and independent
checker is for (`PROGRESS.md` lesson 8) — but the shape of the defect is the expensive part: 17 green
tests is a false "done," and the actual AA guarantee (a legal requirement in shipped UI, not a style
preference) would have shipped broken had the independent check not existed.

**The check that would have caught it earlier.** Test the thing that ships, not the thing that's
computed. A contrast test that measures float RGB is testing math the pipeline doesn't actually run —
the fix (round to the integer byte at the point of conversion, per the decision log) is now in place,
but the general lesson is: any test of a value that later gets serialized/rounded/re-parsed should
assert against the serialized form, not the intermediate one.

---

## 4. A DoD box asked for something mathematically impossible

**What happened.** `TASKS.md` line 161, T1's DoD box 2: *"`focusRing` clears 3:1 (WCAG 1.4.11)
against both `accent` and `surface`"* — stated as an unconditional requirement, no exception clause.
WCAG contrast is a pure function of relative luminance, so this is a complete, checkable search space
— and the search says the box cannot be closed in general: measured over 1,500 chromatic pairs, **207
(14%) admit no colour in the sRGB gamut that clears 3:1 against both grounds simultaneously**
(`DECISIONS-LOG.md`, Tokens & accessibility: *"TASKS T1 DoD box 2 asks for something impossible, and
we ship the best-available ring plus a named upgrade path"*).

**How it was found.** The T1 agent did the exhaustive search implied by "WCAG contrast depends only
on relative luminance, so scanning luminance is a complete search," rather than trying and failing to
satisfy the box as written, and named the finding instead of quietly shipping a ring that fails 14% of
configs. The real fix — a two-tone ring, each contour clearing 3:1 against only the thing it touches —
needs a new token (`--mx-focus-ring-offset`) and was named and deliberately not built.

**What it cost.** Nothing this session, because it was caught immediately and documented rather than
chased. It would have cost real time if an agent had instead tried to satisfy the box literally: no
amount of clamp tuning closes a 14%-infeasible constraint, and a less careful pass could easily have
burned a round or two "fixing" a bug that was actually in the spec.

**The change that would prevent it.** A DoD box making an absolute claim about a derived quantity
(clears X against Y and Z) should be checked for satisfiability *before* it's written into the task,
the same way the box was checked for satisfiability after the fact. This is a cheap check — the same
exhaustive-luminance-scan argument used to verify the finding could have been run against the
proposed box at planning time.

---

## 5. A DoD grep contradicted itself

**What happened.** `TASKS.md` line 254, T4's DoD: *"zero brand-specific branches. `grep -i
"velde|kracht"` in `brain/` → no hits."* Two lines later, line 255: the checker's default catalog
path is `packages/agent/src/brain/catalog.{velde,kracht}.json` — filenames that live inside the exact
directory the grep scans, and that contain the exact strings the grep forbids. The box is
self-contradicting the moment the fixture is replaced by the named files: it can only pass by luck
(before the catalog files exist) or by being silently rescoped.

**How it was found.** `DECISIONS-LOG.md`, Testing & benchmarks: *"T4's brand-name proof is scoped to
source: `grep -ri "velde\|kracht" --include='*.ts'` ← an unscoped `grep -ri` over `brain/` · TASKS
T4's own QA box puts `catalog.{velde,kracht}.json` inside `brain/`, so the unscoped form contradicts
itself the moment T8 lands."* Found while implementing, not by a later reviewer — but only because the
implementing agent happened to notice the collision; nothing forced the check.

**What it cost.** One decision, logged, no rework — the grep was scoped to `*.ts` before it could ever
fail. But it is the kind of contradiction that a later agent, working faster or less carefully, would
plausibly have "fixed" by deleting the catalog filenames' brand names instead of rescoping the grep —
which would have cost the readability the filenames exist for.

**The change that would prevent it.** Any DoD proof-by-grep needs to be run once, by hand, against the
state the task will actually be in when *all* its own DoD boxes are satisfied — not just the state it
starts in. This one fails that test on inspection: the box that names the default catalog paths and
the box that forbids their own substrings are two lines apart in the same file.

---

## 6. Storefronts marked done still had defects only found by looking at the screen later

**What happened.** Several, all after the storefronts had already passed their own DoD:
- T2 VELDE's own hand-off reported four layout bugs found by opening the page. `PROGRESS.md` line 17:
  *"Found 4 layout bugs by opening the page. I found 2 more it missed."* — two more, found by someone
  other than the agent that built and reviewed it.
- `ffdec39` (the last storefront pass, run because the freeze was imminent) found two more layout
  defects by looking at the rendered screens rather than the code: VELDE's hero used a
  `padding: X 0 Y` shorthand that zeroed horizontal padding and beat `.page-width` on cascade order,
  putting the headline flush against the viewport edge on the first screen anyone sees; KRACHT's deal
  card sized its packshot `h-48 w-full`, so `object-fit: cover` exposed white side bars around the
  most prominent product on the page. Both had been sitting in a storefront already treated as ready
  for the freeze.
- The same pass found VELDE's photo assignment cycling by index with nothing tying a product's stated
  colour to its image — "a jacket labelled Black rendered olive."
- `3b956bd` (T12's storefront half) found, on KRACHT's PDP at 375px, that the fixed buy bar covered
  the footer's registration line — "reproducible every run," on a template that had already shipped
  as T2 KRACHT. VELDE had solved the same problem; KRACHT had not, and nothing had checked.

**How it was found.** In every case, by opening the actual page and looking, sometimes by a different
agent than the one that built or first reviewed the surface — never by the storefront's own DoD run.

**What it cost.** Each individual fix was small (one-line CSS changes), but the pattern is the finding:
storefronts were repeatedly reported ready, and repeatedly turned out not to be, right up until the
last legal moment to fix them before the freeze made every future fix a widget workaround instead of a
storefront fix. Had the KRACHT buy-bar bug surfaced one commit later — after `9aa8c0b` froze the
storefronts — it would have had to be worked around in the widget rather than fixed at the source.

**The change that would prevent it.** `ENGINEERING §3.6` already requires opening the real screen at
375px before calling UI work done — the gap isn't the rule, it's that it wasn't run exhaustively
enough, or by someone other than the author, before the *first* "done." A second pair of eyes on every
storefront screen, at the point of first landing rather than salvaged in a last-minute pass before an
irreversible freeze, is the difference between these being one-line fixes and being permanent widget
workarounds.

---

## 7. A stale build artifact shipped past the point the freeze was "verified by driving it"

**What happened.** `9aa8c0b` ("The script tag lands: both storefronts are now frozen") is explicitly
verified by driving the widget on the real KRACHT PDP, not by reading code — and it passes. One commit
later, `6dcb6f1` (T12's widget suite) found that `packages/agent/dist/agent.js` predated `fsm.ts`'s
cheapest-first `.sort()` on the recommend path: the source had the fix, the shipped bundle did not, so
a chip-drop in the graded flow rendered products in catalog order (49, 32.95, 38.95) instead of price
order — the exact ordering bug `9aa8c0b` itself had fixed one commit earlier ("the agent quoted 'the
closest is €32.95' and then listed €49 first").

**How it was found.** Not by the "verified by driving it" pass at freeze time — that pass didn't
happen to exercise a chip-drop with more than one candidate at a price that would expose ordering. It
was found because T12 asserted product order from the catalog rather than trusting the screen, and the
assertion failed against the built bundle even though the source and the regenerated config were
byte-identical (`git status` clean) — i.e., this was drift in a gitignored build artifact, not a
source bug.

**What it cost.** Nothing shipped externally, since it was caught before any deployment step in this
session — but it is exactly the kind of thing a live demo would show and nothing was gating: `dist/`
is gitignored, so no diff review would ever have surfaced it, and manual "drive it" verification is
only as good as the specific paths it happens to exercise.

**The change that would prevent it.** `dist/` freshness needs a mechanical check (a build-hash or
build-timestamp assertion, or simply always rebuilding before any verification pass that touches the
bundle), not reliance on a human remembering to rebuild before manually testing a code path that
changed. "Verified by driving it" is only as strong as the artifact being driven.

---

## 8. The same gate gap ("this directory isn't typechecked") was found and fixed three separate times

**What happened.** The identical defect shape recurred three times across the session, each time
found reactively rather than by a rule that would have prevented the next instance:
1. T0's original review round found `tsconfig` covered only `packages/*/src` — the config page and
   the KRACHT storefront, the two highest-scoring surfaces, went untypechecked (`DECISIONS-LOG.md`,
   Tooling & gates, "Four T0 gate defects fixed").
2. The plan-refutation round for the T1/T2/T3/T4/T8 wave separately found `jsx` was never set in
   `tsconfig.base.json` even after `apps/**/*.tsx` was added to `include` — meaning KRACHT's first
   `.tsx` file would have failed `tsc --noEmit`, which is line 2 of the pre-commit hook, blocking
   every commit in that wave (`e0db35d`).
3. `72ee694` ("Root typecheck now covers tools/"): `tools/ingest.ts`, `build-config.ts` and
   `serve-platform.ts` were all outside the typecheck include list — found by the T8 agent while
   working there, not by a gate.

**How it was found.** Three different ways, three different times, by three different people/agents —
never by a systematic check of "does every top-level source directory appear in the typecheck
include."

**What it cost.** Each instance was cheap once found (a one-line `include` fix), but the second one
specifically had wave-blocking severity if it had shipped — per its own commit message, it would have
failed the pre-commit hook on the very first `.tsx` file, blocking every commit in that wave. Three
near-misses of the same shape is a signal the underlying gate is not being verified the way
`ENGINEERING §4`'s own philosophy demands ("a guardrail nobody has seen fail is not installed" — T0's
own QA box, line 147).

**The change that would prevent it.** Turn the specific fix into the general rule: `tsconfig.json`'s
`include` should assert coverage of every top-level directory under `apps/`, `packages/`, and `tools/`
(e.g., a startup assertion, or a `bun run typecheck` variant that fails if a `.ts`/`.tsx` file exists
outside every configured `include` glob), rather than adding directories to the list one discovery at
a time.

---

## 9. Two agents independently made, and had to unmake, the same mistake

**What happened.** T2's DoD box 1 is proved by `grep -ri "maximal|widget|agent" apps/shop-*` — and
`robots.txt`'s standard `User-agent: *` line contains the substring `agent`. The VELDE storefront agent
deleted its `robots.txt` to make the grep pass clean; this was caught and reversed, with the grep
scoped to exclude that one named file instead (`0cb2fea`, `DECISIONS-LOG.md` Brands & storefronts). The
KRACHT storefront agent, working in parallel, made the identical deletion for the identical reason and
had to be caught and reversed the identical way (`15b7c8a`: *"robots.txt restored here too, for the
same reason as VELDE: both agents deleted theirs because the crawler directive inside trips T2's proof
grep"*).

**How it was found.** By review, both times — not by either agent recognizing the pattern from the
other's work, because the two desks were running in parallel with no shared state at the time the
first agent made (and had reversed) the same call.

**What it cost.** Two review-and-revert cycles for one decision, because the resolution reached on one
desk wasn't visible to the concurrently running desk that hit the identical fork in the road.
`DECISIONS-LOG.md` is the mechanism for exactly this, but it's written to be read *before* a decision,
and two agents starting the same class of work at the same time will not have read each other's
same-session entries.

**The change that would prevent it.** For parallel desks working structurally identical tasks (two
storefronts, same DoD template), a decision that resolves a contradiction in the shared task text
(here, T2's proof grep vs. a real-store artifact) should be pushed to both desks — or fixed once in the
task text/gate itself — rather than left to be independently rediscovered per desk.

---

## 10. The guardrails shipped their own bugs

**What happened.** Two of the mechanisms built specifically to catch defects had defects of their own:
- `bench/run.ts:38` computes `ok: count > 0` for every check. `BENCHMARKS §4` rule 2 and
  `ENGINEERING §3.1` both require that a check finding failures must fail, not just report a nonzero
  count — but as originally structured (per `DECISIONS-LOG.md`, Testing & benchmarks: *"A benchmark
  check fails by throwing; returning a count is not a result... a check that examines 200 pairs and
  finds 200 failures reports pass"*), a check that returned its failure count as data rather than
  throwing would have been silently certified as passing. Caught before either H1 or H3 shipped, but
  it's a bug in the harness that every subsequent check depends on.
- `.githooks/pre-commit`'s `as`-cast grep piped through `xargs`, and `xargs` exits 0 when it receives
  no input — so the check as first written rejected *every* commit that staged no TypeScript at all,
  including its own fix (`PROGRESS.md` lesson 4: *"its first live run blocked its own fix"*). Found by
  running it three ways (blocking case, allowed case, no-TS case), not by reading it.

**What it cost.** Both were caught before they cost a real defect getting through, but both are
guardrails that would have failed exactly opposite to their purpose — one silently passing real
failures, one blocking unrelated commits — and both were found by exercising them, not by inspection.

**The change that would prevent it.** `PROGRESS.md` lesson 4 already states the general rule
correctly: *"reproduce, then fix"* — a gate needs to be run against a case that should fail and a case
that should pass before it's trusted, the same discipline `ENGINEERING §3.4` demands of ordinary bug
fixes. Neither of these was caught by that discipline being applied to the gate itself until after it
was already in place; do it before the gate goes live, not after the first commit exercises it.

---

## 11. T0 — "guardrails, nothing invented" — shipped four gate defects

**What happened.** T0's own DoD claimed exactly `ENGINEERING §4`, nothing invented. The adversarial
review round for T0 found four real defects in what had shipped as done: `organizeImports` was on by
default though `ENGINEERING §4.9` explicitly rejects import-sorting assist; the root `tsconfig`
covered only `packages/*/src`, leaving the two highest-scoring surfaces (config page, KRACHT
storefront) untypechecked; the import-boundary glob missed `@maximal/shop-*/subpath`-style imports;
and `ENGINEERING §4.2`'s claim that `noExplicitAny` enforces "never cast with `as`" was false — both
`as Foo` and `as unknown as Foo` passed clean, which is what the `as`-cast grep in item 10 above exists
to close (`DECISIONS-LOG.md`, Tooling & gates).

**How it was found.** Not by T0's own QA box, which is explicitly designed to "deliberately break each
guardrail one at a time" (`TASKS.md` line 145–147) — by a separate adversarial review round.

**What it cost.** `PROGRESS.md` row 9: 6 retries to green on T0 total, "four [of which] were real
defects in work reported as done — which is the case for the review round existing at all" (lesson 3).
T0 blocks everything else, so a defect here has the widest possible blast radius; all four were caught
before anything was built against the broken guardrail.

**The change that would prevent it.** None beyond what already exists — this is the review round
working as designed, and it's listed here because "guardrails, nothing invented" as a self-report was
wrong four times over, which is exactly the kind of self-report the independent round exists to check.
Filed as a defect-that-shipped-in-work-reported-as-done, not as a process gap.

---

## 12. Process order was deliberately violated: T1 and T4 were built before the plan review returned

**What happened.** `.claude/skills/pickup/SKILL.md` step 2 requires the plan be adversarially refuted
*before* step 3 (build). `DECISIONS-LOG.md`, Process & planning: *"T1 and T4 were launched before the
plan review returned, against DoD text read directly rather than summarised ← waiting for the
refutation · both are pure logic with no contested surface, the review's findings against them arrived
as corrections mid-flight, and the alternative was idling two desks for 7 minutes while Pooya slept.
Logged because it is a deliberate departure from the pickup step order `[T1348]`."*

**What it cost.** Nothing measurable this time — both tasks turned out to have no contested surface,
and the review's findings were absorbed as mid-flight corrections rather than rework. It is included
here because it is a real, admitted departure from the prescribed step order, not because it cost
anything.

**The change that would prevent it.** None needed on this evidence — the departure was judged and
logged in real time, which is the process working as intended even while being bent. Worth watching
for whether "no contested surface" turns out to be a judgment call that's wrong on some future task
under the same time pressure.

---

## 13. PROGRESS.md was updated in one retroactive batch, not per task as the process prescribes

**What happened.** `.claude/skills/pickup/SKILL.md` step 6 says to append a `PROGRESS.md` row and
report status "always," described as part of each task's close-out. The actual commit history shows
one batched commit, `040aaf4` ("PROGRESS: rows and re-baseline for T1/T2/T3/T4/T8"), landing after T1,
T3, T2-VELDE, H1, T2-KRACHT, T8, the brain-shell wire, and part of the photography pass were already
committed — i.e., the estimate-vs-actual tracking for five tasks was written up after the fact, in one
pass, rather than at each task's own close.

**What it cost.** Nothing detectable this session — the eventual rows are detailed and the standing
lessons they produced (`PROGRESS.md` lessons 6–9) are substantive. Flagged as a risk rather than a
proven cost: writing up "actual" timing and retries-to-green from memory, after several more tasks have
already happened, is exactly the kind of reconstruction `AGENTS.md` warns against for decisions
("a reconstructed answer sounds reconstructed") — the same risk applies to actuals, even though this
time nothing observably drifted.

**The change that would prevent it.** Append the `PROGRESS.md` row at the actual close of each task,
before starting the next one, rather than batching several tasks' worth of retrospective numbers into
one commit near the end of a wave.

---

## 14. Catalog data authored by one agent had errors only a different agent, reading it critically, caught

**What happened.** Two instances in the same session:
- KRACHT's `clear-whey-500g-mango` was ingested at €27.95 — below every comparable lactose-free SKU
  and, per `DECISIONS-LOG.md` Brands & storefronts, creating a second spurious rescue path in T8's DoD
  box 6 (dropping either `no-sweeteners` or `price-max` independently rescued the empty intersection,
  where the DoD requires exactly one rescuer). Found and fixed in T8 (`19f0dc0`), not by the ingest
  pipeline itself — ingest faithfully reproduced a genuine catalog pricing error.
- Every one of KRACHT's 34 generated packshot labels read "WHEY ISOLATE 900 g 30 servings" regardless
  of the actual product — concentrate, vegan, casein and clear-whey lines all carried the same label.
  `DECISIONS-LOG.md`, Brands & storefronts: *"That contradiction was caught by the storefront agent
  reading its own catalog against the images, not by the agent that made them."*

**What it cost.** Both were fixed before shipping, at the cost of one extra read-through each — cheap
here, but both are instances of the same shape as item 1 and item 8: the agent producing an artifact
did not catch a defect in its own output; a different agent, cross-referencing it against something
else, did.

**The change that would prevent it.** `PROGRESS.md` lesson 8 already names the general fix and it's
working: *"The split between implementer and independent checker paid for itself four times."* The
gap is that this cross-reference (catalog data against generated images, price against comparable
SKUs) happened because a downstream agent happened to need both, not because a check exists that
verifies generated assets against their own source data as a matter of course.

---

## 15. A hardcoded test literal broke on a legitimate data change, and the fix pattern only got applied generally the second time it happened

**What happened.** `shell.test.ts` pinned the literal `€49` for the KRACHT obstacle sentence. When
`ffdec39` fixed the underlying merchandising bug (the graded moment answering "the closest is €49," a
63% overshoot on a €30 budget), the test broke — correctly, per the commit: *"shell.test.ts pinned the
literal '€49' and so failed for being right."* It had to be fixed by the main session rather than by
the T4 desk, because that desk was "correctly fenced out of `packages/agent`." The general fix (derive
the expected value from the catalog instead of hardcoding it) was applied here, then almost repeated
as a hardcoded literal in T12's KRACHT price assertion before being caught and generalized again:
`DECISIONS-LOG.md`, Testing & benchmarks, notes T12's spec derives the price "at spec-collection time
... rather than hardcoding `€32.95` [T12 task text already names this number]," citing
`ENGINEERING §3.3`'s "test above the limit" spirit extended to "assert from the source of truth, not a
snapshot of it."

**What it cost.** One cross-desk fix in the middle of an unrelated task (small), plus a second
near-miss of the identical failure shape in T12 that was caught only because the lesson was still
fresh enough to be named explicitly in the task text.

**The change that would prevent it.** The rule is now written down (`ENGINEERING §3.3`'s extension,
as applied in T12) — the remaining gap is that it took shipping the same bug shape twice before it
became a named principle rather than a one-off fix. Any assertion against a value that legitimately
changes with merchandising data should derive from that data, by default, not as a lesson relearned
per task.

---

## What the process caught — proportionate, not a consolation prize

Most of the failures above were themselves caught by the process before they became expensive. Listed
briefly so the checks that worked don't get abandoned along with everything above:

- **The plan-refutation round** (25 findings on the T1/T2/T3/T4/T8 wave, `e0db35d`) caught the `jsx`
  gap that would have blocked every commit in the wave, and the T2 package-name grep collision — both
  before any feature code existed.
- **Review-1**, on the original plan, found the one surviving blocker: T4's DoD would have been
  satisfied against a tuned fixture, evaporating the graded moment when the real catalog landed. Fixed
  by moving the strict assertions behind `--expect`, owned by T8 (`DECISIONS-LOG.md`, Testing &
  benchmarks).
- **Review-2** caught that the VELDE/KRACHT brand swap had quietly removed the only case where the
  contrast clamp visibly did anything (old MARENNE sage was 3.23:1; new VELDE was 16.5:1), that
  `focusRing` derived from `accent` alone computed 1.0:1 on VELDE's own CTA, that H2's brand-divergence
  check was vacuous because desaturation preserves luminance and the two brands' grounds already
  differed enough to pass without the widget doing anything, and that `bun test` exits 0 on zero
  collected tests.
- **H1** (contrast) caught both real T1 defects in item 3 above, independently of the implementer.
- **H3** (transcript) caught two real defects in T4's brain: three of four chips rescuing the empty
  intersection where the DoD assumed one, and the VELDE-style opening message matching one product
  instead of the 2–4 a demo needs (`665610c`) — both correctly deferred to T8's real-catalog gate
  rather than papered over.
- **T12's suite** caught the stale `dist/` build (item 7), the KRACHT 375px buy-bar/footer collision
  (item 6), and a real platform fact worth pinning down (Chromium's accessible name for the launcher
  reads sentence case even though the pixels are tracked uppercase — the spec now asserts the
  accessible name, not the pixels).
- **`bench/no-empty-test-run.sh`** caught that `bun test`'s default file walk would hand Playwright
  `*.spec.ts` files to `bun test` and silently collect zero of them.

None of this is free — the plan-review rounds alone cost more wall-clock than building all of T0
(`PROGRESS.md` lesson 5) — but per lesson 5, that round bought six defects, four of which would have
surfaced in T9 or T10 with no budget left to fix them. The pattern across this whole file is
consistent: every defect that shipped in work reported as "done" was later caught by something other
than the work's own self-report — an independent benchmark, a different agent's cross-reference, a
grid review, or a downstream task exercising a path the original QA box didn't. Nothing in this session
was caught by an agent's own report of its own work.
