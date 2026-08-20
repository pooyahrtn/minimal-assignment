import { describe, expect, test } from 'bun:test'
import type { Block } from '../types'
import { loadCatalog, parseCatalog } from './catalog'
import { createBrain, step } from './fsm'
import { findObstacle } from './obstacle'
import { chipsFrom } from './parse'
import { intersect } from './retrieve'

/**
 * The two readings below are what `apps/platform/chat.ts` returns for the two verbatim PRINCIPLES
 * §8 opening messages ("…a protein shake with no sweeteners, lactose-free, and ideally under €30."
 * and "…a jacket I can wear to the office and on the bike. Black, nothing shiny, and ideally under
 * €250."). They are hand-written here on purpose: whether the MODEL actually reads those sentences
 * that way is measured separately, against the real endpoint, by `bench/checks/transcript.ts`.
 *
 * This file tests the pure reducer — no model, no network. Chip labels are the bare tags because
 * no merchant `strings` are in scope; the label source itself is covered by `parse.ts`'s
 * self-check and by `shell.test.ts`, which passes the merchant's own strings.
 */
const SHAKE_READING = chipsFrom({
  tags: ['protein-shake', 'no-sweeteners', 'lactose-free'],
  maxPrice: 30,
})
const JACKET_READING = chipsFrom({
  tags: ['jacket', 'office', 'bike', 'black', 'matte'],
  maxPrice: 250,
})

const fixturePath = `${import.meta.dir}/fixture.json`

function noMatchBlock(blocks: Block[]): Extract<Block, { kind: 'no-match' }> | undefined {
  return blocks.find((b): b is Extract<Block, { kind: 'no-match' }> => b.kind === 'no-match')
}

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
    const chips = SHAKE_READING
    // 4 chips read (category + 2 attributes + price); the category tag alone is non-binding
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
    const results = intersect(JACKET_READING, catalog)
    expect(results.length).toBeGreaterThan(0)
  })

  test('a goal chip WIDENS: any of its attributes matches, where ANDing the same two is empty', async () => {
    const catalog = await loadCatalog(fixturePath)
    // These two families share no product on this fixture, exactly as `protein` and `creatine` do
    // on the real KRACHT catalog — the case the kind exists for. Read as two tag chips it is an
    // obstacle; read as one goal it is a recommendation.
    expect(intersect(chipsFrom({ tags: ['jacket', 'protein-shake'] }), catalog)).toEqual([])

    const goal = chipsFrom({ tags: [], goal: ['jacket', 'protein-shake'] })
    expect(goal.map((c) => c.id)).toEqual(['chip-any-jacket-protein-shake'])
    const either = catalog.filter(
      (p) => p.tags.includes('jacket') || p.tags.includes('protein-shake'),
    )
    expect(
      intersect(goal, catalog)
        .map((p) => p.id)
        .sort(),
    ).toEqual(either.map((p) => p.id).sort())
    expect(
      step(createBrain(catalog), { type: 'message', chips: goal, dropped: [] }).state.state,
    ).toBe('recommend')

    // It widens WITHIN itself and still ANDs with the rest of the row: a budget cuts the union.
    const withBudget = [...goal, ...chipsFrom({ tags: [], maxPrice: 30 })]
    const cheap = intersect(withBudget, catalog)
    expect(cheap.length).toBeGreaterThan(0)
    expect(cheap.length).toBeLessThan(either.length)
    expect(cheap.every((p) => p.price <= 30)).toBe(true)
  })

  test('obstacle names the blocking constraint and quantifies the trade-off with a number', async () => {
    const catalog = await loadCatalog(fixturePath)
    const obstacle = findObstacle(SHAKE_READING, catalog)
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
    const result = step(brain, { type: 'message', chips: SHAKE_READING, dropped: [] })
    expect(result.state.state).toBe('obstacle')
    expect(noMatchBlock(result.blocks)).toBeUndefined()
  })

  test('full flow: message -> obstacle -> drop blocking chip -> resolve -> restore -> obstacle again', async () => {
    const catalog = await loadCatalog(fixturePath)
    const brain = createBrain(catalog)

    const opened = step(brain, { type: 'message', chips: SHAKE_READING, dropped: [] })
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
    const result = step(brain, { type: 'message', chips: JACKET_READING, dropped: [] })
    expect(result.state.state).toBe('recommend')
    const cards = result.blocks.filter((b) => b.kind === 'product-card')
    expect(cards.length).toBeGreaterThan(0)
  })
})
