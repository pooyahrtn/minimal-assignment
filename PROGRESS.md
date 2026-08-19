# PROGRESS.md — what landed, and how wrong the estimate was

Maintained by the `pickup` skill, one row per task, appended when the task closes.
Estimates are in two units because nobody types here: **A** = agent wall-clock,
**R** = human review time. See `TASKS.md` §1 for the current baseline.

## In flight

**Written at pickup [skill step 1], deleted when the task's row lands below [step 6].** Desks cannot
see each other's worktrees [ENGINEERING §5.1], so this is the only place task ownership is recorded
while the work is owned. Without it, the only evidence a task is running is dirt in `git status`,
which says which *files* are hot and never which *task* owns them — that guess has already been
wrong once this session, and COMPLAINS #1's "needs a decision before T6 starts" arrived during T6
for exactly this reason.

| Task | Desk | Since | Notes |
|---|---|---|---|
| T5 message block renderers | `minimal-assignment-02` (assumed — the only busy peer) | 2026-08-19, **claimed retroactively** | H2 `brand-divergence` green at 0.1719 vs the 0.075 floor. `blocks.ts`, `css.ts`, `converse.ts` dirty. |
| T6 platform API + snippet delivery | `minimal-assignment-02` (assumed) | 2026-08-19, **claimed retroactively** | `apps/platform/server.ts` + `config/*.json` + H6 `budget` written, uncommitted. `brands.ts` dirty. |
| T11 third brand (**required** — demo beat 4) | `minimal-assignment` (this desk) | 2026-08-19 08:59, claimed at pickup | Writes `packages/tokens/src/brands.ts` + `src/index.ts` + `tools/build-config.ts`, and regenerates `apps/platform/config/*.json` + `packages/agent/src/fallback.ts` via `bun run build:config`. All five were cold (35m+) at claim and are now committed at `d222edb`. **Does not touch** `bench/checks.ts`, `DECISIONS.md`, `bench/scorecard.*`, `PROGRESS`-adjacent T10 files — all hot with a peer desk right now. |

Both rows above T10 are retroactive, which is the whole point: nobody wrote them at the time.

---

