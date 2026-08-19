import { budget } from './checks/budget'
import { contrast } from './checks/contrast'
import { divergence } from './checks/divergence'
import { scorecard } from './checks/scorecard'
import { transcriptCheck } from './checks/transcript'

export type CheckResult = {
  /** How many cases were actually examined. Zero is a failure, never a pass. [ENGINEERING §3.1] */
  count: number
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
export const checks: Check[] = [transcriptCheck, contrast, divergence, budget, scorecard]
