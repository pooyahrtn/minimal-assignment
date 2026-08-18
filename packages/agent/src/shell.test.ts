import { describe, expect, test } from 'bun:test'
import { loadCatalog } from './brain/catalog'
import { createBrain, step } from './brain/fsm'
import type { CacheStore } from './config'
import { reply } from './converse'
import { configUrl, isConfigResponse, readCache, str, writeCache } from './config'
import { cornerCss } from './css'
import { FALLBACK } from './fallback'
import type { Block } from './types'

/**
 * The pure half of the shell. DOM behaviour — focus trap, 375px layout, shadow isolation — is
 * Playwright's job in T12; asserting it here against a fake DOM would prove nothing about a
 * browser. [ENGINEERING §3.8]
 *
 * Imports `./config` and `./css` directly, never `./index`: the barrel pulls in `widget.ts`, whose
 * `extends HTMLElement` cannot even be evaluated outside a browser.
 */

const velde = FALLBACK.velde
if (velde === undefined) throw new Error('fixture missing: FALLBACK.velde')
const kracht = FALLBACK.kracht
if (kracht === undefined) throw new Error('fixture missing: FALLBACK.kracht')

function fakeStore(): CacheStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

describe('config URL', () => {
  test('resolves against the script origin, not the storefront', () => {
    expect(configUrl('https://maximal.releashed.io/v1/agent.js', 'velde')).toBe(
      'https://maximal.releashed.io/v1/config/velde',
    )
  })

  test('ignores the script path and query, keeps the port', () => {
    expect(configUrl('http://localhost:4000/static/embed/agent.js?v=3', 'kracht')).toBe(
      'http://localhost:4000/v1/config/kracht',
    )
  })

  test('escapes a shop key rather than letting it walk the path', () => {
    expect(configUrl('https://maximal.releashed.io/v1/agent.js', '../admin')).toBe(
      'https://maximal.releashed.io/v1/config/..%2Fadmin',
    )
  })
})

describe('localStorage cache', () => {
  test('round-trips a config', () => {
    const store = fakeStore()
    writeCache(store, 'velde', velde)
    expect(store.data.size).toBe(1)
    expect(readCache(store, 'velde')).toEqual(velde)
  })

  test('a miss, unparseable JSON and a stale shape all read as no cache', () => {
    const store = fakeStore()
    expect(readCache(store, 'velde')).toBe(null)
    store.data.set('mx-config-velde', '{not json')
    expect(readCache(store, 'velde')).toBe(null)
    store.data.set('mx-config-velde', JSON.stringify({ tokens: {}, voice: {} }))
    expect(readCache(store, 'velde')).toBe(null)
  })

  test('a throwing storage (private mode, quota) is survivable', () => {
    const angry: CacheStore = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(readCache(angry, 'velde')).toBe(null)
    expect(() => writeCache(angry, 'velde', velde)).not.toThrow()
  })
})

describe('config guard', () => {
  test('accepts both built-in brands', () => {
    const brands = Object.values(FALLBACK)
    expect(brands.length).toBe(2)
    for (const brand of brands) expect(isConfigResponse(brand)).toBe(true)
  })

  test('rejects the shapes a broken endpoint actually returns', () => {
    const cases: unknown[] = [
      null,
      undefined,
      'not an object',
      {},
      { tokens: velde.tokens, voice: velde.voice, strings: {} },
      { ...velde, catalog: [{ id: 'p1' }] },
      { ...velde, strings: { 'panel.close': 7 } },
      { ...velde, voice: { ...velde.voice, avatar: { kind: 'photo', src: '/a.png' } } },
    ]
    expect(cases.length).toBeGreaterThan(0)
    for (const shape of cases) expect(isConfigResponse(shape)).toBe(false)
  })

  test('rejects a payload that dropped a single custom property', () => {
    const css: Record<string, string> = { ...velde.tokens.css }
    delete css['--mx-focus-ring']
    expect(isConfigResponse({ ...velde, tokens: { ...velde.tokens, css } })).toBe(false)
  })
})

