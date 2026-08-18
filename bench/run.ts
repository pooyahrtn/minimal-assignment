import { checks } from './checks'

type Row = { name: string; tier: string; ok: boolean; count: number; detail: string }

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
    const { count, detail } = await check.run(rest)
    // A check that collected nothing has proven nothing, whatever it returned.
    rows.push({ name: check.name, tier: check.tier, ok: count > 0, count, detail })
  } catch (error) {
    rows.push({
      name: check.name,
      tier: check.tier,
      ok: false,
      count: 0,
      detail: error instanceof Error ? error.message : String(error),
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
  '| check | tier | result | cases | detail |',
  '|---|---|---|---|---|',
  ...rows.map(
    (r) => `| ${r.name} | ${r.tier} | ${r.ok ? 'pass' : 'FAIL'} | ${r.count} | ${r.detail} |`,
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
