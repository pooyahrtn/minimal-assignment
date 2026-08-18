import { describe, expect, test } from 'bun:test'
import type { Block } from '../types'
import { loadCatalog, parseCatalog } from './catalog'
import { createBrain, step } from './fsm'
import { findObstacle } from './obstacle'
import { parseChips } from './parse'
import { intersect } from './retrieve'

// Verbatim opening messages, PRINCIPLES §8. Named for the category they open, not the shop —
// this module carries zero brand-specific branches.
const shakeOpeningMessage =
  "I'm after a protein shake with no sweeteners, lactose-free, and ideally under €30."
const jacketOpeningMessage =
  'I need a jacket I can wear to the office and on the bike. Black, nothing shiny, and ideally under €250.'

const fixturePath = `${import.meta.dir}/fixture.json`

function noMatchBlock(blocks: Block[]): Extract<Block, { kind: 'no-match' }> | undefined {
  return blocks.find((b): b is Extract<Block, { kind: 'no-match' }> => b.kind === 'no-match')
}

describe('parse: free text -> constraint chips', () => {
  test('extracts >=3 chips from the shake opening message via keyword/synonym matching, not a whole-sentence match', () => {
    const chips = parseChips(shakeOpeningMessage)
    expect(chips.length).toBeGreaterThanOrEqual(3)
    const ids = chips.map((c) => c.id)
    expect(ids).toContain('chip-protein-shake')
    expect(ids).toContain('chip-no-sweeteners')
    expect(ids).toContain('chip-lactose-free')
    expect(ids).toContain('chip-price')
    const priceChip = chips.find((c) => c.id === 'chip-price')
    expect(priceChip?.kind).toEqual({ type: 'price-max', max: 30 })
  })

  test('extracts >=3 chips from the jacket opening message via keyword/synonym matching, not a whole-sentence match', () => {
    const chips = parseChips(jacketOpeningMessage)
    expect(chips.length).toBeGreaterThanOrEqual(3)
    const ids = chips.map((c) => c.id)
    expect(ids).toContain('chip-jacket')
    expect(ids).toContain('chip-office')
    expect(ids).toContain('chip-bike')
    expect(ids).toContain('chip-black')
    expect(ids).toContain('chip-matte')
    const priceChip = chips.find((c) => c.id === 'chip-price')
    expect(priceChip?.kind).toEqual({ type: 'price-max', max: 250 })
  })
})

describe('catalog: runtime-guarded load from a path argument', () => {
  test('loads a valid catalog from disk', async () => {
    const catalog = await loadCatalog(fixturePath)
    expect(catalog.length).toBeGreaterThan(0)
  })

  test('throws loudly on data that is not a Product[]', () => {
    expect(() => parseCatalog([{ id: 'x' }])).toThrow()
    expect(() => parseCatalog('not an array')).toThrow()
  })
})

describe('retrieve + obstacle: computed, never scripted', () => {
  test('the shake constraints intersect to empty by arithmetic on the fixture catalog, using more chips than the number that first empties the set', async () => {
    const catalog = await loadCatalog(fixturePath)
    const chips = parseChips(shakeOpeningMessage)
    // 4 chips parsed (category + 2 attributes + price); the category tag alone is non-binding
    // here (every shake product carries it), so the minimal set that empties the intersection is
    // 3 — this runs the full 4, above that threshold. [ENGINEERING §3.3]
    expect(chips.length).toBe(4)
    expect(intersect(chips, catalog)).toEqual([])
    // Sanity: the 3-chip subset without the non-binding category tag already empties it.
    const withoutCategory = chips.filter((c) => c.id !== 'chip-protein-shake')
    expect(withoutCategory.length).toBe(3)
    expect(intersect(withoutCategory, catalog)).toEqual([])
  })

  test('the jacket constraints are satisfiable on the fixture catalog (recommend path, not obstacle)', async () => {
    const catalog = await loadCatalog(fixturePath)
    const chips = parseChips(jacketOpeningMessage)
    const results = intersect(chips, catalog)
    expect(results.length).toBeGreaterThan(0)
  })

  test('obstacle names the blocking constraint and quantifies the trade-off with a number', async () => {
    const catalog = await loadCatalog(fixturePath)
    const chips = parseChips(shakeOpeningMessage)
    const obstacle = findObstacle(chips, catalog)
    expect(obstacle).not.toBeNull()
    // On this assortment, three near-clean products clear both attribute chips but sit over
    // budget, while dropping either single attribute chip frees exactly one cheaper product.
    // findObstacle's tiebreak picks the removal with the largest recovered result set — price,
    // which frees 3 products vs 1 for either attribute chip. This tiebreak rule is invented
    // behaviour (see hand-off), not literal DoD text.
    expect(obstacle?.blocking.id).toBe('chip-price')
    expect(obstacle?.closest.length).toBe(3)
    expect(obstacle?.closest[0]?.gap).toBe('€34.95, €4.95 over')
    for (const { gap } of obstacle?.closest ?? []) {
      expect(gap).toMatch(/€\d+\.\d{2} over$/)
    }
  })
})

describe('fsm: pure reducer, chip drop/restore is one call, undoable, never evicted', () => {
  test('a message against an empty catalog reaches obstacle with no rescuing removal (no no-match block, since no chip drop can help)', () => {
    const brain = createBrain([])
    const result = step(brain, { type: 'message', text: shakeOpeningMessage })
    expect(result.state.state).toBe('obstacle')
    expect(noMatchBlock(result.blocks)).toBeUndefined()
  })

  test('full flow: message -> obstacle -> drop blocking chip -> resolve -> restore -> obstacle again', async () => {
    const catalog = await loadCatalog(fixturePath)
    const brain = createBrain(catalog)

    const opened = step(brain, { type: 'message', text: shakeOpeningMessage })
    expect(opened.state.state).toBe('obstacle')
    const match = noMatchBlock(opened.blocks)
    expect(match).toBeDefined()
    const blockingId = match?.blocking.id
    expect(blockingId).toBe('chip-price')
    if (!blockingId) throw new Error('expected a blocking chip id')

    const dropped = step(opened.state, { type: 'drop-chip', id: blockingId })
    expect(dropped.state.state).toBe('resolve')
    const droppedChip = dropped.state.chips.find((c) => c.id === blockingId)
    expect(droppedChip?.state).toBe('dropped')
    // The dropped chip survives in state — never evicted. [ENGINEERING §2.10]
    expect(dropped.state.chips.length).toBe(opened.state.chips.length)

    const restored = step(dropped.state, { type: 'restore-chip', id: blockingId })
    const restoredChip = restored.state.chips.find((c) => c.id === blockingId)
    expect(restoredChip?.state).toBe('active')
    // Restoring the blocking chip re-empties the intersection: back to obstacle.
    expect(restored.state.state).toBe('obstacle')
  })

  test('works against the same fixture with a differently-shaped product (no brand-specific branch)', async () => {
    const catalog = await loadCatalog(fixturePath)
    const brain = createBrain(catalog)
    const result = step(brain, { type: 'message', text: jacketOpeningMessage })
    expect(result.state.state).toBe('recommend')
    const cards = result.blocks.filter((b) => b.kind === 'product-card')
    expect(cards.length).toBeGreaterThan(0)
  })
})