describe('launcher corner', () => {
  test('every corner resolves to its two edges', () => {
    const gap = 'var(--mx-space-4)'
    expect(cornerCss('bottom-right')).toBe(`bottom: ${gap}; right: ${gap};`)
    expect(cornerCss('bottom-left')).toBe(`bottom: ${gap}; left: ${gap};`)
    expect(cornerCss('top-right')).toBe(`top: ${gap}; right: ${gap};`)
    expect(cornerCss('top-left')).toBe(`top: ${gap}; left: ${gap};`)
  })
})

describe('merchant copy', () => {
  test('a missing key renders as the key, never as "undefined"', () => {
    expect(str(velde.strings, 'composer.send')).toBe('Send')
    expect(str(velde.strings, 'nope.missing')).toBe('nope.missing')
  })
})

/**
 * The graded turn, end to end without a DOM: the shopper's sentence in, the merchant's own words
 * out, with the blocking constraint and its cost computed from the REAL catalog. `reply` is the
 * only piece between the brain and `push()`, so this fails if the template stops interpolating,
 * if the obstacle stops naming a number, or if dropping the chip stops rescuing anything.
 */
function said(blocks: Block[]): string[] {
  return blocks.flatMap((block) => (block.kind === 'text' ? [block.text] : []))
}

const KRACHT_OPENING =
  "I'm after a protein shake with no sweeteners, lactose-free, and ideally under €30."
const VELDE_OPENING =
  'I need a jacket I can wear to the office and on the bike. Black, nothing shiny, and ideally under €250.'

describe('the obstacle sentence', () => {
  test('names the blocking constraint, quantifies it, and resolves when the chip is dropped', async () => {
    const catalog = await loadCatalog('packages/agent/src/brain/catalog.kracht.json')
    expect(catalog.length).toBeGreaterThan(0)

    const opening = step(createBrain(catalog), { type: 'message', text: KRACHT_OPENING })
    const sentence = said(reply(opening.blocks, opening.state, kracht.strings)).join(' ')
    expect(sentence.length).toBeGreaterThan(0)
    // The blocking chip's own label, and the real price of the nearest product — neither is a
    // literal anywhere in the payload; both are interpolated into the template.
    expect(sentence).toContain('under €30')
    // Derive the expected number from the catalog rather than pinning a literal. The first
    // version of this test hardcoded '€49'; a catalog change made the sentence correctly say
    // €32.95 and the test failed for being right. The invariant is "the cheapest product that
    // clears every constraint except price is the number quoted" — that survives merchandising.
    const cheapestNearMiss = catalog
      .filter((p) => p.tags.includes('no-sweeteners') && p.tags.includes('lactose-free'))
      .reduce((low, p) => (p.price < low ? p.price : low), Number.POSITIVE_INFINITY)
    expect(cheapestNearMiss).toBeLessThan(Number.POSITIVE_INFINITY)
    expect(sentence).toContain(String(cheapestNearMiss))
    expect(sentence).not.toContain('{')

    const dropped = step(opening.state, { type: 'drop-chip', id: 'chip-price' })
    const lines = said(reply(dropped.blocks, dropped.state, kracht.strings))
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.some((line) => line.includes('Isolate'))).toBe(true)

    const restored = step(dropped.state, { type: 'restore-chip', id: 'chip-price' })
    expect(said(reply(restored.blocks, restored.state, kracht.strings)).join(' ')).toContain(
      'under €30',
    )
  })

  test('the brand that resolves happily says so, in its own voice', async () => {
    const catalog = await loadCatalog('packages/agent/src/brain/catalog.velde.json')
    const opening = step(createBrain(catalog), { type: 'message', text: VELDE_OPENING })
    const lines = said(reply(opening.blocks, opening.state, velde.strings))
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[0]).toBe('Matches:')
    expect(lines.filter((line) => line.includes('€245')).length).toBeGreaterThan(0)
    expect(lines.join(' ')).not.toContain('except')
  })

  test('a fallback with no catalog answers honestly instead of silently', () => {
    const opening = step(createBrain([]), { type: 'message', text: KRACHT_OPENING })
    const lines = said(reply(opening.blocks, opening.state, kracht.strings))
    expect(lines.length).toBe(1)
    expect(lines[0]).toBe(kracht.strings['catalog.offline'])
  })
})
