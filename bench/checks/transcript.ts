import type { Check } from '../checks'
import { chatEnabled, proposeChips } from '../../apps/platform/chat'
import type { Reading } from '../../apps/platform/chat'
import { loadCatalog } from '../../packages/agent/src/brain/catalog'
import type { BrainState } from '../../packages/agent/src/brain/fsm'
import { createBrain, step } from '../../packages/agent/src/brain/fsm'
import type { ParsedChip } from '../../packages/agent/src/brain/parse'
import { findObstacle } from '../../packages/agent/src/brain/obstacle'
import { intersect } from '../../packages/agent/src/brain/retrieve'
import type { Block, Product } from '../../packages/agent/src/types'

// ===============================================================================================
// H3 (BENCHMARKS §1). THIS CHECK CALLS A PAID API. Every case below drives the REAL intake path —
// `proposeChips` in `apps/platform/chat.ts`, the same function `POST /v1/chat` calls — because the
// regex parser it used to measure is deleted and the model is the only intake path there is.
// Nothing here is recorded, mocked or fixtured [DECISIONS-LOG: T13's "Degrade, never break"
// overridden by ENGINEERING §2.9].
//
// `proposeChips` directly rather than an HTTP round trip to :4003: the seam under test is the
// reading, not the router, and the route adds only body validation and a shop-key lookup that
// `bench/checks/budget.ts` already exercises over real HTTP. Going through the port would make
// this check need a running server to say anything about the model.
//
// -----------------------------------------------------------------------------------------------
// GOLD TOLERANCE — read this before adding an assertion.
//
// H3 is specced as "byte-exact match, or a diff", and the previous version of this file claimed
// exactly that (structural deep-equality on the whole block array). **That claim is now false and
// is not being quietly kept.** The blocks are produced downstream of a language model, and pinning
// an LLM to bytes buys a gate that goes red on a rephrasing rather than on a regression — which
// trains people to run `--accept`, and a gold file nobody trusts is worse than no gold file.
//
// So the comparison is deliberately relaxed to the two properties that are NOT the model's to
// vary, and both are compared exactly:
//
//   1. **The block KIND sequence**, in order. `chips-update > product-card > product-card` is the
//      FSM's decision, not the model's: given a chip set, which branch of `evaluate` ran and how
//      many products came back is arithmetic. A reversed sort, a lost no-match block or a card
//      that stopped rendering all fail here.
//   2. **The chip SET** — every chip's `id`, `state`, `kind` and `label`, order-insensitive.
//      This is the reading itself plus the label lookup. `id`/`kind` catch the model reading a
//      different constraint; `state` catches a retraction going missing; `label` catches the
//      merchant's config drifting [PRINCIPLES §8: computed, never generated]. Chip ORDER is
//      excluded because it follows the order the model happened to name the tags in, which is
//      the one thing here that legitimately varies.
//
// NOT compared, and this is the honest cost of the relaxation: product payload bytes, every prose
// string, and the near-miss list inside a `no-match` block. A change that alters a product's title
// or a near-miss price without changing the chip set or the block sequence will not fail this
// check. `shell.test.ts` pins the obstacle sentence's arithmetic against the real catalogs, and
// `assertQuantifiedCost` below independently re-derives every quoted gap from the catalog, so the
// numbers are not unguarded — they are just not guarded HERE, by gold.
//
// Gold files are human-owned [BENCHMARKS §4.1]. The existing `bench/gold/*.json` were NOT
// regenerated for this change and did not need to be: the model returns the same chip ids, states,
// kinds and labels the regex parser did on both verbatim opening messages, and the same block
// sequence follows. `--accept` still writes the FULL block array, byte-formatted through Biome —
// the tolerance is on the read side only, so a human reviewing a gold diff still sees everything.
//
// COVERAGE LIMIT (unchanged, and worth restating): gold pins two fixed opening messages against
// two catalogs. A behaviour change invisible in those two transcripts is unpinned.
// ===============================================================================================

/**
 * This check IS the opt-in when `bench/run.ts` drives it (`bun bench` / `bun bench transcript`):
 * `chat.ts` requires `MAXIMAL_LLM=1` as a kill switch that fails closed, right for a server and
 * wrong for the one gate whose entire job is to call the model — a bare `bun bench` would
 * otherwise measure nothing and say so in a way that reads like a bug. The key still has to be
 * real; see the throw in `readingFor`.
 *
 * It must NOT fire under `bun test`. `bench/fault.test.ts` imports this module too, and forcing
 * the switch on unconditionally turned the free, deterministic `bun run test` gate into ~2
 * uncached paid calls on every run, each bounded by chat.ts's 8s AbortSignal — a slow turn or a
 * provider hiccup failed the plain gate on an unchanged tree for a reason nobody asked it to
 * accept. `bun test` sets `NODE_ENV=test` before running a file and `bun run` does not (verified
 * locally), so that is the signal used below rather than a second one invented for this — it is
 * the same distinction the `.env.local` shim a few lines down already leans on. Explicitly
 * exporting `MAXIMAL_LLM=1` still opts a `bun test` run in; this only removes the automatic force.
 */
