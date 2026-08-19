import type { Check } from '../checks'
import { loadCatalog } from '../../packages/agent/src/brain/catalog'
import type { BrainState } from '../../packages/agent/src/brain/fsm'
import { createBrain, step } from '../../packages/agent/src/brain/fsm'
import type { ParsedChip } from '../../packages/agent/src/brain/parse'
import { parseChips } from '../../packages/agent/src/brain/parse'
import { findObstacle } from '../../packages/agent/src/brain/obstacle'
import { intersect } from '../../packages/agent/src/brain/retrieve'
import type { Block, Product } from '../../packages/agent/src/types'

// H3 (BENCHMARKS §1) is specced as "byte-exact match, or a diff". Gold comparison was originally
// deferred here — the real catalogs (catalog.velde.json / catalog.kracht.json) were T8's work and
// did not exist yet, so pinning bytes against a hand-written fixture would have guaranteed a
// failure fixable only by editing a gold file, which BENCHMARKS §4.1 forbids. Both real catalogs
// have since landed (T8), so gold comparison is now live: when the catalog under test resolves to
// a known brand (GOLD_BRANDS below) and that brand's gold file exists, the matching case's block
// sequence is compared against it and a mismatch throws with a readable diff (see `compareToGold`).
//
// The comparison itself is STRUCTURAL (deep-equality on the parsed block arrays), not a byte
// comparison of the file on disk — see `compareToGold`'s own comment for why that still satisfies
// "byte-exact match, or a diff" in substance: it catches the same drift (a changed string, a
// changed order, an added/removed block) without a formatting subprocess in the comparison path.
// Byte-exactness of the gold FILE is `--accept`'s job (`writeGold`), where it belongs.
//
// This sits ALONGSIDE the structural checks below, not instead of them — BENCHMARKS §1 wants
// both: gold catches silent behaviour drift (a parallel agent touching the FSM), the structural
// checks catch a broken catalog (gold only compares the exact fixed opening messages; it says
// nothing about a catalog that changed shape). "Exactly one chip rescues" and "2-4 products" stay
// opt-in via --expect=empty-unique / --expect=non-empty for the same reason as before: those are
// T8 claims about the real catalogs, not T4 guarantees about an arbitrary one.
//
// COVERAGE LIMIT (see hand-off): gold only pins two fixed opening messages against two catalogs.
// A behaviour change invisible in those two transcripts is unpinned — e.g. reversing the
// recommendation sort does NOT fail gold, because VELDE's two matching products are tied at €245
// and a stable sort leaves tied output identical either way. A tie in the pinned data hides an
// ordering change; this check cannot see past its own fixtures.

// Verbatim, PRINCIPLES §8.
const KRACHT_MESSAGE =
  "I'm after a protein shake with no sweeteners, lactose-free, and ideally under €30."
const VELDE_MESSAGE =
  'I need a jacket I can wear to the office and on the bike. Black, nothing shiny, and ideally under €250.'

// Invented for this check (see hand-off): same constraints as the opening messages above, but
// reworded and reordered so a whole-sentence match cannot survive them — only a synonym map can.
const KRACHT_PERTURBED =
  'Ideally I want to stay under €30 -- dairy-free and unsweetened, basically a whey protein powder without any of that stuff.'
const VELDE_PERTURBED =
  'Looking for something in matte black, no shine at all, that works for cycling to the office and back -- a jacket essentially, max €250 please.'

type MessageCase = { label: string; message: string; perturbed: string }

const CASES: MessageCase[] = [
  { label: 'kracht opening (protein shake)', message: KRACHT_MESSAGE, perturbed: KRACHT_PERTURBED },
  { label: 'velde opening (jacket)', message: VELDE_MESSAGE, perturbed: VELDE_PERTURBED },
]

// Which real catalog a gold file pins, and which of CASES it was generated from. Matched by
// filename, not a hardcoded brand check in `brain/` — this table lives in bench/, which T4's
// "no velde/kracht in brain/" rule does not reach.
type GoldBrand = { name: string; catalogPath: string; goldPath: string; caseLabel: string }

