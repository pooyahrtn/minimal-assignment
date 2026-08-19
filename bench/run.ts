import { checks } from './checks'
import { grade } from './grade'

type Row = {
  name: string
  tier: string
  ok: boolean
  count: number
  failures: string[]
  detail: string
}

const rawArgs = process.argv.slice(2)

// `bun bench --accept` (BENCHMARKS §4.3): a human-run, deliberate gold regeneration — never
// automatic, never a side effect of a normal run. Only this exact bare invocation triggers it; a
// check-scoped `--accept` (e.g. `bun bench transcript <catalog> --expect=... --accept`) is a
// different path that stays inside that check's own `run(args)`, still gated by whatever
// `--expect` demands on the same command line.
if (rawArgs.length === 1 && rawArgs[0] === '--accept') {
  console.log(
    '--accept: regenerating gold from a live run. This never happens on a normal `bun bench`. [BENCHMARKS §4.3]\n',
  )
  let anyAccepted = false
  for (const check of checks) {
    if (!check.accept) continue
    anyAccepted = true
    const { detail } = await check.accept()
    console.log(`${check.name}: ${detail}`)
  }
  if (!anyAccepted) {
    console.log('No check exposes an --accept path.')
    process.exit(1)
  }
  process.exit(0)
}

const [filter, ...rest] = rawArgs
const selected = filter ? checks.filter((c) => c.name === filter) : checks
const rows: Row[] = []

for (const check of selected) {
  try {
    const { count, failures, detail } = await check.run(rest)
    // A check that collected nothing has proven nothing, whatever it returned — and a check that
    // reported failures fails even if it collected thousands of cases.
    const reported = failures ?? []
    rows.push({
      name: check.name,
      tier: check.tier,
      ok: grade({ count, failures: reported }),
      count,
      failures: reported,
      detail,
    })
  } catch (error) {
    // A throw is still a failure, and still the right protocol for one that makes the rest of the
    // measurement meaningless. It lands in the same column as a reported one so the report has a
    // single answer to "what went wrong", not two.
    const message = error instanceof Error ? error.message : String(error)
    rows.push({
      name: check.name,
      tier: check.tier,
      ok: false,
      count: 0,
      failures: [message],
      detail: message,
    })
  }
}

const blocked = rows.filter((r) => !r.ok && r.tier === 'HARD')
const collectedNothing = selected.length === 0

const report = [
  '# bench report',
  '',
  filter ? `Filter: \`${filter}\`` : 'All checks.',
  '',
  '| check | tier | result | cases | failures | detail |',
  '|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.name} | ${r.tier} | ${r.ok ? 'pass' : 'FAIL'} | ${r.count} | ${r.failures.length} | ${
        r.failures.length > 0 ? `${r.failures.join(' · ')} — ` : ''
      }${r.detail} |`,
  ),
  '',
  collectedNothing
    ? `**FAIL — 0 checks collected${filter ? ` for "${filter}"` : ''}.** A run that checked nothing is not a pass.`
    : `${rows.length} checks, ${blocked.length} HARD failures.`,
  '',
].join('\n')

await Bun.write('bench/report.md', report)
console.log(report)

if (collectedNothing || blocked.length > 0) process.exit(1)
