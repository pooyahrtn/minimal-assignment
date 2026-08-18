import { describe, expect, test } from 'bun:test'
import type { CacheStore } from './config'
import { configUrl, isConfigResponse, readCache, str, writeCache } from './config'
import { cornerCss } from './css'
import { FALLBACK } from './fallback'

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
