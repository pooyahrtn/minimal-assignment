import type { Check } from '../checks'

// The SOFT tier (BENCHMARKS §2): the agent scorecard. It measures the *coding agents*, not the
// product — one row per landed task, four axes, judged by an LLM reading that task's diff against
// that task's own DoD.
//
// The judging does NOT happen here. An uncalibrated judge inside a gate run would be a coin flip
// with a confident voice [BENCHMARKS §3], and it would also make `bun bench` depend on a network
// call. So the judgements live in `scorecard.json` the way transcripts live in `bench/gold/*`:
// written deliberately, human-owned, regenerated on purpose and never as a side effect of a run
// [BENCHMARKS §4.3]. This check's whole job is to surface them in the one report file
// [BENCHMARKS.md:14] and to rank the tasks so a glance says which one to open first.
//
// SOFT, so it never blocks — but it still throws on a scorecard that is malformed or stale,
// because a scorecard silently missing the task you most needed judged is the same defect as a
// check that collected zero cases [ENGINEERING §3.1].

const SCORECARD = `${import.meta.dir}/../scorecard.json`

const AXES = ['faithful', 'honest', 'lazy', 'reviewable'] as const

type Axis = { pass: boolean; rationale: string }
type Row = { task: string; title: string; axes: Record<string, Axis>; worst_finding: string }

/**
 * The tasks this scorecard is expected to cover, in report order. Hand-maintained on purpose: a
 * scorecard is judged deliberately [BENCHMARKS §4.3], so a task that lands after the last judging
 * run must show up as a gap rather than quietly widen the denominator. Add the row here when you
 * add its judgement, never before — this list is what makes "we judged everything" falsifiable.
 *
 * Known gap: T5 and T6 landed in `d222edb` after this run and are NOT judged yet. They are listed
 * so the check says so out loud on every run instead of reporting full coverage of a stale set.
 */
const EXPECTED = ['T0', 'T1', 'T2', 'T3', 'T4', 'T8', 'T12', 'T14', 'H1+H3', 'wire']
const UNJUDGED_LANDED = ['T5', 'T6']

/** A rationale short enough to be a placeholder is not evidence [BENCHMARKS §2: quoted next to the evidence]. */
const MIN_RATIONALE = 40

export const scorecard: Check = {
  name: 'scorecard',
  tier: 'SOFT',
  run: async () => {
    const file = Bun.file(SCORECARD)
    if (!(await file.exists())) throw new Error(`${SCORECARD} is missing`)
    const rows: Row[] = (await file.json()).rows

    const seen = new Set(rows.map((r) => r.task))
    const missing = EXPECTED.filter((t) => !seen.has(t))
    if (missing.length > 0) throw new Error(`no judgement for task(s): ${missing.join(', ')}`)
    // The mirror of the line above, and the half that is easy to forget: a row for a task nobody
    // expects means the scorecard and the task list have drifted apart, and the pass-rate below is
    // being computed over a set that is no longer the one being claimed.
    const stale = [...seen].filter((t) => !EXPECTED.includes(t))
    if (stale.length > 0) throw new Error(`judgement for unexpected task(s): ${stale.join(', ')}`)

    let scored = 0
    let green = 0
    const totals = rows.map((row) => {
      let rowGreen = 0
      for (const axis of AXES) {
        const verdict = row.axes[axis]
        if (verdict === undefined) throw new Error(`${row.task}: axis '${axis}' not scored`)
        // A missing verdict must not read as ❌. `undefined` is falsy, so without this the row
        // would score 0/4 and rank itself worst — a malformed scorecard would masquerade as a
        // damning one, which is the more expensive direction to be wrong in.
        if (typeof verdict.pass !== 'boolean')
          throw new Error(`${row.task}.${axis}: no verdict (pass is ${typeof verdict.pass})`)
        // The judge stays auditable only if its reasoning ships next to its verdict [BENCHMARKS §2].
        if (verdict.rationale.trim().length < MIN_RATIONALE)
          throw new Error(`${row.task}.${axis}: rationale too short to be evidence`)
        scored++
        if (verdict.pass) {
          green++
          rowGreen++
        }
      }
      return { task: row.task, green: rowGreen }
    })

    // Ascending, so the head of the list is what a human opens first. Ties keep scorecard order.
    const ranked = [...totals].sort((a, b) => a.green - b.green)
    const lowest = ranked[0]?.green ?? 0
    const worst = ranked.filter((r) => r.green === lowest)
    const next = ranked.filter((r) => r.green > lowest)
    const secondLowest = next[0]?.green
    const secondBand = next.filter((r) => r.green === secondLowest)

    return {
      count: scored,
      detail:
        `${green}/${scored} axes green across ${rows.length} landed tasks. ` +
        `Open first: ${worst.map((r) => `${r.task} (${r.green}/4)`).join(', ')}` +
        (secondBand.length > 0
          ? `, then ${secondBand.map((r) => `${r.task} (${r.green}/4)`).join(', ')}`
          : '') +
        `. ${UNJUDGED_LANDED.length > 0 ? `NOT judged: ${UNJUDGED_LANDED.join(', ')} (landed after this run). ` : ''}` +
        `Judge is uncalibrated — advisory only. Rationales: bench/scorecard.json.`,
    }
  },
}