if (process.env.NODE_ENV !== 'test') process.env.MAXIMAL_LLM ??= '1'

/**
 * `.env.local`, loaded by hand, because Bun does not load it under `bun test`. Bun sets
 * `NODE_ENV=test` there and then reads `.env.test.local` instead — so `bun bench` (which is a
 * `bun run`) saw the key and `bun run test` did not, and `bench/fault.test.ts` drives this very
 * check. The alternative was a second copy of a live API key in a second gitignored file, which is
 * a worse thing to have on a laptop than six lines here. Never overwrites an existing variable, so
 * an explicitly exported key or `MAXIMAL_LLM=0` still wins.
 */
if ((process.env.ANTHROPIC_API_KEY ?? '') === '') {
  const envFile = Bun.file(`${import.meta.dir}/../../.env.local`)
  const text = (await envFile.exists()) ? await envFile.text() : ''
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    const name = match?.[1]
    if (name === undefined || process.env[name] !== undefined) continue
    process.env[name] = (match?.[2] ?? '').replace(/^["']|["']$/g, '')
  }
}

// Verbatim, PRINCIPLES §8.
const KRACHT_MESSAGE =
  "I'm after a protein shake with no sweeteners, lactose-free, and ideally under €30."
const VELDE_MESSAGE =
  'I need a jacket I can wear to the office and on the bike. Black, nothing shiny, and ideally under €250.'

// Invented for this check: the same constraints as the opening messages above, reworded and
// reordered. Against the regex parser this proved a synonym map rather than a whole-sentence
// match. Against a model it proves something better and harder — that the READING is a property
// of what was asked for and not of how it was phrased, which is the entire claim of replacing the
// parser with a model.
const KRACHT_PERTURBED =
  'Ideally I want to stay under €30 -- dairy-free and unsweetened, basically a whey protein powder without any of that stuff.'
const VELDE_PERTURBED =
  'Looking for something in matte black, no shine at all, that works for cycling to the office and back -- a jacket essentially, max €250 please.'

type MessageCase = { label: string; message: string; perturbed: string }

const CASES: MessageCase[] = [
  { label: 'kracht opening (protein shake)', message: KRACHT_MESSAGE, perturbed: KRACHT_PERTURBED },
  { label: 'velde opening (jacket)', message: VELDE_MESSAGE, perturbed: VELDE_PERTURBED },
]

/**
 * GOAL-shaped messages: the shopper names an OUTCOME rather than an attribute. The two KRACHT
 * cases are real text, not invented for this file — exactly what was measured live against both
 * catalogs (MAXIMAL_LLM=1, a real Anthropic call) when `search_products` gained its `goal` field,
 * kept here to pin that measurement rather than approximate it. The VELDE case is NOT that
 * measurement: the message originally pinned here ("something for cycling to work") named a
 * situation one jacket must satisfy, which the settled tags-vs-goal boundary reads as `tags`, not
 * `goal` — so it was replaced with a message that is actually goal-shaped under that boundary.
 * `brand` is a plain string, not `GoldBrand['name']`, so this stays a flat literal table instead
 * of fighting a `Record` over a non-literal key — matched against `GOLD_BRANDS` by `.find()`
 * below, exactly as `compareAllGold` already does.
 */
type GoalCase = { label: string; brand: string; message: string; budget?: number }

const GOAL_CASES: GoalCase[] = [
  { label: 'kracht goal (gain muscle)', brand: 'kracht', message: 'I want to gain muscle' },
  {
    label: 'kracht goal (gain muscle) + budget',
    brand: 'kracht',
    message: 'I want to gain muscle, nothing over 25 euro',
    budget: 25,
  },
  {
    // "cycling to work" named a situation one jacket must satisfy (tags:[bike, office]) and is
    // NOT this any more [tags-vs-goal boundary, chat.ts]. Warmth is: no product type named, and
    // the honest answer is two disjoint KINDS — every `outerwear`/`jacket` item and every
    // `knitwear` item is a winter-warm piece on its own, same as protein/creatine above.
    label: 'velde goal (staying warm)',
    brand: 'velde',
    message: 'I want to stay warm this winter',
  },
]

// Which real catalog a gold file pins, and which of CASES it was generated from. Matched by
// filename, not a hardcoded brand check in `brain/` — this table lives in bench/, which T4's
// "no velde/kracht in brain/" rule does not reach.
type GoldBrand = {
  name: string
  catalogPath: string
  configPath: string
  goldPath: string
  caseLabel: string
}

const GOLD_BRANDS: GoldBrand[] = [
  {
    name: 'velde',
    catalogPath: 'packages/agent/src/brain/catalog.velde.json',
    configPath: 'apps/platform/config/velde.json',
    goldPath: 'bench/gold/velde.json',
    caseLabel: 'velde opening (jacket)',
  },
  {
    name: 'kracht',
    catalogPath: 'packages/agent/src/brain/catalog.kracht.json',
    configPath: 'apps/platform/config/kracht.json',
    goldPath: 'bench/gold/kracht.json',
    caseLabel: 'kracht opening (protein shake)',
  },
]

function detectBrand(catalogPath: string): GoldBrand | undefined {
  return GOLD_BRANDS.find((b) => catalogPath.endsWith(`catalog.${b.name}.json`))
}

/**
 * The merchant's `strings` payload, for the chip LABELS only — `chipsFrom` reads
 * `chip.label.<tag>` out of it, exactly as `server.ts` hands it to `proposeChips` on a live turn.
 * A catalog with no matching brand config gets `{}`, which labels every chip with its own tag.
 */
async function stringsFor(catalogPath: string): Promise<Record<string, string>> {
  const brand = detectBrand(catalogPath)
  if (brand === undefined) return {}
  const config: unknown = await Bun.file(brand.configPath).json()
  if (typeof config !== 'object' || config === null) return {}
  const strings: unknown = Reflect.get(config, 'strings')
  if (typeof strings !== 'object' || strings === null) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(strings)) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

/**
 * One paid call per (catalog, message) pair per process, however many times a case is re-run.
 * `compareAllGold`, the `--expect` sweep and `accept()` all walk the same handful of messages, and
 * without this a bare `bun bench` would buy the same reading three times over.
 */
const readings = new Map<string, Promise<Reading | null>>()

async function readingFor(
  catalogPath: string,
  catalog: Product[],
  message: string,
): Promise<Reading> {
  if (!chatEnabled()) {
    throw new Error(
      'H3 drives the REAL intake endpoint and no model is reachable: set ANTHROPIC_API_KEY ' +
        '(e.g. in .env.local) and do not set MAXIMAL_LLM=0. This check has no offline mode — the ' +
        'regex parser it used to measure is deleted.',
    )
  }
  const key = `${catalogPath}\0${message}`
  const held = readings.get(key)
  const pending = held ?? proposeChips(message, catalog, await stringsFor(catalogPath))
  if (held === undefined) readings.set(key, pending)
  const reading = await pending
  if (reading === null) {
    throw new Error(
      `the intake endpoint could not read ${JSON.stringify(message)} against ${catalogPath} — ` +
        'a timeout, a provider error, or a refused tool call. This is the failure the widget now ' +
        'shows a shopper, so it fails the gate rather than degrading to something quieter.',
    )
  }
  return reading
}

const BIOME_BIN = `${import.meta.dir}/../../node_modules/.bin/biome`

/** Canonical formatting for gold files is "whatever Biome's own formatter does" — reusing the
 * project's one formatter instead of hand-rolling a JSON pretty-printer that has to match it. */
async function formatWithBiome(path: string): Promise<void> {
  const proc = Bun.spawn([BIOME_BIN, 'format', '--write', path], { stdout: 'pipe', stderr: 'pipe' })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`biome format --write failed on ${path}: ${stderr.trim()}`)
  }
}