| Task | Est A | Actual A | Est R | Actual R | Retries to green | Note |
|---|---|---|---|---|---|---|
| T0 contracts, guardrails, skeleton | 2.5h | **6m build / 31m incl. review round** | — | pending | 6 | Estimate was in human-typing hours. Six corrections total: Biome v2 deprecated `recommended`; `bunx --bun biome` printed a spawn stack inside the git hook; then the adversarial round found 4 gate defects (organizeImports on by default against §4.9, `apps/**` outside the typecheck, import-boundary glob missing package subpaths, `as`-casts unenforced). |
| — re-plan + adversarial review | — | **8.5m agent / 95k tokens** | — | pending | — | One review round on the plan returned 23 findings, 19 applied. This is the per-task process overhead the A column does not yet include. |
| — plan review for T1/T2/T3/T4/T8 | — | **7m agent / 88k tokens** | — | pending | — | 25 findings. Caught two that would have blocked every commit in a whole wave (`jsx` unset in the root tsconfig; the T2 proof grep hitting the package names). |
| T1 tokens engine | 20m | **19m over 3 rounds** | 15m | pending | 2 | Estimate was right, for the wrong reason. Build was ~12m; two correction rounds found real defects an independent check caught after the implementer's own 17 tests were green. |
| T4 agent brain | 30m | **8m** | 20m | pending | 0 | Cleanest task of the session. Fixture deliberately not tuned, and it showed: the independent H3 check found 3 chips rescuing where the DoD assumed 1. |
| H3 transcript bench | — | **10m over 2 rounds** | — | pending | 1 | Written blind to the brain. Round 2 re-assigned two assertions to T8's `--expect` layer. |
| H1 contrast bench | — | **7m** | — | pending | 0 | Cross-checked its pair list against T3's actual CSS rather than trusting the engine's own list. Found no gap. |
| T3 agent shell | 45m | **18.5m** | 45m | pending | 0 | Found a real launcher/sticky-bar collision at 375px by looking at the screen. |
| T2 VELDE | 90m (both) | **18.5m** | 90m | pending | 0 | Found 4 layout bugs by opening the page. I found 2 more it missed. |
| T2 KRACHT | (in above) | **24m** | (in above) | pending | 1 | One cwd-relative path broke `bun run test` from the root; caught by another desk, not by its own gates. |
| T2 photography | not estimated | **88m over 2 full attempts** | — | pending | 2 | The largest single line in the session and the one no estimate existed for. First set failed as a group; rebuilt by filtering mechanically then judging as a grid. |
| T8 ingest + extractor | 45m | **19.4m** | 30m | pending | 0 | Landing gate green first time. Two extractor bugs surfaced only by pointing it at real Dutch sites. |
| Brain↔shell wire | not estimated | **15m** | — | pending | 0 | Not a task in TASKS.md at all — T3 and T4 were parallel-safe precisely because nothing joined them, and nothing was scheduled to. |
| Storefront fix pass | not estimated | **32m** | — | pending | 0 | Merchandising + 2 layout defects + photo mapping, all forced before the freeze. |
| T14 competitor scan | 40m | **~12m** | 30m | pending | 0 | 12 products, 3 families. Two findings moved buckets: URL brand-ingest is table stakes (Intercom has shipped it since Dec 2023), and the no-custom-CSS decision went from taste to evidence (Rebuy's own docs warn merchants to hand-scope selectors). Only 1 of 12 rows was opened directly rather than read through a search summary — the DoD's `unverified` column is doing real work here. |
| T10 draft half (DECISIONS.md + the SOFT scorecard) | 20m draft | **~75m agent over 2 review rounds / ~1.1M tokens** | 90m | pending | 3 | Two of eight DoD boxes were dead on arrival (demo on deployed links, live extension — T7/T11/T15 unbuilt) and were known so from reading `TASKS.md`. The plan round returned **14 findings, 3 BLOCKERs**, all of them the plan misreading the tree it was summarising: box 4 declared uncloseable closes in one command, box 3's "with dates" declared unsatisfiable is one `git log -S` away, and **four of five chosen override entries failed the brief's own direction test** (AI suggests, human overrides) — three were the AI overriding itself. The diff round found the new SOFT check passing on three malformed scorecards; fixed and fault-injected five ways. Box 1 ("one page") is still open at 1565 words, after six editing passes and a three-way edit collision on the file. |
| T14 fan-out (14 agents) | 40m | **~14m wall / 1.11M tokens / 463 tool calls** | 30m | pending | 1 | Pilot on one product first, then fan out — the pilot paid for itself: it exposed three missing schema fields (preview target, merchant complaints, vocabulary count) that would have cost a full re-run at 13x the tokens. One script parse error (backticks inside a template literal). Three of five attacks on our own design landed. |

## Standing lessons

1. **Config-and-types tasks are ~25× faster than the original estimate.** T1, T4, T6 and T8 are
   the same class (pure logic, no screen) and are re-baselined to minutes, not hours.
2. **The estimate that matters is R, not A.** Anything graded on feel is bounded by a human
   opening a screen, and that does not compress.
3. **Retries are a signal about the task description, not the model** [BENCHMARKS §2]. T0's first
   two retries were environment facts no task text could have carried. The other four were real
   defects in work reported as done — which is the case for the review round existing at all.
4. **The gate I wrote had a bug the gate could not catch.** The `as`-cast check branched on an
   `xargs` pipeline, and `xargs` exits 0 when it runs nothing — so it rejected every commit that
   staged no TypeScript, and its first live run blocked its own fix. Found by running it three
   ways (blocking case, allowed case, no-TS case), not by reading it. `ENGINEERING §3.4`
   generalises: reproduce, then fix.
5. **Process overhead is now the largest single line in the A column.** One adversarial round cost
   more wall-clock than building all of T0. That is a real cost and it bought six defects, four of
   which would have surfaced in T9 or T10 with no budget left.

6. **The estimates were not wrong in the way the last re-baseline assumed.** Pure-logic tasks came in
   at 25-40% of estimate, as predicted. But the two largest lines in this session — **photography at
   88 minutes and the storefront fix pass at 32** — had *no estimate at all*, because neither is a
   task in `TASKS.md`. The schedule risk was never the tasks; it was the work between them.
   **Measured: of ~332 minutes of A spent across the landed rows, 135 (41%) went to work with no
   row in `TASKS.md`** — photography 88m, the storefront fix pass 32m, the brain↔shell wire 15m.
   That ratio, not the total, is the finding. Remaining A across T5/T6/T7/T9/T10/T11/T13/T15 is
   ~4h on the same evidence, against ~8h of real remaining human attention.
7. **Asset sourcing is its own task class and needs its own baseline.** `TASKS.md` §1 says "sourcing
   60-80 coherent product photos is the least compressible hour in the project and is *not* in the
   90m" — that was right, and it still went unbudgeted. It took two full attempts and was ultimately
   bounded by someone else's rate limiter, which is a category of cost no agent estimate models.
8. **The split between implementer and independent checker paid for itself four times.** T1's clamp
   (green on 17 of its own tests, failing at 4.4807:1 on the bytes it shipped), T1's second defect
   found while writing the check the first defect prompted, H3's two findings against the brain, and
   the KRACHT packshot labels — caught by the *storefront* agent reading its own catalog against
   images another agent had made. Nothing self-reported found any of them.
9. **Integration work is invisible to a task graph that was built for parallelism.** `TASKS.md` §1
   lists T1/T2/T3/T4/T8 as "truly parallel", which was true and useful. What it does not say is that
   after they land the widget still cannot hold a conversation, because nothing owns the seam. That
   was 15 minutes of work and zero minutes of plan.

10. **A shared working tree costs the docs task most.** T10 ran with three other desks live in the
    same tree: ~20 files dirty that were not its own, `bench/report.md` mutated under it twice by a
    peer's filtered `bun bench` run, a peer commit (`770889b`, then `d222edb`) landing mid-task on
    files it had already read, and a peer **rewriting `DECISIONS.md` while T10 was editing it** —
    which deleted the dated log citations DoD box 3 depends on and had to be restored by hand. Build
    tasks own disjoint trees; a docs task reads *everything*, so it is the one task whose inputs
    cannot be held still. Schedule it after the wave it describes, or accept that every "the tree
    says X" claim in it has a shelf life measured in minutes.
11. **The adversarial round is now unambiguously the highest-yield step in the process, and its
    yield is in the plan, not the diff.** T0's round found 6 defects; T10's plan round found 14 with
    3 BLOCKERs — and every BLOCKER was the same species: *the plan asserted something about the repo
    without running the command that would check it* ("the log has no dates", "committing the report
    commits another desk's state", "box 8 is already closed"). None was a coding error. The cheapest
    possible fix is to run the greps while writing the plan rather than while defending it.
12. **A DoD box can be wrong, and T10's box 3 was.** It demands citations "with dates" from a log
    whose own documented format (line 8) carries a `[session]` tag and no date field. It is
    satisfiable only by reconstructing dates from git per entry. The box was written by whoever
    wrote the task, not by whoever built the log — the two never met, and the `pickup` skill's
    step-2 instruction to refute the *task text* is what caught it.
