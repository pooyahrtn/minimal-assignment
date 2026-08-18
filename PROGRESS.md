# PROGRESS.md — what landed, and how wrong the estimate was

Maintained by the `pickup` skill, one row per task, appended when the task closes.
Estimates are in two units because nobody types here: **A** = agent wall-clock,
**R** = human review time. See `TASKS.md` §1 for the current baseline.

| Task | Est A | Actual A | Est R | Actual R | Retries to green | Note |
|---|---|---|---|---|---|---|
| T0 contracts, guardrails, skeleton | 2.5h | **6m** | — | pending | 2 | Estimate was in human-typing hours. Two in-flight corrections: Biome v2 deprecated `recommended`, and `bunx --bun biome` printed a spawn stack instead of a diagnostic inside the git hook. |

## Standing lessons

1. **Config-and-types tasks are ~25× faster than the original estimate.** T1, T4, T6 and T8 are
   the same class (pure logic, no screen) and are re-baselined to minutes, not hours.
2. **The estimate that matters is R, not A.** Anything graded on feel is bounded by a human
   opening a screen, and that does not compress.
3. **Retries are a signal about the task description, not the model** [BENCHMARKS §2]. Both of
   T0's retries were environment facts no task text could have carried — not a spec defect.