async function writeFormattedJson(path: string, blocks: Block[]): Promise<void> {
  await Bun.write(path, `${JSON.stringify(blocks, null, 2)}\n`)
  await formatWithBiome(path)
}

function parseBlockArray(text: string, source: string): unknown[] {
  const data: unknown = JSON.parse(text)
  if (!Array.isArray(data)) throw new Error(`${source} is not a JSON array`)
  return data
}

/** The two properties gold compares. See the tolerance note at the top of this file. */
type GoldShape = { kinds: string[]; chips: string[] }

/**
 * Reduces a block array — whether fresh off the FSM or parsed out of a gold file — to exactly what
 * is compared. Reading both sides through the SAME function is what keeps the tolerance honest:
 * there is no way to compare a property of one side that is not extracted from the other.
 */
function chipSignatures(block: object): string[] {
  const row: unknown = Reflect.get(block, 'chips')
  if (!Array.isArray(row)) return []
  return row
    .filter((chip): chip is object => typeof chip === 'object' && chip !== null)
    .map((chip) =>
      JSON.stringify({
        id: Reflect.get(chip, 'id'),
        state: Reflect.get(chip, 'state'),
        label: Reflect.get(chip, 'label'),
        kind: Reflect.get(chip, 'kind'),
      }),
    )
}

function goldShape(blocks: unknown[]): GoldShape {
  const kinds: string[] = []
  const chips: string[] = []
  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) {
      kinds.push('<not an object>')
      continue
    }
    const kind: unknown = Reflect.get(block, 'kind')
    kinds.push(typeof kind === 'string' ? kind : '<no kind>')
    if (kind === 'chips-update') chips.push(...chipSignatures(block))
  }
  // Sorted: chip ORDER follows the order the model named the tags in and is not pinned.
  return { kinds, chips: chips.sort() }
}

