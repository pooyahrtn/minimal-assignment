# PROGRESS.md — what landed, and how wrong the estimate was

Maintained by the `pickup` skill, one row per task, appended when the task closes.
Estimates are in two units because nobody types here: **A** = agent wall-clock,
**R** = human review time. See `TASKS.md` §1 for the current baseline.

| Task | Est A | Actual A | Est R | Actual R | Retries to green | Note |
|---|---|---|---|---|---|---|
| T0 contracts, guardrails, skeleton | 2.5h | **6m build / 31m incl. review round** | — | pending | 6 | Estimate was in human-typing hours. Six corrections total: Biome v2 deprecated `recommended`; `bunx --bun biome` printed a spawn stack inside the git hook; then the adversarial round found 4 gate defects (organizeImports on by default against §4.9, `apps/**` outside the typecheck, import-boundary glob missing package subpaths, `as`-casts unenforced). |
| — re-plan + adversarial review | — | **8.5m agent / 95k tokens** | — | pending | — | One review round on the plan returned 23 findings, 19 applied. This is the per-task process overhead the A column does not yet include. |

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
