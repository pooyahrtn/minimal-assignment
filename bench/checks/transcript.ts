import type { Check } from '../checks'
import { loadCatalog } from '../../packages/agent/src/brain/catalog'
import type { BrainState } from '../../packages/agent/src/brain/fsm'
import { createBrain, step } from '../../packages/agent/src/brain/fsm'
import type { ParsedChip } from '../../packages/agent/src/brain/parse'
import { parseChips } from '../../packages/agent/src/brain/parse'
import { findObstacle } from '../../packages/agent/src/brain/obstacle'
import { intersect } from '../../packages/agent/src/brain/retrieve'
import type { Block, Product } from '../../packages/agent/src/types'

// H3 (BENCHMARKS §1) is specced as byte-exact golden transcripts under bench/gold/. Both real
// catalogs (catalog.velde.json / catalog.kracht.json) are T8's work and do not exist yet, so gold
// comparison is deferred — pinning bytes against today's fixture.json would guarantee a failure
// that could only be "fixed" by editing a gold file, which BENCHMARKS §4.1 forbids. This check
// instead asserts the properties a gold transcript would encode: chips parsed from prose (not a
// sentence match), obstacle arithmetic, and reversibility — against whatever catalog is passed.
//
// "Exactly one chip rescues" and "2-4 products" are T8 claims about the REAL catalogs
// (TASKS.md T8 DoD box 6), not T4 guarantees about a placeholder fixture — T4's own text only
// promises the algorithm *returns* a single removal, not that the catalog is unambiguous. So
// those two bounds are opt-in via --expect=empty-unique / --expect=non-empty; the always-on
// checks are the weaker, structurally-true claims: the brain names one blocking chip, dropping it
// genuinely rescues, the cost is real, and the rescuer count is reported (never thrown on) so an
// ambiguous catalog is visible without failing the run.

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
    .map((c) => (c.kind.type === 'tag' ? `tag:${c.kind.tag}` : `price-max:${c.kind.max}`))
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

async function runCase(caseDef: MessageCase, catalog: Product[]): Promise<CaseVerdict> {
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

  return verdict
}

function parseArgs(args: string[]): { catalogPath: string; expect: Expect } {
  let catalogPath = 'packages/agent/src/brain/fixture.json'
  let expect: Expect = null
  for (const arg of args) {
    if (arg === '--expect=empty') expect = 'empty'
    else if (arg === '--expect=empty-unique') expect = 'empty-unique'
    else if (arg === '--expect=non-empty') expect = 'non-empty'
    else if (!arg.startsWith('--')) catalogPath = arg
  }
  return { catalogPath, expect }
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

export const transcriptCheck: Check = {
  name: 'transcript',
  tier: 'HARD',
  run: async (args) => {
    const { catalogPath, expect } = parseArgs(args)
    const catalog = await loadCatalog(catalogPath)

    const verdicts: Record<string, CaseVerdict> = {}
    for (const caseDef of CASES) {
      verdicts[caseDef.label] = await runCase(caseDef, catalog)
    }

    if (expect && !Object.values(verdicts).some((v) => satisfiesExpect(expect, v))) {
      throw new Error(
        `--expect=${expect} was not achieved by either opening message against ${catalogPath}: ${summarize(verdicts)}`,
      )
    }

    const detail = `${CASES.length} opening-message cases against ${catalogPath}: ${summarize(verdicts)}${expect ? ` (--expect=${expect} satisfied)` : ''}`
    return { count: CASES.length, detail }
  },
}
