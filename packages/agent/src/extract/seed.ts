import type { MerchantDraft } from './extract'

/**
 * Cached extractor output for the two demo storefronts, captured by actually running
 * `extractMerchantTokens` against each live store once. The live demo pastes one of these two
 * URLs and must never depend on a network round-trip at that moment, so `extractMerchantTokens`
 * returns this instead of re-fetching when the URL's origin matches. [TASKS T8 DoD box 5]
 *
 * Regenerate by re-running the extractor against the running dev servers and pasting the result
 * back in here — there is no build step that does this automatically, on purpose: it is a
 * snapshot of one crawl, not a live mirror.
 */
export const SEED_BY_ORIGIN: Record<string, MerchantDraft> = {
  'http://localhost:4001': {
    tokens: {
      accent: '#FBFAF8',
      surface: '#FFFFFF',
      fontDisplay: {
        family: 'Helvetica Neue',
        weight: 600,
        href: 'https://fonts.googleapis.com/css2?family=Helvetica+Neue:wght@400;600&display=swap',
      },
      fontBody: {
        family: 'Helvetica Neue',
        weight: 400,
        href: 'https://fonts.googleapis.com/css2?family=Helvetica+Neue:wght@400;400&display=swap',
      },
      scale: 'regular',
      radius: 'md',
      elevation: 'soft',
      labelCase: 'sentence',
      density: 'comfortable',
      launcher: { style: 'bubble', position: 'bottom-right' },
    },
    logo: null,
    ok: true,
    note: 'Seeded from http://localhost:4001 — cached so the demo never waits on a network fetch.',
  },
  'http://localhost:4002': {
    tokens: {
      accent: '#C6F441',
      surface: '#FFFFFF',
      fontDisplay: {
        family: 'Inter',
        weight: 600,
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap',
      },
      fontBody: {
        family: 'Inter',
        weight: 400,
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap',
      },
      scale: 'regular',
      radius: 'pill',
      elevation: 'soft',
      labelCase: 'sentence',
      density: 'comfortable',
      launcher: { style: 'bubble', position: 'bottom-right' },
    },
    logo: null,
    ok: true,
    note: 'Seeded from http://localhost:4002 — cached so the demo never waits on a network fetch.',
  },
}