function diffLines(expected: string[], actual: string[]): string {
  const missing = expected.filter((entry) => !actual.includes(entry))
  const extra = actual.filter((entry) => !expected.includes(entry))
  return [
    missing.length > 0 ? `  missing: ${missing.join('\n           ')}` : '',
    extra.length > 0 ? `  extra:   ${extra.join('\n           ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Gold comparison at the documented tolerance: exact on the block-kind SEQUENCE and on the chip
 * SET, nothing else. On mismatch it prints the real difference to the console (so a human sees
 * what moved, not just "mismatch") and throws a one-line error that also lands in report.md.
 */
async function compareToGold(brand: GoldBrand, blocks: Block[]): Promise<void> {
  const expected = goldShape(parseBlockArray(await Bun.file(brand.goldPath).text(), brand.goldPath))
  const actual = goldShape(blocks)

  if (expected.kinds.join(' > ') !== actual.kinds.join(' > ')) {
    console.error(
      `\n[${brand.caseLabel}] gold block-sequence mismatch against ${brand.goldPath}\n` +
        `  expected: ${expected.kinds.join(' > ')}\n` +
        `  actual:   ${actual.kinds.join(' > ')}\n`,
    )
    throw new Error(
      `[${brand.caseLabel}] gold block-kind sequence changed (${expected.kinds.join('>')} -> ${actual.kinds.join('>')}) — diff printed above`,
    )
  }

  if (JSON.stringify(expected.chips) !== JSON.stringify(actual.chips)) {
    console.error(
      `\n[${brand.caseLabel}] gold chip-set mismatch against ${brand.goldPath}\n` +
        `${diffLines(expected.chips, actual.chips)}\n`,
    )
    throw new Error(
      `[${brand.caseLabel}] gold chip set changed (${expected.chips.length} chip(s) expected, ${actual.chips.length} read) — diff printed above`,
    )
  }
}

function countChangedBlocks(prev: unknown[], next: unknown[]): number {
  const max = Math.max(prev.length, next.length)
  let changed = 0
  for (let i = 0; i < max; i++) {
    if (JSON.stringify(prev[i]) !== JSON.stringify(next[i])) changed++
  }
  return changed
}

/** The only place a gold file is ever written. Called only from an explicit `--accept` path
 * (BENCHMARKS §4.3 rule 3) — never from the comparison branch above. Writes the FULL block array,
 * not the compared subset: a human reviewing a gold diff should see everything that moved, even
 * the parts this check has stopped asserting on. */
async function writeGold(brand: GoldBrand, blocks: Block[]): Promise<string> {
  const existed = await Bun.file(brand.goldPath).exists()
  const previousBlocks = existed
    ? parseBlockArray(await Bun.file(brand.goldPath).text(), brand.goldPath)
    : []
  await writeFormattedJson(brand.goldPath, blocks)
  const changed = countChangedBlocks(previousBlocks, blocks)
  const verb = existed ? 'rewrote' : 'created'
  return `${verb} ${brand.goldPath}: ${blocks.length} block(s), ${changed} changed from the previous ${previousBlocks.length}`
}

type Outcome = 'empty' | 'non-empty' | 'degenerate'
type Expect = 'empty' | 'empty-unique' | 'non-empty' | null

type CaseVerdict = {
  outcome: Outcome
  dropId: string | undefined
  /** Only set for 'empty': how many chips independently rescue the intersection. Reported, never
   * thrown on by the always-on check — --expect=empty-unique is the strict opt-in. */
  rescuerCount?: number
  /** Only set for 'non-empty': how many products matched. */
  matchCount?: number
}

function chipSignature(chips: ParsedChip[]): string[] {
  return chips
    .map((c) => {
      if (c.kind.type === 'tag') return `tag:${c.kind.tag}`
      if (c.kind.type === 'price-max') return `price-max:${c.kind.max}`
      // A goal, and its EXPANSION is the signature: "gain muscle" read as protein-or-creatine on
      // one phrasing and protein alone on the reworded twin is drift, not a rewording.
      if (c.kind.type === 'any-of') return `any-of:${c.kind.tags.join('|')}`
      // Part of the signature on purpose: the perturbation check compares the signature of a
      // message against its reworded twin, and a disclosure that appears in one phrasing but not
      // the other is exactly the drift this check exists to catch.
      return `unsupported:${c.kind.phrase}`
    })
    .sort()
}

function assertChipCount(label: string, chips: ParsedChip[], minChips: number): void {
  if (chips.length < minChips) {
    throw new Error(
      `[${label}] expected >=${minChips} chips read from the opening message, got ${chips.length}: ${JSON.stringify(chips.map((c) => c.id))}`,
    )
  }
}

/**
 * The reading is a property of what was asked for, not of how it was phrased. Two paid calls, and
 * the strongest single claim in this file: it is the reason a model replaced a regex table at all.
 */
async function assertPerturbationRobust(
  caseDef: MessageCase,
  catalogPath: string,
  catalog: Product[],
): Promise<void> {
  const original = await readingFor(catalogPath, catalog, caseDef.message)
  const perturbed = await readingFor(catalogPath, catalog, caseDef.perturbed)
  const originalSig = chipSignature(original.chips)
  const perturbedSig = chipSignature(perturbed.chips)
  if (JSON.stringify(originalSig) !== JSON.stringify(perturbedSig)) {
    throw new Error(
      `[${caseDef.label}] perturbed wording changed the constraint set the model read: original ${JSON.stringify(originalSig)} vs perturbed ${JSON.stringify(perturbedSig)} (perturbed text: ${JSON.stringify(caseDef.perturbed)})`,
    )
  }
}

/** Independently recomputes which chips rescue the empty intersection — does not trust the
 * brain's own `blocking` pick. */
function findRescuers(active: ParsedChip[], catalog: Product[]): ParsedChip[] {
  return active.filter((chip) => {
    const without = active.filter((c) => c.id !== chip.id)
    return intersect(without, catalog).length > 0
  })
}

function assertQuantifiedCost(
  label: string,
  catalog: Product[],
  closest: { product: Product; gap: string }[],
): void {
  if (closest.length === 0) {
    throw new Error(`[${label}] obstacle reported zero near-miss candidates`)
  }
  for (const { product, gap } of closest) {
    const match = /€(\d+(?:\.\d+)?)/.exec(gap)
    const quoted = match?.[1]
    if (!quoted) {
      throw new Error(`[${label}] quantified gap has no real number in it: ${JSON.stringify(gap)}`)
    }
    const catalogEntry = catalog.find((p) => p.id === product.id)
    if (!catalogEntry) {
      throw new Error(`[${label}] near-miss product ${product.id} is not in the catalog at all`)
    }
    if (Number(quoted) !== catalogEntry.price) {
      throw new Error(
        `[${label}] quantified cost €${quoted} does not match ${product.id}'s catalog price €${catalogEntry.price}`,
      )
    }
  }
}

