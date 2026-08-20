/**
 * ===============================================================================================
 * A scenario is one simulated shopper conversation, graded against the schema of `bench/scenarios.
 * json` — authored by a separate, parallel workflow. THIS FILE NEVER READS THAT FILE'S CONTENT AS
 * GOLD TO REGENERATE AND NEVER WRITES TO IT. Point `--file=` at a throwaway fixture to exercise
 * this runner before that file lands (see the schema-shaped types below for exactly what it must
 * contain).
 *
 * Drives the SAME real, paid intake path `bench/checks/transcript.ts` does — `proposeChips` in
 * `apps/platform/chat.ts` — and follows that file's conventions: one `createBrain(catalog)` per
 * scenario, one `proposeChips` + `step()` per turn, exactly as `apps/platform/server.ts`'s
 * `/v1/chat` handler and `packages/agent/src/converse.ts`'s `run()` do on a live turn. Grading is
 * against STRUCTURE (FSM state, which tags are constrained on, the true match count) rather than
 * prose or exact chip wording, for the same reason `transcript.ts`'s own header gives for not
 * pinning an LLM's reading to bytes.
 *
 * COST CONTROL — this is NOT part of `bun bench` (it is not registered in `bench/checks.ts`) and
 * NOT part of `bun run test` (it is not a `*.test.ts` file, so Bun's test walk never collects it —
 * see `bench/no-empty-test-run.sh`). It is a separate, opt-in entry point that spends one real
 * Anthropic call per scenario TURN, memoised by (shop, exact turn text) so a repeated message
 * across scenarios is bought once:
 *
 *   bun run scenarios                                   # bench/scenarios.json, every scenario
 *   bun run bench/checks/scenarios.ts --only=obstacle    # id-substring filter
 *   bun run bench/checks/scenarios.ts --file=/tmp/x.json # a throwaway fixture instead
 *
 * A 40-scenario sweep at ~1.3-1.5 turns/scenario averages roughly 50-60 paid calls. The exact call
 * count made is printed at the end of every run.
 * ===============================================================================================
 */

import { chatEnabled, proposeChips } from '../../apps/platform/chat'
import type { Reading } from '../../apps/platform/chat'
import { loadCatalog } from '../../packages/agent/src/brain/catalog'
import { createBrain, step } from '../../packages/agent/src/brain/fsm'
import type { BrainState, BrainStateName } from '../../packages/agent/src/brain/fsm'
import type { ParsedChip } from '../../packages/agent/src/brain/parse'
import { intersect } from '../../packages/agent/src/brain/retrieve'
import type { Block, Product } from '../../packages/agent/src/types'

/**
 * `MAXIMAL_LLM` is opt-IN and fails closed [chat.ts]. This check IS the opt-in, same reasoning as
 * `transcript.ts`'s identical line: a bare invocation with no override would otherwise measure
 * nothing and say so in a way that reads like a bug. `??=` never overwrites an explicit export,
 * including an explicit `MAXIMAL_LLM=0`.
 */
process.env.MAXIMAL_LLM ??= '1'

// ===== The schema (bench/scenarios.json) — fixed, this file only ever READS it. ==================

type ExpectState = 'recommend' | 'obstacle' | 'clarify' | 'act'

type Expect = {
  state: ExpectState
  mustIncludeTags?: string[]
  mustNotIncludeTags?: string[]
  anyOfExpected?: boolean
  maxPrice?: number
  minProducts?: number
  maxProducts?: number
  unsupportedExpected?: boolean
  droppedExpected?: string[]
}

type Scenario = {
  id: string
  shop: 'kracht' | 'velde'
  kind: 'happy' | 'sad' | 'multi-turn' | 'adversarial'
  turns: string[]
  expect: Expect
}

// ===== Runtime validation of untrusted JSON off disk. No `as` anywhere [ENGINEERING §1.4]. =======

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

function isShop(value: unknown): value is Scenario['shop'] {
  return value === 'kracht' || value === 'velde'
}

function isKind(value: unknown): value is Scenario['kind'] {
  return value === 'happy' || value === 'sad' || value === 'multi-turn' || value === 'adversarial'
}

function isExpectState(value: unknown): value is ExpectState {
  return value === 'recommend' || value === 'obstacle' || value === 'clarify' || value === 'act'
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined
  if (!isStringArray(value)) throw new Error(`expect.${field} must be a string array`)
  return value
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`expect.${field} must be a finite number`)
  }
  return value
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`expect.${field} must be a boolean`)
  return value
}

