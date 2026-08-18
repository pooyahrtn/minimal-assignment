---
name: pickup
description: >
  Pick up a task from TASKS.md and run it through this project's process:
  read the task and its cited contracts, plan, get the plan adversarially
  refuted, build (Sonnet subagents for mechanical work), get the diff
  adversarially reviewed against the DoD, run the gates, then post a status
  update covering how close the project is to done, whether the task order is
  still right, and how far the estimate was off. Use when the user says
  "pickup T3", "let's pick up the next task", "/pickup", names a task ID from
  TASKS.md, or asks what to work on next.
---

# pickup

One task at a time, through six steps. Do not skip step 2 or step 5 — they are
the two the process exists for.

## 1. Read before planning

Read the `TASKS.md` entry in full: Scope, DoD, QA box, "Not in scope". Then read
every doc section it cites (`PRINCIPLES §n`, `ENGINEERING §n`, `BENCHMARKS §n`) —
the task text is a summary, the cited section is the contract.

Confirm the dependencies in the §1 task graph actually landed. If they did not,
say so and stop; do not build against an imagined interface.

## 2. Plan, then have it refuted

Write a short plan — what changes, which files, which DoD box each part closes.

Then spawn an **adversarial plan reviewer** (Agent tool, default model, not
Sonnet — this one needs judgment). Its only job is to attack:

> Here is a task and a plan for it. Your job is to REFUTE the plan, not improve
> it. Default to "refuted" under uncertainty. For each finding cite the DoD
> bullet or doc section it violates and the line it appears on. Specifically
> hunt: DoD boxes the plan cannot actually close in this worktree; work that
> belongs to a different task; a contract invented rather than read; a shortcut
> that will be discovered during demo rehearsal with no budget left to fix it.

Apply survivors only. A high rejection rate is the expected outcome, not a
failure — log any override in `DECISIONS-LOG.md` the same session.

## 3. Build

Delegate **mechanical, fully-specified slices to Sonnet** (`model: "sonnet"`):
config files, type transcription, catalog/data generation, repetitive markup,
test fixtures, ingest parsing. Run independent slices in parallel in one message.

**Keep on the main model:** anything graded on feel (UI, copy, layout, motion),
any product judgment, any decision the task text did not already settle.

Ponytail applies throughout — the ladder shortens the solution, never the reading.

## 4. Have the diff refuted

Spawn an **adversarial code reviewer** against the actual diff:

> Go through this diff against the task's DoD, box by box. For each box state
> PROVEN (naming the evidence — a command run and its output, a screenshot) or
> UNPROVEN. Then: what does the hand-off claim that the diff does not do? What
> did it silently skip, stub, or scope down? Assume the author overstated.

An agent's self-report is the least reliable signal here [ENGINEERING §3]. Verify
externally — fetch the URL, curl the endpoint, open the page — never on an exit
code [§3.9]. UI work opens the real screen at 375px before it is called done [§3.6].

## 5. Gates

`bun run typecheck` · `bun run lint` · `bun bench` · the task's own QA box, run
the gate-exact way from the repo root. Never edit a gold file or threshold to go
green — say so and stop [BENCHMARKS §4.1].

## 6. Status update — always, in this shape

Append the row to `PROGRESS.md` first (create it if missing), then report:

**Where the project stands.** Tasks landed / total, and honestly what share of
the *graded* surface that represents — a count of finished tasks is not progress
if the ones left hold everything the brief scores. Name what is demoable today.

**a. If we are not close, why.** Is it a prioritisation problem? Answer against
`PRINCIPLES §1` (the graded list) and `TASKS §3` (the pre-committed cut order):
is time going into things nobody scores? Has a cut candidate quietly eaten
polish budget? Should the order change? Say so plainly, and say if the answer is
"no, the order is fine".

**b. Estimate vs actual.** Estimates are in two units — **agent wall-clock** and
**human review time** — because nobody types here. Report both against actual,
plus retries-before-green. Then adjust: if a whole class of task is
systematically off, re-baseline that class rather than the single row, and note
whether the miss was the agent or an under-specified task description
[BENCHMARKS §2].

Keep it short. Numbers and the one recommendation, not an essay.