/**
 * Always-on: the brain names one blocking chip (structural — `Obstacle.blocking` is a single
 * `ParsedChip`, not a list) and dropping THAT chip genuinely rescues the intersection, with a
 * real quantified cost. Does NOT require it be the only chip that would rescue — that stronger
 * claim belongs to T8's real catalog and is gated behind --expect=empty-unique. Returns the
 * independently-recomputed rescuer count for reporting.
 */
function assertEmptyRescue(
  label: string,
  active: ParsedChip[],
  catalog: Product[],
  blocking: ParsedChip,
  blocks: Block[],
): number {
  const rescuers = findRescuers(active, catalog)
  if (!rescuers.some((c) => c.id === blocking.id)) {
    throw new Error(
      `[${label}] the brain named "${blocking.id}" as blocking, but removing it does not rescue the intersection (rescuers found: ${rescuers.map((c) => c.id).join(', ') || 'none'})`,
    )
  }
  const rescued = intersect(
    active.filter((c) => c.id !== blocking.id),
    catalog,
  )
  if (rescued.length === 0) {
    throw new Error(`[${label}] rescued set is empty after dropping the named blocking chip`)
  }
  const noMatch = blocks.some((b) => b.kind === 'no-match')
  if (!noMatch) {
    throw new Error(
      `[${label}] intersection is empty with a real rescue available, but no no-match block was emitted`,
    )
  }
  return rescuers.length
}

/** Always-on: a non-empty intersection has at least one product and never carries an obstacle
 * block. The stronger "2-4 products" bound is T8's claim about the real catalog, gated behind
 * --expect=non-empty. */
function assertSaneRecommendation(label: string, full: Product[], blocks: Block[]): void {
  if (full.length < 1) {
    throw new Error(`[${label}] non-empty branch reached with ${full.length} products`)
  }
  if (blocks.some((b) => b.kind === 'no-match')) {
    throw new Error(`[${label}] non-empty intersection still emitted a no-match/obstacle block`)
  }
}

function assertNoFalseObstacle(label: string, blocks: Block[]): void {
  if (blocks.some((b) => b.kind === 'no-match')) {
    throw new Error(
      `[${label}] no chip removal can rescue this empty intersection, yet a no-match block was emitted anyway`,
    )
  }
}

/** Drop-then-restore returns to the exact starting chip set; the dropped chip is present, never
 * evicted, throughout. */
function assertReversible(label: string, state: BrainState, dropId: string): void {
  const before = state.chips.map((c) => ({ id: c.id, state: c.state }))
  const dropped = step(state, { type: 'drop-chip', id: dropId })
  const droppedChip = dropped.state.chips.find((c) => c.id === dropId)
  if (droppedChip?.state !== 'dropped') {
    throw new Error(`[${label}] dropping chip "${dropId}" did not mark it dropped, or evicted it`)
  }
  if (dropped.state.chips.length !== state.chips.length) {
    throw new Error(
      `[${label}] chip count changed on drop: ${state.chips.length} -> ${dropped.state.chips.length}`,
    )
  }
  const restored = step(dropped.state, { type: 'restore-chip', id: dropId })
  const after = restored.state.chips.map((c) => ({ id: c.id, state: c.state }))
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(
      `[${label}] drop-then-restore did not return to the starting chip state: expected ${JSON.stringify(before)}, got ${JSON.stringify(after)}`,
    )
  }
}

function evaluateEmpty(
  label: string,
  active: ParsedChip[],
  catalog: Product[],
  blocks: Block[],
): CaseVerdict {
  const obstacle = findObstacle(active, catalog)
  if (!obstacle) {
    assertNoFalseObstacle(label, blocks)
    return { outcome: 'degenerate', dropId: active[0]?.id }
  }
  const rescuerCount = assertEmptyRescue(label, active, catalog, obstacle.blocking, blocks)
  assertQuantifiedCost(label, catalog, obstacle.closest)
  return { outcome: 'empty', dropId: obstacle.blocking.id, rescuerCount }
}

