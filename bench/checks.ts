import { budget } from './checks/budget'
import { contrast } from './checks/contrast'
import { divergence } from './checks/divergence'
import { isolation } from './checks/isolation'
import { scorecard } from './checks/scorecard'
import { transcriptCheck } from './checks/transcript'
import { viewport375 } from './checks/viewport-375'

export type CheckResult = {
  /** How many cases were actually examined. Zero is a failure, never a pass. [ENGINEERING §3.1] */
  count: number
  /**
   * The failures this check OBSERVED and chose to report rather than throw on. Empty (or absent)
   * means it saw none.
   *
   * `run.ts` used to grade on `count > 0` alone, which is only safe if every check throws on every
   * failure — a belief `COMPLAINS #2` recorded as unverified, and the belief was load-bearing for
   * every green report in this repo. Grading now reads a number the check reports instead of
   * resting on a property of code nobody had tested. Throwing is still legal and still fails the
   * run; it is the right protocol for a failure that makes the rest of the measurement
   * meaningless. This field is for the other kind — a check that can see twenty cases, fail three,
   * and should say which three rather than stopping at the first.
   *
   * Optional, because the SOFT tier must not be dragged into the HARD tier's grading contract
   * [BENCHMARKS §3, ENGINEERING §3.12]: an uncalibrated judge never blocks, so `scorecard` does
   * not populate it and `run.ts` never blocks on it.
   */
  failures?: string[]
  detail: string
}

export type Check = {
  name: string
  /** HARD blocks the run; SOFT prints and ranks, never blocks. [BENCHMARKS §1, §2] */
  tier: 'HARD' | 'SOFT'
  run: (args: string[]) => Promise<CheckResult>
  /**
   * Optional: regenerates this check's gold file(s) from a live run. Only ever invoked by the
   * explicit, bare `bun bench --accept` (BENCHMARKS §4.3) — never by `run`, never automatically.
   * A check with nothing to regenerate simply omits this.
   */
  accept?: () => Promise<{ detail: string }>
}

/**
 * The registry. Each HARD check is owned by the task that would break it:
 * H1 contrast → T1 · H2 brand-divergence → T5 · H3 transcript → T4 ·
 * H4 viewport-375 + H5 isolation → T9 · H6 budget → T6.
 * The SOFT tier (BENCHMARKS §2) is `scorecard`, owned by T10 — it ranks the tasks, never blocks.
 * An empty registry is a failure, not a pass — `bun bench` exits non-zero on one [BENCHMARKS §4.2].
 */
export const checks: Check[] = [
  transcriptCheck,
  contrast,
  divergence,
  viewport375,
  isolation,
  budget,
  scorecard,
]
