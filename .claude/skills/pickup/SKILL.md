---
name: pickup
description: >
  Run one task from TASKS.md through this project's process: read the task and
  its cited contracts, plan, get the plan adversarially refuted, build, get the
  diff adversarially reviewed against the DoD, run the gates, post a status
  update, log complaints. Use when the user says "pickup T3", "let's pick up the
  next task", "/pickup", names a task ID from TASKS.md, or asks what to work on
  next.
---

# pickup

One task, seven steps. Steps 2 and 5 are the point — never skip them.

## 1. Read, then claim

- Read the whole `TASKS.md` entry: Scope, DoD, QA box, Not in scope.
- Read every section it cites (`PRINCIPLES §n`, `ENGINEERING §n`, `BENCHMARKS §n`).
  The task text is a summary; the cited section is the contract.
- Confirm the §1 task-graph dependencies landed. If not, say so and stop.
- Read `## In flight` at the top of `PROGRESS.md` — another desk may own the task, or
  a file you need.
- **Claim it before writing any plan:** append a row there — task, desk, date, files
  it will touch.
- Desks can't see each other's worktrees [ENGINEERING §5.1]; an unclaimed task shows
  up only as dirt in `git status`, which names hot *files*, never the *task*.

## 2. Plan, then have it refuted

- Write a short plan: what changes, which files, which DoD box each part closes.
- Spawn an **adversarial plan reviewer** (Agent tool, default model — needs judgment):

> Here is a task and a plan for it. Your job is to REFUTE the plan, not improve
> it. Default to "refuted" under uncertainty. For each finding cite the DoD
> bullet or doc section it violates and the line it appears on. Specifically
> hunt: DoD boxes the plan cannot actually close in this worktree; work that
> belongs to a different task; a contract invented rather than read; a shortcut
> that will be discovered during demo rehearsal with no budget left to fix it.

- Refute the **task text** too: is every DoD box satisfiable?
- Hand-run every proof-by-grep against the state after *all* the task's boxes close,
  not the state it starts in. An impossible box, or a grep forbidding what a sibling
  box mandates, costs far more mid-build.
- Apply survivors only. A high rejection rate is expected.
- Log overrides in `DECISIONS-LOG.md` the same session.

## 3. Build — orchestrate, don't type

- Your context is for orchestration: contracts, plan, refutations, decisions.
- Anything you would only skim — repo-wide greps, file sweeps, bulk edits, fixture
  and catalog generation — goes to a subagent that returns the conclusion, not the
  file dumps.
- **Sonnet** (`model: "sonnet"`) for mechanical, fully-specified slices: config, type
  transcription, catalogs, repetitive markup, fixtures, ingest parsing. Independent
  slices in parallel, one message.
- **Main model** for feel (UI, copy, layout, motion), product judgment, anything the
  task text left open, and the adversarial reviews in steps 2 and 4.
- **The main session owns every shared file** — `bench/checks.ts`, root
  `package.json`, `tsconfig*`, `TASKS.md`, `PROGRESS.md`, `DECISIONS-LOG.md`.
  Subagents write inside their own directory only, and report what needs registering
  [DECISIONS-LOG, five-concurrent-agents entry].
- **Workflow tool** when hand-spawning is the bottleneck: five-plus independent
  slices, or per-DoD-box verification in step 4. `/workflows` watches it live.
- Never wrap the whole pickup in one workflow — steps 1, 2, 6 and 7 are where Pooya
  stays in the loop.
- Ponytail throughout: the ladder shortens the solution, never the reading.

## 4. Have the diff refuted

- Spawn an **adversarial code reviewer** against the actual diff:

> Go through this diff against the task's DoD, box by box. For each box state
> PROVEN (naming the evidence — a command run and its output, a screenshot) or
> UNPROVEN. Then: what does the hand-off claim that the diff does not do? What
> did it silently skip, stub, or scope down? Assume the author overstated.

- An agent's self-report is the weakest signal here [ENGINEERING §3].
- Verify externally — fetch the URL, curl the endpoint, open the page. Never on an
  exit code [§3.9].
- UI work opens the real screen at 375px before it is done [§3.6].

## 5. Gates

- `bun run typecheck` · `bun run lint` · `bun bench` · the task's QA box.
- Gate-exact, from the repo root.
- Never edit a gold file or threshold to go green: say so and stop [BENCHMARKS §4.1].

## 6. Status update — always, in this shape

- Append the `PROGRESS.md` row **and delete this task's `## In flight` line in the
  same edit** — the claim exists to be released.
- Flip the task's status marker in `TASKS.md` — the heading and the §1 table row.
  `TASKS.md` answers *whether* a task is done; `PROGRESS.md`'s `## In flight`
  answers *which desk owns it right now*. A stale marker is worse than none.
- Write it now, not in a later batch: a row reconstructed days later sounds
  reconstructed [COMPLAINS #3].

Then report:

- **Where the project stands.** Tasks landed / total, and what share of the *graded*
  surface that is — a task count is not progress if the remainder holds everything
  the brief scores. Name what is demoable today.
- **a. If we are not close, why.** Against `PRINCIPLES §1` (graded list) and
  `TASKS §3` (pre-committed cut order): is time going into things nobody scores? Has
  a cut candidate eaten polish budget? Should the order change? Say plainly if the
  answer is "no, the order is fine".
- **b. Estimate vs actual.** Both units — **agent wall-clock** and **human review
  time** — plus retries-before-green. If a whole class is systematically off,
  re-baseline the class, not the row. Say whether the miss was the agent or an
  under-specified task description [BENCHMARKS §2].
- Numbers and one recommendation. No essay.

## 7. Complaints

- Spawn a **Sonnet agent** (`model: "sonnet"`) over the session. It complains only —
  no fixes; `/retro` turns these into actions later.

> Read this session: the task, the diff, and how it went. List what went wrong —
> friction, wasted rounds, wrong turns, things done twice, gaps in the task text,
> process steps that did not earn their cost, anything a reviewer would be
> annoyed by. Short bullets. Each bullet says the harm it already caused and the
> risk of it recurring. Do NOT propose solutions, fixes, or improvements — only
> the complaint. If nothing is worth complaining about, say so and return
> nothing.

- Append to `COMPLAINS.md` (create if missing). Never rewrite earlier sections.

```markdown
## <TASK-ID> — <date>

**What changed:** one or two sentences on what the task actually did.

**Complaints**
- <complaint> — harm: <what it cost this session>; risk: <what it costs if it recurs>
```

- Nothing to complain about → append the heading with `- none`, so the ledger shows
  the task was checked.