function evaluateNonEmpty(
  label: string,
  active: ParsedChip[],
  full: Product[],
  blocks: Block[],
): CaseVerdict {
  assertSaneRecommendation(label, full, blocks)
  return { outcome: 'non-empty', dropId: active[0]?.id, matchCount: full.length }
}

/**
 * `minChips` is the one thing the model made conditional. The old regex parser was fed the message
 * with NO catalog, so it read the same 3-4 constraints out of the KRACHT opening whichever catalog
 * the case was being run against. The model's vocabulary IS the catalog (`z.enum` over its real
 * tags), so a supplements sentence against a clothing catalog now correctly reads zero attributes.
 * Demanding >=3 there would fail the check for being right. It is the caller who knows whether the
 * message and the catalog belong together.
 */
async function runCase(
  caseDef: MessageCase,
  catalogPath: string,
  catalog: Product[],
  minChips: number,
): Promise<{ verdict: CaseVerdict; blocks: Block[] }> {
  const reading = await readingFor(catalogPath, catalog, caseDef.message)
  assertChipCount(caseDef.label, reading.chips, minChips)
  if (minChips > 0) await assertPerturbationRobust(caseDef, catalogPath, catalog)

  const brain = createBrain(catalog)
  const result = step(brain, {
    type: 'message',
    chips: reading.chips,
    dropped: reading.dropped,
  })
  const active = result.state.chips.filter((c) => c.state === 'active')
  const full = intersect(active, catalog)

  const verdict =
    full.length > 0
      ? evaluateNonEmpty(caseDef.label, active, full, result.blocks)
      : evaluateEmpty(caseDef.label, active, catalog, result.blocks)

  if (!verdict.dropId) {
    throw new Error(
      `[${caseDef.label}] no active chip available to test drop/restore reversibility on`,
    )
  }
  assertReversible(caseDef.label, result.state, verdict.dropId)

  return { verdict, blocks: result.blocks }
}

function parseArgs(args: string[]): {
  catalogPath: string
  /** False when the default fixture is in use — which is what a bare `bun bench` always does. */
  explicitCatalog: boolean
  expect: Expect
  accept: boolean
} {
  let catalogPath = 'packages/agent/src/brain/fixture.json'
  let explicitCatalog = false
  let expect: Expect = null
  let accept = false
  for (const arg of args) {
    if (arg === '--expect=empty') expect = 'empty'
    else if (arg === '--expect=empty-unique') expect = 'empty-unique'
    else if (arg === '--expect=non-empty') expect = 'non-empty'
    else if (arg === '--accept') accept = true
    else if (!arg.startsWith('--')) {
      catalogPath = arg
      explicitCatalog = true
    }
  }
  return { catalogPath, explicitCatalog, expect, accept }
}

/**
 * Whether this message and this catalog belong together, and therefore whether a reading with
 * fewer than three constraints in it is a defect or the correct answer. The default fixture is a
 * merged vocabulary that answers both openings, so it counts as "own".
 */
function minChipsFor(caseDef: MessageCase, catalogPath: string, explicitCatalog: boolean): number {
  if (!explicitCatalog) return 3
  return detectBrand(catalogPath)?.caseLabel === caseDef.label ? 3 : 0
}

function satisfiesExpect(expect: Expect, verdict: CaseVerdict): boolean {
  if (expect === 'empty') return verdict.outcome === 'empty'
  if (expect === 'empty-unique') return verdict.outcome === 'empty' && verdict.rescuerCount === 1
  if (expect === 'non-empty') {
    const count = verdict.matchCount ?? 0
    return verdict.outcome === 'non-empty' && count >= 2 && count <= 4
  }
  return true
}

function summarize(verdicts: Record<string, CaseVerdict>): string {
  return Object.entries(verdicts)
    .map(([label, v]) => {
      if (v.outcome === 'empty') return `${label}: empty (${v.rescuerCount} chip(s) rescue)`
      if (v.outcome === 'non-empty') return `${label}: non-empty (${v.matchCount} product(s))`
      return `${label}: degenerate (no rescue possible)`
    })
    .join('; ')
}

/**
 * The default path, and the one every `bun bench` takes. Each brand is compared against ITS OWN
 * opening message and ITS OWN catalog, exactly as `accept()` generates them. Running every case
 * against every catalog instead would pair a jacket query with a supplements catalog, whose
 * `degenerate` verdict is correct by construction and is not a defect — that pairing is what
 * `--expect` is for.
 */
async function compareAllGold(): Promise<string[]> {
  const compared: string[] = []
  for (const goldBrand of GOLD_BRANDS) {
    if (!(await Bun.file(goldBrand.goldPath).exists())) continue
    const caseDef = CASES.find((c) => c.label === goldBrand.caseLabel)
    if (!caseDef) throw new Error(`no CASES entry for brand ${goldBrand.name}`)
    const catalog = await loadCatalog(goldBrand.catalogPath)
    const { blocks } = await runCase(caseDef, goldBrand.catalogPath, catalog, 3)
    await compareToGold(goldBrand, blocks)
    compared.push(goldBrand.goldPath)
  }
  return compared
}

