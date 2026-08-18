# AGENTS.md

## Write decisions down as you make them

**Every decision goes in `DECISIONS-LOG.md`, in the same session it is made.** Not at the end,
not reconstructed from memory, not "I'll capture it in the summary."

A decision is anything the task description did not already settle: a suggestion you overrode, an
approach you rejected, a value you picked, a corner you cut on purpose, a contract you had to
interpret. If you found yourself choosing, log it.

One bullet, appended under the matching topic heading in `DECISIONS-LOG.md`:

`- **What we did** ← what was proposed · why (the number, clause or section) [session]`

Reversing an earlier decision? Leave its bullet, prefix `~~⊗~~`, and point at the one replacing it.

The *why* is the part with value. Cite the measurement, the licence clause, the doc section, or
the constraint that decided it — not "cleaner" or "better practice". If a number decided it, put
the number in.

**Why this rule exists, in order of how much it costs to skip:**

1. `TAKE_HOME.md` asks for it by name — DECISIONS.md must cover *"what your AI tooling suggested
   that you overrode, and why"*. It is a graded question, so the log is a deliverable, not admin.
2. `PRINCIPLES.md` §12: *"a reconstructed answer sounds reconstructed."* You cannot rebuild the
   reasoning later; you can only rebuild a plausible-sounding version of it.
3. `ENGINEERING.md` §5.6 makes it a per-session obligation, and `TASKS.md` §2 makes it a bullet in
   every task's Definition of Done. A task with an unlogged override is not done.

Log the decisions you *lost*, too. The entries where a review refuted something and the fix went
in are the strongest ones in the file, and the ones a reviewer will find most credible.

## Where the contracts live

Read the section a task cites before building against it — the task text is a summary, the cited
section is the contract.

| File | Owns |
|---|---|
| `TAKE_HOME.md` | The actual brief. Wins over every other doc, including this one. |
| `PRINCIPLES.md` | Product taste, the token contract, the two brands, the agent's behaviour. |
| `ENGINEERING.md` | Where logic lives, what "done" means, what is mechanically enforced. |
| `TASKS.md` | The task graph, each task's scope, DoD and QA box, the cut order. |
| `BENCHMARKS.md` | The HARD gates and the SOFT agent scorecard. Gold files are human-owned. |
| `DECISIONS-LOG.md` | This rule's output. Append-only. |
| `PROGRESS.md` | Estimate vs actual per task, and what to re-baseline. |

`.claude/skills/pickup/SKILL.md` is the process for picking up a task.

## Two habits that are not negotiable

- **Never report done off an exit code.** Verify externally — fetch the URL, open the page, run the
  command and read the output. An agent's self-report is the least reliable signal here
  [`ENGINEERING.md` §3].
- **Never edit a gold file or a threshold to go green.** If you believe one is wrong, say so in
  your hand-off and stop [`BENCHMARKS.md` §4.1].