const GOLD_BRANDS: GoldBrand[] = [
  {
    name: 'velde',
    catalogPath: 'packages/agent/src/brain/catalog.velde.json',
    goldPath: 'bench/gold/velde.json',
    caseLabel: 'velde opening (jacket)',
  },
  {
    name: 'kracht',
    catalogPath: 'packages/agent/src/brain/catalog.kracht.json',
    goldPath: 'bench/gold/kracht.json',
    caseLabel: 'kracht opening (protein shake)',
  },
]

function detectBrand(catalogPath: string): GoldBrand | undefined {
  return GOLD_BRANDS.find((b) => catalogPath.endsWith(`catalog.${b.name}.json`))
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

function blockText(value: unknown): string {
  return value === undefined ? '<no block at this index>' : JSON.stringify(value, null, 2)
}

/**
 * Structural gold comparison — deep-equality on the parsed block arrays, not a byte comparison of
 * files on disk. This catches the same drift a byte comparison would (a changed string, a changed
 * order, an added/removed block) without needing a canonicalizing subprocess and scratch file in
 * the comparison path: both `expected[i]` (parsed from the gold file) and `actual[i]` (fresh off
 * the FSM) trace back to the same `JSON.stringify(blocks, null, 2)` shape, so `JSON.stringify`
 * equality on the parsed values is exact, not approximate. Byte-exactness of the FILE is
 * `--accept`'s concern (`writeGold`), not this one's.
 *
 * On mismatch, prints the full expected-vs-actual for the first differing block to the console (so
 * a human reviewing a failing run sees the real diff, not just "mismatch"), then throws a one-line
 * error naming the index — kept short because it also lands in the report.md table cell.
 */
async function compareToGold(brand: GoldBrand, blocks: Block[]): Promise<void> {
  const expected = parseBlockArray(await Bun.file(brand.goldPath).text(), brand.goldPath)
  const actual: unknown[] = blocks
  const max = Math.max(expected.length, actual.length)
  for (let i = 0; i < max; i++) {
    if (JSON.stringify(expected[i]) === JSON.stringify(actual[i])) continue
    console.error(
      `\n[${brand.caseLabel}] gold mismatch against ${brand.goldPath}\n` +
        `expected ${expected.length} block(s), got ${actual.length}. First differing block: index ${i}\n` +
        `--- expected[${i}] ---\n${blockText(expected[i])}\n` +
        `--- actual[${i}] ---\n${blockText(actual[i])}\n`,
    )
    throw new Error(
      `[${brand.caseLabel}] gold mismatch against ${brand.goldPath} at block ${i} (expected ${expected.length} block(s), got ${actual.length}) — diff printed above`,
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
 * (BENCHMARKS §4.3 rule 3) — never from the comparison branch above. */
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
      // Part of the signature on purpose: the perturbation check compares the signature of a
      // message against its reworded twin, and a disclosure that appears in one phrasing but not
      // the other is exactly the drift this check exists to catch.
      return `unsupported:${c.kind.phrase}`
    })
    .sort()
}

function assertChipCount(label: string, chips: ParsedChip[]): void {
  if (chips.length < 3) {
    throw new Error(
      `[${label}] expected >=3 chips parsed from the opening message, got ${chips.length}: ${JSON.stringify(chips.map((c) => c.id))}`,
    )
  }
}

/** A whole-sentence match cannot survive reworded, reordered prose; a synonym map can. */
function assertPerturbationRobust(label: string, original: string, perturbed: string): void {
  const originalSig = chipSignature(parseChips(original))
  const perturbedSig = chipSignature(parseChips(perturbed))
  if (JSON.stringify(originalSig) !== JSON.stringify(perturbedSig)) {
    throw new Error(
      `[${label}] perturbed wording changed the parsed constraint set: original ${JSON.stringify(originalSig)} vs perturbed ${JSON.stringify(perturbedSig)} (perturbed text: ${JSON.stringify(perturbed)})`,
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

async function runCase(
  caseDef: MessageCase,
  catalog: Product[],
): Promise<{ verdict: CaseVerdict; blocks: Block[] }> {
  const chips = parseChips(caseDef.message)
  assertChipCount(caseDef.label, chips)
  assertPerturbationRobust(caseDef.label, caseDef.message, caseDef.perturbed)

  const brain = createBrain(catalog)
  const result = step(brain, { type: 'message', text: caseDef.message })
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
 * The default path, and the one every `bun bench` takes. `catalogPath` defaults to `fixture.json`,
 * which `detectBrand` cannot match, so gold was written by `--accept` and then never read again by
 * any run anybody actually performs — H3's whole gold set was decorative
 * [COMPLAINS #2, DECISIONS-LOG → Testing].
 *
 * Each brand is compared against ITS OWN opening message and ITS OWN catalog, exactly as
 * `accept()` generates them. Running every case against every catalog instead would pair a jacket
 * query with a supplements catalog, whose `degenerate` verdict is correct by construction and is
 * not a defect — that pairing is what `--expect` is for, and it is how two of T8's landed gates
 * are worded [TASKS T8 DoD].
 */
async function compareAllGold(): Promise<string[]> {
  const compared: string[] = []
  for (const goldBrand of GOLD_BRANDS) {
    if (!(await Bun.file(goldBrand.goldPath).exists())) continue
    const caseDef = CASES.find((c) => c.label === goldBrand.caseLabel)
    if (!caseDef) throw new Error(`no CASES entry for brand ${goldBrand.name}`)
    const { blocks } = await runCase(caseDef, await loadCatalog(goldBrand.catalogPath))
    await compareToGold(goldBrand, blocks)
    compared.push(goldBrand.goldPath)
  }
  return compared
}

/**
 * `--accept` and `--expect` on the same command line: `--expect` still has to pass before
 * anything is written — a run that fails its own structural/expect bar never gets to regenerate
 * gold, so `--accept` cannot be used to launder a broken run into new gold. `--accept` only
 * changes what happens with the gold file itself: skip the byte-exact compare, write instead.
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
      const { verdict, blocks } = await runCase(caseDef, catalog)
      verdicts[caseDef.label] = verdict
      blocksByLabel.set(caseDef.label, blocks)
    }

    if (expect && !Object.values(verdicts).some((v) => satisfiesExpect(expect, v))) {
      throw new Error(
        `--expect=${expect} was not achieved by either opening message against ${catalogPath}: ${summarize(verdicts)}`,
      )
    }

    let goldNote = ''
    let goldCases = 0
    if (accept) {
      goldNote = brand
        ? ` — ${await writeGold(brand, blocksByLabel.get(brand.caseLabel) ?? [])}`
        : ' — --accept: no gold mapping for this catalog path, nothing written'
    } else if (brand && (await Bun.file(brand.goldPath).exists())) {
      await compareToGold(brand, blocksByLabel.get(brand.caseLabel) ?? [])
      goldNote = ` — matches gold ${brand.goldPath}`
      goldCases = 1
    } else if (!explicitCatalog) {
      const compared = await compareAllGold()
      goldCases = compared.length
      goldNote = compared.length > 0 ? ` — matches gold ${compared.join(', ')}` : ''
    }

    const detail = `${CASES.length} opening-message cases against ${catalogPath}${goldCases > 0 ? ` + ${goldCases} brand-matched gold case(s)` : ''}: ${summarize(verdicts)}${expect ? ` (--expect=${expect} satisfied)` : ''}${goldNote}`
    return { count: CASES.length + goldCases, detail }
  },
  /** The bare `bun bench --accept` path (BENCHMARKS §4.3): regenerates gold for both brands in
   * one deliberate, human-run pass, each against its own opening message. */
  accept: async () => {
    const summaries: string[] = []
    for (const brand of GOLD_BRANDS) {
      const caseDef = CASES.find((c) => c.label === brand.caseLabel)
      if (!caseDef) throw new Error(`no CASES entry for brand ${brand.name}`)
      const catalog = await loadCatalog(brand.catalogPath)
      const { blocks } = await runCase(caseDef, catalog)
      summaries.push(`${brand.name}: ${await writeGold(brand, blocks)}`)
    }
    return { detail: summaries.join(' | ') }
  },
}