/**
 * The goal-chip regression [see `GOAL_CASES` above]. Five properties, in the order a broken
 * `goal` field would actually break them — and each one is here because something ABOVE it in
 * this file would stay green while it failed:
 *
 *  1. An `any-of` chip is present in the READING. This is the direct regression: before `goal`
 *     existed, "I want to gain muscle" either matched no `tags` entry (the merchant's clarify
 *     prompt) or the model over-fit it to ONE attribute (`chip-protein`, an ordinary tag chip) —
 *     and a plain tag chip is a perfectly sane, gold-shaped, non-empty reading to every assertion
 *     elsewhere in this file. Nothing above this line would have noticed.
 *  2. Its `tags` are a subset of THIS catalog's real product tags. `goal` is `z.enum(vocabulary)`
 *     same as `tags` [chat.ts], so a foreign tag here means the model escaped the closed
 *     vocabulary, not that this assertion is too strict.
 *  3. The FSM reaches `recommend`, not `clarify` (nothing matched) or `obstacle` (the alternatives
 *     got ANDed instead of ORed — `predicateFor`'s `any-of` case regressing to `.every` would
 *     intersect KRACHT's disjoint whey/creatine tag sets to zero and land here instead).
 *  4. The recommendation spans MORE THAN ONE of the goal's tags. This is the bug itself, made
 *     concrete: a goal that silently collapsed to one alternative still produces a real,
 *     non-empty, `recommend` list — just the wrong one, missing everything else the shopper's
 *     stated outcome should have surfaced. `assertSaneRecommendation`-style checks (>=1 product,
 *     no obstacle block) are satisfied by that wrong list too; only counting which of the goal's
 *     OWN tags actually appear catches it.
 *  5. When a budget rides with the goal, it still ANDs — every returned product clears it. The
 *     `any-of` chip is one more chip through `mergeChips`, and this is the check that it does not
 *     get special-cased out of the intersection the way a price ceiling's singleton handling is.
 *
 * Paid (one `readingFor` call per invocation, memoised like every other call in this file).
 */
async function assertGoalRegression(
  label: string,
  catalogPath: string,
  catalog: Product[],
  message: string,
  budget: number | undefined,
): Promise<void> {
  const reading = await readingFor(catalogPath, catalog, message)
  const goalChip = reading.chips.find((c) => c.kind.type === 'any-of')
  if (goalChip?.kind.type !== 'any-of') {
    throw new Error(
      `[${label}] expected an 'any-of' chip for a goal-shaped message, got: ` +
        `${JSON.stringify(reading.chips.map((c) => ({ id: c.id, kind: c.kind.type })))} — a goal ` +
        "that collapsed to a plain tag chip (or to nothing) is the exact regression 'goal' " +
        'exists to fix',
    )
  }

  const catalogTags = new Set(catalog.flatMap((p) => p.tags))
  const foreign = goalChip.kind.tags.filter((tag) => !catalogTags.has(tag))
  if (foreign.length > 0) {
    throw new Error(
      `[${label}] 'any-of' chip named tag(s) outside this catalog's vocabulary: ${foreign.join(', ')} ` +
        `(catalog tags: ${[...catalogTags].sort().join(', ')})`,
    )
  }

  const brain = createBrain(catalog)
  const result = step(brain, { type: 'message', chips: reading.chips, dropped: reading.dropped })
  if (result.state.state !== 'recommend') {
    throw new Error(
      `[${label}] a goal-shaped message reached FSM state '${result.state.state}', not ` +
        "'recommend' — either nothing matched (clarify) or the goal's alternatives were ANDed " +
        'instead of ORed (obstacle)',
    )
  }

  const products = result.blocks.flatMap((b) => (b.kind === 'product-card' ? [b.product] : []))
  // No product on either catalog carries both of a goal's tags — KRACHT's protein/creatine and
  // VELDE's outerwear/knitwear are each a fully disjoint pair — so a span of 2 is an unambiguous
  // signal on both, not a weaker one on either.
  const spanned = goalChip.kind.tags.filter((tag) => products.some((p) => p.tags.includes(tag)))
  if (spanned.length <= 1) {
    throw new Error(
      `[${label}] recommendation spans only ${spanned.length}/${goalChip.kind.tags.length} of the ` +
        `goal's tags (${goalChip.kind.tags.join('/')}) across ${products.length} product(s) — ` +
        '"gain muscle" collapsing to one alternative (protein alone, never creatine) is the bug ' +
        "the 'any-of' chip exists to fix",
    )
  }

  if (budget !== undefined) {
    const overBudget = products.filter((p) => p.price > budget)
    if (overBudget.length > 0) {
      throw new Error(
        `[${label}] the goal chip did not AND with the €${budget} ceiling: ` +
          overBudget.map((p) => `${p.id} at €${p.price}`).join(', '),
      )
    }
  }
}

/**
 * The default path, gated exactly like `compareAllGold` above it (only the bare, no-catalog-arg
 * invocation) — so this costs three more paid calls on a plain `bun bench`/
 * `bun run bench/run.ts transcript`, and NOT on `bench/fault.test.ts`'s explicit-catalog calls,
 * which name their own timeout budget in their own comments and were never written against three
 * extra model turns.
 */