function parseExpect(value: unknown): Expect {
  if (!isRecord(value)) throw new Error('expect must be an object')
  if (!isExpectState(value.state)) {
    throw new Error(
      `expect.state must be one of recommend/obstacle/clarify/act, got ${JSON.stringify(value.state)}`,
    )
  }
  return {
    state: value.state,
    mustIncludeTags: optionalStringArray(value.mustIncludeTags, 'mustIncludeTags'),
    mustNotIncludeTags: optionalStringArray(value.mustNotIncludeTags, 'mustNotIncludeTags'),
    anyOfExpected: optionalBoolean(value.anyOfExpected, 'anyOfExpected'),
    maxPrice: optionalNumber(value.maxPrice, 'maxPrice'),
    minProducts: optionalNumber(value.minProducts, 'minProducts'),
    maxProducts: optionalNumber(value.maxProducts, 'maxProducts'),
    unsupportedExpected: optionalBoolean(value.unsupportedExpected, 'unsupportedExpected'),
    droppedExpected: optionalStringArray(value.droppedExpected, 'droppedExpected'),
  }
}

function parseScenario(value: unknown, index: number): Scenario {
  if (!isRecord(value)) throw new Error(`scenarios[${index}] must be an object`)
  const { id, shop, kind, turns } = value
  if (typeof id !== 'string' || id === '') {
    throw new Error(`scenarios[${index}].id must be a non-empty string`)
  }
  if (!isShop(shop)) {
    throw new Error(
      `scenarios[${index}] (${id}).shop must be "kracht" or "velde", got ${JSON.stringify(shop)}`,
    )
  }
  if (!isKind(kind)) {
    throw new Error(
      `scenarios[${index}] (${id}).kind must be happy/sad/multi-turn/adversarial, got ${JSON.stringify(kind)}`,
    )
  }
  if (!isStringArray(turns) || turns.length === 0) {
    throw new Error(`scenarios[${index}] (${id}).turns must be a non-empty string array`)
  }
  return { id, shop, kind, turns, expect: parseExpect(value.expect) }
}

/** Throws loudly on the first malformed entry [ENGINEERING §2.9] rather than skipping it — a
 *  scenario that silently dropped out of a sweep would under-report, not over-report, coverage. */
function parseScenarioFile(data: unknown): Scenario[] {
  if (!isRecord(data) || !Array.isArray(data.scenarios)) {
    throw new Error('scenario file must be a JSON object with a "scenarios" array')
  }
  const scenarios = data.scenarios.map((s, i) => parseScenario(s, i))
  const seen = new Set<string>()
  for (const s of scenarios) {
    if (seen.has(s.id)) throw new Error(`duplicate scenario id "${s.id}"`)
    seen.add(s.id)
  }
  return scenarios
}

// ===== Catalog + merchant strings, loaded once per shop and cached [transcript.ts idiom]. ========

const CATALOG_PATH: Record<Scenario['shop'], string> = {
  kracht: 'packages/agent/src/brain/catalog.kracht.json',
  velde: 'packages/agent/src/brain/catalog.velde.json',
}
const CONFIG_PATH: Record<Scenario['shop'], string> = {
  kracht: 'apps/platform/config/kracht.json',
  velde: 'apps/platform/config/velde.json',
}

const catalogs = new Map<string, Promise<Product[]>>()
function catalogFor(shop: Scenario['shop']): Promise<Product[]> {
  const held = catalogs.get(shop)
  if (held !== undefined) return held
  const pending = loadCatalog(CATALOG_PATH[shop])
  catalogs.set(shop, pending)
  return pending
}

/** `chipsFrom` reads chip LABELS out of this — the merchant's own config, not the model. Mirrors
 *  `transcript.ts`'s private `stringsFor`, duplicated rather than imported because that function
 *  is not exported and this is plumbing, not the gold logic the task said not to duplicate. */
async function loadStrings(shop: Scenario['shop']): Promise<Record<string, string>> {
  const config: unknown = await Bun.file(CONFIG_PATH[shop]).json()
  if (!isRecord(config) || !isRecord(config.strings)) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(config.strings)) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}
const stringsCache = new Map<string, Promise<Record<string, string>>>()
function stringsFor(shop: Scenario['shop']): Promise<Record<string, string>> {
  const held = stringsCache.get(shop)
  if (held !== undefined) return held
  const pending = loadStrings(shop)
  stringsCache.set(shop, pending)
  return pending
}

