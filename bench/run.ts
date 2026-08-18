import { checks } from './checks'

type Row = { name: string; tier: string; ok: boolean; count: number; detail: string }

const [filter, ...rest] = process.argv.slice(2)
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
