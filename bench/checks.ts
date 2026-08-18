import { contrast } from './checks/contrast'
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
}

/**
 * The registry. Each HARD check is owned by the task that would break it:
 * H1 contrast → T1 · H2 brand-divergence → T5 · H3 transcript → T4 ·
 * H4 viewport-375 + H5 isolation → T9 · H6 budget → T6.
 * Empty is the correct state until T1 lands — and `bun bench` exits non-zero while it is.
 */
export const checks: Check[] = [transcriptCheck, contrast]