// ===== One paid call per (shop, exact turn text), whichever scenario asks for it first. ==========

const readings = new Map<string, Promise<Reading | null>>()

async function fetchReading(shop: Scenario['shop'], text: string): Promise<Reading | null> {
  const [catalog, strings] = await Promise.all([catalogFor(shop), stringsFor(shop)])
  return proposeChips(text, catalog, strings)
}

/** Same shape as `transcript.ts`'s `readingFor`: synchronous get-or-set on the Map, so two
 *  scenarios racing on the identical (shop, text) pair never buy the reading twice — there is no
 *  `await` between the `.get` and the `.set` below, so a concurrent caller always finds the first
 *  caller's promise already installed. */
function readingFor(shop: Scenario['shop'], text: string): Promise<Reading | null> {
  const key = `${shop} ${text}`
  const held = readings.get(key)
  const pending = held ?? fetchReading(shop, text)
  if (held === undefined) readings.set(key, pending)
  return pending
}

// ===== Grading. Everything here is pure — no network — so `selfCheck` below can exercise it. =====

const RESULT_CAP = 6 // ponytail: mirrors fsm.ts's private RESULT_CAP (not exported). If that
// number ever moves, this one has to move with it — bump both, or export RESULT_CAP from fsm.ts
// and import it here instead.

/** "Constrained on" — active only. A dropped chip stays in the row struck through [ENGINEERING
 *  §2.10] and must NOT count, or a retraction scenario could never satisfy `mustNotIncludeTags`.
 *  Satisfied by a plain tag chip OR by a tag inside an active `any-of` (goal) chip — both are
 *  "constrained on" per the task's grading rule for `mustIncludeTags`. */
function hasActiveTag(chips: ParsedChip[], tag: string): boolean {
  return chips.some((c) => {
    if (c.state !== 'active') return false
    if (c.kind.type === 'tag') return c.kind.tag === tag
    if (c.kind.type === 'any-of') return c.kind.tags.includes(tag)
    return false
  })
}

function hasActiveAnyOf(chips: ParsedChip[]): boolean {
  return chips.some((c) => c.state === 'active' && c.kind.type === 'any-of')
}

/** The TRUE match set — `intersect` over the active chips, independent of the RESULT_CAP that
 *  `evaluate()` [fsm.ts] applies only to which cards get rendered. `minProducts`/`maxProducts`/
 *  `maxPrice` all grade against this, never against the capped card count. */
function activeMatches(state: BrainState): Product[] {
  return intersect(
    state.chips.filter((c) => c.state === 'active'),
    state.catalog,
  )
}

function capFailure(cardCount: number): string | null {
  return cardCount > RESULT_CAP
    ? `card count ${cardCount} exceeds RESULT_CAP (${RESULT_CAP}) — evaluate() must cap ` +
        'product-card blocks regardless of the true match count'
    : null
}

/**
 * Grades every `expect` field that is PRESENT, against the FSM state after the last turn. Pure —
 * no network, no I/O — so `selfCheck` can drive it with hand-built fixtures.
 *
 * `unsupportedExpected` and `droppedExpected` grade the LAST TURN's raw reading specifically (a
 * disclosure or a retraction is something a TURN does), not the accumulated row — an earlier
 * turn's still-standing unsupported chip must not retroactively satisfy a later scenario that
 * never re-disclosed it. `state`/`mustIncludeTags`/`mustNotIncludeTags`/`anyOfExpected`/
 * `maxPrice`/`minProducts`/`maxProducts` all grade the ACCUMULATED row instead, because a
 * constraint from turn one that nothing retracted is still constraining after turn three.
 */
// Each grader below is one `expect` field, split out of a single `gradeExpect` purely to stay
// under Biome's cognitive-complexity cap (measured at 29 against a cap of 15 as one function) —
// no behaviour moved, `gradeExpect` is still the one place that decides which fields ran.
function gradeState(expect: Expect, state: BrainState): string[] {
  return state.state !== expect.state
    ? [`state: expected "${expect.state}", got "${state.state}"`]
    : []
}

function gradeMustInclude(expect: Expect, chips: ParsedChip[]): string[] {
  return (expect.mustIncludeTags ?? [])
    .filter((tag) => !hasActiveTag(chips, tag))
    .map((tag) => `mustIncludeTags: "${tag}" is not constrained on`)
}

function gradeMustNotInclude(expect: Expect, chips: ParsedChip[]): string[] {
  return (expect.mustNotIncludeTags ?? [])
    .filter((tag) => hasActiveTag(chips, tag))
    .map((tag) => `mustNotIncludeTags: "${tag}" is constrained on but should not be`)
}

