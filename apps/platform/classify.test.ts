import { expect, test } from 'bun:test'
import { classifyExtractState } from './server'
import { extractMerchantTokens } from '../../packages/agent/src/extract/extract'
import { KRACHT } from '@maximal/tokens'

/**
 * The four states the config page routes on. `MerchantDraft` carries only `ok: boolean` and a
 * free-text note, so these are reconstructed in the platform layer — which means a reworded note
 * in `extract.ts` can silently degrade `blocked` into `failed`, and nothing else in the tree
 * would notice. That is what this file is for.
 */

/** The extractor's own defaults, live rather than hand-copied: an invalid URL fails at `new URL()`
 *  and never touches the network. */
const DEFAULTS = (await extractMerchantTokens('not-a-url')).tokens

test('a bot wall reads as blocked, by either route into it', () => {
  // A real Cloudflare shop exits at `!response.ok` before `isChallengePage` is ever consulted, so
  // an HTTP status IS the blocked case in practice — checked against coolblue.nl on 2026-08-19.
  expect(
    classifyExtractState({
      tokens: DEFAULTS,
      logo: null,
      ok: false,
      note: 'https://x.example responded with HTTP 403 — we could not read this site.',
    }),
  ).toBe('blocked')
  expect(
    classifyExtractState({
      tokens: DEFAULTS,
      logo: null,
      ok: false,
      note: 'https://x.example returned a bot-check page instead of the site.',
    }),
  ).toBe('blocked')
})

test('a page we reached but learned nothing from reads as empty, not as success', () => {
  // The failure this state exists to prevent: `buildTokens` spreads the defaults for every field
  // it cannot find and still returns `ok: true`, which is the silent fallback T7 forbids.
  expect(
    classifyExtractState({
      tokens: DEFAULTS,
      logo: null,
      ok: true,
      note: 'Extracted from https://x.example.',
    }),
  ).toBe('empty')
})

test('a page we actually read reads as ok', () => {
  expect(
    classifyExtractState({
      tokens: KRACHT,
      logo: 'https://x.example/logo.png',
      ok: true,
      note: 'Extracted from https://x.example.',
    }),
  ).toBe('ok')
  // One real field differing from the defaults is enough — a store whose only readable signal was
  // its logo still learned something.
  expect(
    classifyExtractState({
      tokens: DEFAULTS,
      logo: 'https://x.example/logo.png',
      ok: true,
      note: 'Extracted from https://x.example.',
    }),
  ).toBe('ok')
})

test('everything else reads as failed', () => {
  expect(
    classifyExtractState({
      tokens: DEFAULTS,
      logo: null,
      ok: false,
      note: 'https://x.example did not respond in time.',
    }),
  ).toBe('failed')
})