async function runGoalRegression(): Promise<number> {
  for (const goalCase of GOAL_CASES) {
    const brand = GOLD_BRANDS.find((b) => b.name === goalCase.brand)
    if (!brand) throw new Error(`no GOLD_BRANDS entry for brand ${goalCase.brand}`)
    const catalog = await loadCatalog(brand.catalogPath)
    await assertGoalRegression(
      goalCase.label,
      brand.catalogPath,
      catalog,
      goalCase.message,
      goalCase.budget,
    )
  }
  return GOAL_CASES.length
}

/**
 * The `accept` / `brand`-with-gold / bare-invocation three-way split, pulled out of `run` below
 * purely to stay under biome's cognitive-complexity cap — `run` doing this inline plus the CASES
 * loop plus the `--expect` check plus the `detail` template tipped it from 15 to 16. No behaviour
 * moved, only the branch that decides `goldNote`/`goldCases`/`goalCases`. Early-return per branch
 * (rather than the `if / else if / else` it replaces) is what buys the complexity back — same
 * three-way decision, less nesting for the linter to count.
 */
async function goldAndGoalNotes(
  accept: boolean,
  brand: GoldBrand | undefined,
  explicitCatalog: boolean,
  blocksByLabel: Map<string, Block[]>,
): Promise<{ goldNote: string; goldCases: number; goalCases: number }> {
  if (accept) {
    const goldNote = brand
      ? ` — ${await writeGold(brand, blocksByLabel.get(brand.caseLabel) ?? [])}`
      : ' — --accept: no gold mapping for this catalog path, nothing written'
    return { goldNote, goldCases: 0, goalCases: 0 }
  }
  if (brand && (await Bun.file(brand.goldPath).exists())) {
    await compareToGold(brand, blocksByLabel.get(brand.caseLabel) ?? [])
    return { goldNote: ` — matches gold ${brand.goldPath}`, goldCases: 1, goalCases: 0 }
  }
  // The bare invocation — no explicit catalog, not `--accept` — and the only branch that also
  // runs the goal-chip regression [`runGoalRegression`]. See that function's own comment for why
  // it is gated here rather than running on every invocation.
  if (!explicitCatalog) {
    const compared = await compareAllGold()
    const goldNote = compared.length > 0 ? ` — matches gold ${compared.join(', ')}` : ''
    const goalCases = await runGoalRegression()
    return { goldNote, goldCases: compared.length, goalCases }
  }
  return { goldNote: '', goldCases: 0, goalCases: 0 }
}

/**
 * `--accept` and `--expect` on the same command line: `--expect` still has to pass before
 * anything is written — a run that fails its own structural/expect bar never gets to regenerate
 * gold, so `--accept` cannot be used to launder a broken run into new gold.
 */
export const transcriptCheck: Check = {
  name: 'transcript',
  tier: 'HARD',
  run: async (args) => {
    const { catalogPath, explicitCatalog, expect, accept } = parseArgs(args)
    const catalog = await loadCatalog(catalogPath)
    const brand = detectBrand(catalogPath)

    const verdicts: Record<string, CaseVerdict> = {}
    const blocksByLabel = new Map<string, Block[]>()
    for (const caseDef of CASES) {
      const { verdict, blocks } = await runCase(
        caseDef,
        catalogPath,
        catalog,
        minChipsFor(caseDef, catalogPath, explicitCatalog),
      )
      verdicts[caseDef.label] = verdict
      blocksByLabel.set(caseDef.label, blocks)
    }

    if (expect && !Object.values(verdicts).some((v) => satisfiesExpect(expect, v))) {
      throw new Error(
        `--expect=${expect} was not achieved by either opening message against ${catalogPath}: ${summarize(verdicts)}`,
      )
    }

    const { goldNote, goldCases, goalCases } = await goldAndGoalNotes(
      accept,
      brand,
      explicitCatalog,
      blocksByLabel,
    )

    const detail = `${CASES.length} opening-message cases (live model) against ${catalogPath}${goldCases > 0 ? ` + ${goldCases} brand-matched gold case(s), kind-sequence + chip-set tolerance` : ''}${goalCases > 0 ? ` + ${goalCases} goal-chip regression case(s) (any-of chip, tag subset, recommend, multi-tag span, budget AND)` : ''}: ${summarize(verdicts)}${expect ? ` (--expect=${expect} satisfied)` : ''}${goldNote}`
    return { count: CASES.length + goldCases + goalCases, detail }
  },
  /** The bare `bun bench --accept` path (BENCHMARKS §4.3): regenerates gold for both brands in
   * one deliberate, human-run pass, each against its own opening message. */
  accept: async () => {
    const summaries: string[] = []
    for (const brand of GOLD_BRANDS) {
      const caseDef = CASES.find((c) => c.label === brand.caseLabel)
      if (!caseDef) throw new Error(`no CASES entry for brand ${brand.name}`)
      const catalog = await loadCatalog(brand.catalogPath)
      const { blocks } = await runCase(caseDef, brand.catalogPath, catalog, 3)
      summaries.push(`${brand.name}: ${await writeGold(brand, blocks)}`)
    }
    return { detail: summaries.join(' | ') }
  },
}