function gradeAnyOf(expect: Expect, chips: ParsedChip[]): string[] {
  if (expect.anyOfExpected === undefined) return []
  const anyOf = hasActiveAnyOf(chips)
  return anyOf !== expect.anyOfExpected
    ? [`anyOfExpected: expected ${expect.anyOfExpected}, got ${anyOf}`]
    : []
}

// 0/absent = no budget named [schema]. Graded against the TRUE match set, not the capped cards,
// and independently of whichever chip (if any) the model produced — the same "does not trust the
// brain's own filtering" posture `transcript.ts`'s `assertQuantifiedCost` takes.
function gradeMaxPrice(expect: Expect, state: BrainState): string[] {
  if (expect.maxPrice === undefined || expect.maxPrice <= 0) return []
  const maxPrice = expect.maxPrice
  const over = activeMatches(state).filter((p) => p.price > maxPrice)
  if (over.length === 0) return []
  return [
    `maxPrice: ${over.length} matched product(s) exceed €${maxPrice}: ` +
      over.map((p) => `${p.id} at €${p.price}`).join(', '),
  ]
}

function gradeProductCount(expect: Expect, state: BrainState): string[] {
  const matchCount = activeMatches(state).length
  const failures: string[] = []
  if (expect.minProducts !== undefined && matchCount < expect.minProducts) {
    failures.push(
      `minProducts: expected >= ${expect.minProducts} true match(es), got ${matchCount}`,
    )
  }
  if (
    expect.maxProducts !== undefined &&
    expect.maxProducts > 0 &&
    matchCount > expect.maxProducts
  ) {
    failures.push(
      `maxProducts: expected <= ${expect.maxProducts} true match(es), got ${matchCount}`,
    )
  }
  return failures
}

function gradeUnsupported(expect: Expect, lastReading: Reading | null): string[] {
  if (expect.unsupportedExpected === undefined) return []
  const disclosed = lastReading?.chips.some((c) => c.kind.type === 'unsupported') ?? false
  return disclosed !== expect.unsupportedExpected
    ? [`unsupportedExpected: expected ${expect.unsupportedExpected}, got ${disclosed}`]
    : []
}

function gradeDropped(expect: Expect, lastReading: Reading | null): string[] {
  return (expect.droppedExpected ?? [])
    .filter((tag) => !(lastReading?.dropped.includes(`chip-${tag}`) ?? false))
    .map((tag) => `droppedExpected: "${tag}" was not retracted by the last turn`)
}

function gradeExpect(scenario: Scenario, state: BrainState, lastReading: Reading | null): string[] {
  const { expect } = scenario
  return [
    ...gradeState(expect, state),
    ...gradeMustInclude(expect, state.chips),
    ...gradeMustNotInclude(expect, state.chips),
    ...gradeAnyOf(expect, state.chips),
    ...gradeMaxPrice(expect, state),
    ...gradeProductCount(expect, state),
    ...gradeUnsupported(expect, lastReading),
    ...gradeDropped(expect, lastReading),
  ]
}

// ===== Running one scenario: createBrain once, then proposeChips + step() per turn. ==============

type ScenarioResult = {
  id: string
  shop: Scenario['shop']
  kind: Scenario['kind']
  pass: boolean
  failures: string[]
  chipIds: string[]
  state: BrainStateName
  matchCount: number
  cardCount: number
  turnsRead: number
}

function summarize(
  scenario: Scenario,
  state: BrainState,
  blocks: Block[],
  turnsRead: number,
): Omit<ScenarioResult, 'pass' | 'failures'> {
  return {
    id: scenario.id,
    shop: scenario.shop,
    kind: scenario.kind,
    chipIds: state.chips.map((c) => c.id),
    state: state.state,
    matchCount: activeMatches(state).length,
    cardCount: blocks.filter((b) => b.kind === 'product-card').length,
    turnsRead,
  }
}

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const catalog = await catalogFor(scenario.shop)
  let state = createBrain(catalog)
  let blocks: Block[] = []
  let lastReading: Reading | null = null

  for (const [i, turn] of scenario.turns.entries()) {
    const reading = await readingFor(scenario.shop, turn)
    // A null reading is a hard failure with its own distinct reason, never graded as an empty
    // reading [task spec] — the endpoint could not read this turn at all, so nothing past this
    // point (chip row, FSM state, match count) means anything.
    if (reading === null) {
      return {
        ...summarize(scenario, state, blocks, i),
        pass: false,
        failures: [
          `turn ${i + 1} (${JSON.stringify(turn)}) could not be read — the intake endpoint ` +
            'returned null (timeout, provider error, or a refused tool call)',
        ],
      }
    }
    lastReading = reading
    const stepped = step(state, { type: 'message', chips: reading.chips, dropped: reading.dropped })
    state = stepped.state
    blocks = stepped.blocks
  }

  const base = summarize(scenario, state, blocks, scenario.turns.length)
  const failures = gradeExpect(scenario, state, lastReading)
  const capIssue = capFailure(base.cardCount)
  if (capIssue !== null) failures.push(capIssue)
  return { ...base, pass: failures.length === 0, failures }
}

