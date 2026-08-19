# BENCHMARKS — how we know the agents are doing a good job

> **What this is.** The measurement layer — deterministic checks plus a judged scorecard, written
> to a report file with gold sets under `bench/gold/`. Two targets:
>
> - **the build** — is the shipped thing actually good, measured on the things the brief grades?
> - **the coding agents** — is the AI writing code we'd accept, and which task should a human open first?
>
> **The tiering rule is the whole discipline:** deterministic checks are **HARD** (they block).
> LLM-judged axes are **SOFT** (they print, they rank, they never block) — because a judge validated
> against no human gold set is a coin flip with a confident voice, and 36 hours does not buy a gold
> set. Say so rather than trusting it.

Run everything: `bun bench`. Run one: `bun bench <name>`. Report lands in `bench/report.md`.

---

## 1. HARD tier — deterministic, blocking

Each one prints a **count and asserts it is non-zero**, so a run that checked nothing can never
read as a pass. [ENGINEERING §3.1]

| # | Name | What it measures | Pass bar |
|---|---|---|---|
| H1 | `contrast` | Fuzz 200 pseudo-random `MerchantTokens` (seeded, so it is reproducible). Derive, then check every text-on-background pair the components actually use. | **Zero** pairs below 4.5:1. Report the worst ratio and the config that produced it. |
| H2 | `brand-divergence` | Render all 7 message blocks × both brands, screenshot, desaturate, **then normalise ground luminance** (histogram-match, or re-render both brands forced to an identical `surface`) and compute perceptual distance. Plus a second assertion on **non-colour** output: read computed `padding`, `border-radius`, `letter-spacing`, `box-shadow` and `text-transform` off both shadow roots and assert ≥4 differ. | Distance above a pinned floor, **and** ≥4 structural properties differing. |
| H3 | `transcript` | Golden transcripts: each brand's pinned opening message → the exact sequence of typed blocks the FSM emits, obstacle included. Stored as JSON in `bench/gold/`. | Byte-exact match, or a diff. The agent is deterministic, so any drift is a real behaviour change. |
| H4 | `viewport-375` | Every surface, both brands, at 375×667: no horizontal overflow, nothing rendered outside the viewport, composer above the keyboard inset. | Zero violations. |
| H5 | `isolation` | Mount the widget on **both** hostile storefronts (global `*{}` reset vs Tailwind preflight) and compare computed styles inside the shadow root across hosts. | Identical. A difference means the host leaked in — a §1.1 violation the storefront freeze forbids fixing at the source. |
| H6 | `budget` | Gzipped size of `agent.js`, and config-fetch-to-first-paint. | Under a pinned cap. Regressions here are silent otherwise. |

**H2 and H3 are the two that matter.** H2 is the graded claim; H3 is the thing most likely to
silently break when a parallel agent touches the FSM.

**Why H2 normalises luminance — measured, not theoretical.** Both brand pairs we have written put
a light ground against a dark one: VELDE/KRACHT are greyscale 250 vs 25, and the earlier
MARENNE/KLYFT pair was 241 vs 20. Desaturation removes *hue*; it preserves *luminance*. So an
88% field delta clears any floor before a single spacing, radius, tracking or border token
contributes anything — meaning a widget that themed `surface` and `accent` and **ignored
`density`, `radius`, `elevation` and `labelCase` entirely would pass H2**. That is exactly the
"styled rather than built" verdict in the brief, certified green by our own benchmark. Normalising
the ground is what makes the number measure structure, which is the thing being claimed.

**An invariant that co-exists with a limit is tested ABOVE that limit** — H3's fixtures use more
chips than the number that first produces an empty set, and more than one near-miss candidate.
[ENGINEERING §3.3]

---

## 2. SOFT tier — the agent scorecard

**This is the "how good/bad are the agents doing" dashboard.** It never blocks. It produces a
pass-rate matrix, so a glance tells you which delivered task to open with your own eyes.

**One row per landed task**, one column per axis, scored by an LLM judge reading the diff **against
that task's DoD**. Not a range: this line read `T0…T11` from the day it was written, which was
correct exactly until T12 landed, and left `TASKS.md` T10's DoD ("every landed task") and this
sentence specifying different sets with nothing to reconcile them — so the scorecard's coverage was
a judgment call that flipped depending on which file you opened first [COMPLAINS #5]. A task that
lands after the last judging run is a **gap**, named out loud by `bench/checks/scorecard.ts` on
every run, never a quietly narrower denominator:

| Axis | The question | Why it is on the list |
|---|---|---|
| **faithful** | Did it do everything the task said — every DoD bullet, not the easy ones? | Partial completion reported as done is the #1 parallel-agent failure. |
| **honest** | Does the hand-off match what the diff actually does? Anything claimed but absent? | An agent's self-report is the least reliable signal in the project. [ENGINEERING §3] |
| **lazy** | Is this the smallest thing that works — no speculative abstraction, no reinvented stdlib, no dead flexibility? | Over-engineering is a defect here, not a bonus. [ponytail] |
| **reviewable** | Could a human review this in ten minutes? Sprawl, nesting, naming, file count. | The human is the bottleneck; this axis measures the load placed on them. |

Scored ✅/❌ per axis with the judge's rationale **quoted next to the evidence** — so the judge
itself stays auditable rather than being trusted.

**Also tracked per task, and just as informative:** wall-clock, token cost, and **number of retries
or corrections before green**. A task that needed four attempts is usually a signal about the *task
description*, not the agent — which makes this suite a measurement of `TASKS.md` as much as of the
model.

---

## 3. What is deliberately NOT measured

- **No judge calibration.** Trusting a judge near a gate means validating it (Cohen's κ / QWK)
  against human gold labels, and that gold set is not something 36 hours buys. So instead of a fake
  calibration, every judged axis stays SOFT. Named here because the honest answer to "do you trust
  the judge" is "no, that is why it cannot block".
- **No coverage.** Measures typing, not correctness.
- **No cross-model comparison.** A model sweep is interesting, and not what a 36-hour build has
  hours for.

---

## 4. Rules that keep the benchmark honest

1. **A benchmark an agent can pass by editing the benchmark is worthless.** `bench/gold/*` and every
   threshold are human-owned. An agent that believes a gold file is wrong says so in its hand-off
   and stops — it never edits one and reports green. [ENGINEERING §3.11]
2. **A green run that collected zero cases is a failure.** Every check prints its count.
3. **Gold files are regenerated deliberately, never automatically.** `bun bench --accept` is a
   human-run command, and the resulting diff is reviewed like any other.
4. **H2's floor is pinned once, early, from the first side-by-side that looks right** — then it
   only ever ratchets up. A threshold tuned downward to make a failing run pass is a lie.