// ===== A small concurrency-capped pool — no scenario waits on the whole sweep to start. ==========

async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  // A shared cursor, not a pre-split chunk list: each `next++` is a synchronous read-modify-write,
  // so two concurrently-running lanes can never claim the same index, and a lane that finishes its
  // item early immediately picks up the next unclaimed one instead of sitting idle.
  let next = 0
  async function lane(): Promise<void> {
    while (next < items.length) {
      const index = next++
      const item = items[index]
      if (item === undefined) continue
      results[index] = await worker(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
  return results
}

// ===== CLI + reporting. =====

const CONCURRENCY = 4
const DEFAULT_FILE = 'bench/scenarios.json'

function parseArgs(argv: string[]): { file: string; only: string | undefined } {
  let file = DEFAULT_FILE
  let only: string | undefined
  for (const arg of argv) {
    if (arg.startsWith('--only=')) only = arg.slice('--only='.length)
    else if (arg.startsWith('--file=')) file = arg.slice('--file='.length)
  }
  return { file, only }
}

function formatLine(r: ScenarioResult): string {
  const head = r.pass ? 'PASS' : 'FAIL'
  const read =
    `state=${r.state} chips=${r.chipIds.join(',') || '(none)'} ` +
    `matches=${r.matchCount} cards=${r.cardCount} turns=${r.turnsRead}`
  const reason = r.pass ? '' : ` — ${r.failures[0]}`
  return `${head} ${r.id} [${r.shop}/${r.kind}]${reason} — read: ${read}`
}

async function main(): Promise<void> {
  selfCheck()

  if (!chatEnabled()) {
    throw new Error(
      'bench/checks/scenarios.ts drives the REAL intake endpoint and no model is reachable: set ' +
        'ANTHROPIC_API_KEY (e.g. in .env.local) and do not set MAXIMAL_LLM=0. There is no offline ' +
        'mode for this runner — the regex parser it would have measured is deleted.',
    )
  }

  const { file, only } = parseArgs(process.argv.slice(2))
  if (!(await Bun.file(file).exists())) {
    throw new Error(`scenario file not found: ${file} (use --file=<path> to point at a fixture)`)
  }
  const data: unknown = await Bun.file(file).json()
  let scenarios = parseScenarioFile(data)
  if (only !== undefined) scenarios = scenarios.filter((s) => s.id.includes(only))
  if (scenarios.length === 0) {
    throw new Error(`no scenarios to run${only ? ` matching --only=${only}` : ''} (from ${file})`)
  }

  const results = await pool(scenarios, CONCURRENCY, runScenario)
  const sorted = [...results].sort((a, b) => a.id.localeCompare(b.id))
  for (const r of sorted) console.log(formatLine(r))

  const passed = sorted.filter((r) => r.pass).length
  const byKind = new Map<string, { pass: number; total: number }>()
  for (const r of sorted) {
    const row = byKind.get(r.kind) ?? { pass: 0, total: 0 }
    row.total++
    if (r.pass) row.pass++
    byKind.set(r.kind, row)
  }
  const byKindObj: Record<string, { pass: number; total: number }> = {}
  for (const [k, v] of byKind) byKindObj[k] = v
  const kindSummary = [...byKind.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k} ${v.pass}/${v.total}`)
    .join(', ')

  const rate = sorted.length > 0 ? ((passed / sorted.length) * 100).toFixed(0) : '0'
  console.log('')
  console.log(`${sorted.length} scenario(s): ${passed}/${sorted.length} passed (${rate}%)`)
  console.log(`by kind: ${kindSummary}`)
  console.log(`${readings.size} paid call(s) made (one per unique (shop, turn text) pair)`)

  await Bun.write(
    'bench/scenario-report.json',
    `${JSON.stringify(
      {
        scenarios: sorted,
        summary: {
          total: sorted.length,
          passed,
          failed: sorted.length - passed,
          byKind: byKindObj,
          callCount: readings.size,
        },
      },
      null,
      2,
    )}\n`,
  )
  console.log('wrote bench/scenario-report.json')

  if (passed < sorted.length) process.exit(1)
}

// Non-trivial logic (a parser, several branches, a hand-rolled concurrency pool) leaves ONE
// runnable check behind (universal DoD) — everything exercised here is pure, no network, so it
// costs nothing and runs on every invocation, including the real paid one, catching a grading
// regression before a call is ever bought. The model's own accuracy is a separate question,
// answered live by the rest of this file — same split fsm.ts's self-check draws against
// `bench/checks/transcript.ts`.
function selfCheck(): void {
  let count = 0
  const check = (condition: boolean, message: string): void => {
    count++
    if (!condition) throw new Error(`scenarios.ts self-check failed: ${message}`)
  }
  const rejects = (thunk: () => void): boolean => {
    try {
      thunk()
      return false
    } catch {
      return true
    }
  }

  const parsed = parseScenarioFile({
    scenarios: [
      { id: 'a', shop: 'kracht', kind: 'happy', turns: ['hi'], expect: { state: 'clarify' } },
    ],
  })
  check(parsed.length === 1 && parsed[0]?.id === 'a', 'a well-formed scenario file must parse')
  check(
    rejects(() =>
      parseScenarioFile({
        scenarios: [
          { id: 'a', shop: 'nope', kind: 'happy', turns: ['hi'], expect: { state: 'clarify' } },
        ],
      }),
    ),
    'an unknown shop must be rejected',
  )
  check(
    rejects(() =>
      parseScenarioFile({
        scenarios: [
          { id: 'x', shop: 'kracht', kind: 'happy', turns: [], expect: { state: 'clarify' } },
        ],
      }),
    ),
    'an empty turns array must be rejected',
  )
  check(
    rejects(() =>
      parseScenarioFile({
        scenarios: [
          { id: 'dup', shop: 'kracht', kind: 'happy', turns: ['hi'], expect: { state: 'clarify' } },
          { id: 'dup', shop: 'velde', kind: 'happy', turns: ['hi'], expect: { state: 'clarify' } },
        ],
      }),
    ),
    'a duplicate scenario id must be rejected',
  )

  const chips: ParsedChip[] = [
    { id: 'chip-black', label: 'black', state: 'dropped', kind: { type: 'tag', tag: 'black' } },
    { id: 'chip-navy', label: 'navy', state: 'active', kind: { type: 'tag', tag: 'navy' } },
    {
      id: 'chip-any-creatine-protein',
      label: 'creatine or protein',
      state: 'active',
      kind: { type: 'any-of', tags: ['creatine', 'protein'] },
    },
  ]
  check(hasActiveTag(chips, 'navy'), 'an active tag chip must count as constrained on')
  check(!hasActiveTag(chips, 'black'), 'a DROPPED tag chip must not count as constrained on')
  check(
    hasActiveTag(chips, 'creatine'),
    'a tag inside an active any-of chip must count as constrained on',
  )
  check(hasActiveAnyOf(chips), 'an active any-of chip must be detected')

  check(capFailure(RESULT_CAP + 1) !== null, 'a card count above RESULT_CAP must fail')
  check(capFailure(RESULT_CAP) === null, 'a card count at RESULT_CAP must not fail')

  const state: BrainState = { state: 'recommend', chips, catalog: [] }
  const reading: Reading = { chips, dropped: [] }
  const failing = gradeExpect(
    {
      id: 's',
      shop: 'kracht',
      kind: 'happy',
      turns: ['x'],
      expect: { state: 'recommend', mustNotIncludeTags: ['navy'] },
    },
    state,
    reading,
  )
  check(
    failing.some((f) => f.includes('navy')),
    'mustNotIncludeTags must fail loudly when the tag IS constrained on',
  )
  const passing = gradeExpect(
    {
      id: 's',
      shop: 'kracht',
      kind: 'happy',
      turns: ['x'],
      expect: { state: 'recommend', anyOfExpected: true },
    },
    state,
    reading,
  )
  check(passing.length === 0, 'a satisfied expectation must produce zero failures')

  check(count > 0, 'self-check made zero assertions')
  console.log(`scenarios.ts self-check: ${count} assertions passed`)
}

if (import.meta.main) {
  await main()
}
