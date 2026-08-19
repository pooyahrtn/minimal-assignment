import type { MerchantDraft } from './extract'

/**
 * Cached extractor output for the two demo storefronts, captured once against each live store.
 * The live demo pastes one of these two URLs and must never depend on a network round-trip at
 * that moment, so `extractMerchantTokens` returns this instead of re-fetching when the URL's
 * origin matches. [TASKS T8 DoD box 5]
 *
 * The colours are read from the RENDERED page (Playwright, `getComputedStyle`): `surface` is the
 * computed `background-color` of `<body>`, `accent` the computed `background-color` of the store's
 * primary action — VELDE's `.button`, KRACHT's `bg-signal` CTA. Everything else is the text
 * crawler's own output for that URL.
 *
 * Why the colours are measured rather than crawled: the crawler reads declared CSS text, and
 * neither store declares its brand pair in a way `pickAccent`/`pickSurface` can name. VELDE calls
 * them `--paper`/`--ink` (no `background|surface|bg|base` in either name), so surface fell through
 * to the #FFFFFF default and accent landed on `--paper` — the page background itself, 1.04:1
 * against the surface it is painted on. KRACHT is Tailwind utilities with no custom properties at
 * all, so its BLACK store seeded a white surface. Both tripped the config page's accent-on-surface
 * guard, which then withholds the embed snippet: the demo opened on a self-inflicted alarm.
 * Fixing the crawler's colour heuristics is a separate job; these entries are what the stores
 * actually paint.
 *
 * Regenerate by re-measuring against the running dev servers and pasting the result back in here —
 * there is no build step that does this automatically, on purpose: it is a snapshot of one crawl,
 * not a live mirror.
 */
export const SEED_BY_ORIGIN: Record<string, MerchantDraft> = {
  'http://localhost:4001': {
    tokens: {
      // #FBFAF8 --paper (body background) · #1C1B19 --ink (.button fill) — measured 16.50:1.
      accent: '#1C1B19',
      surface: '#FBFAF8',
      fontDisplay: {
        // Empty href on purpose: the page paints in Helvetica Neue, which it does NOT load from
        // Google — the minted URL 404s on every page view. See `fontChoiceFor`.
        family: 'Helvetica Neue',
        weight: 600,
        href: '',
      },
      fontBody: {
        family: 'Helvetica Neue',
        weight: 400,
        href: '',
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
      // #121212 body background · #C6F441 the `bg-signal` CTA fill — measured 14.65:1.
      accent: '#C6F441',
      surface: '#121212',
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

/**
 * Self-check: `bun packages/agent/src/extract/seed.ts`. The one thing a wrong pair here costs is
 * the embed snippet — the config page refuses to hand one over while accent-on-surface is under
 * 3:1 — so that is what this asserts, on the same `readabilityReport` row the page guards on.
 *
 * `readabilityReport` is imported HERE, dynamically, and that is load-bearing rather than style.
 * `server.ts` imports `SEED_BY_ORIGIN` at module scope, so this file sits in the deployed
 * function's graph. Every other `@maximal/tokens` reference in that graph is an `import type`,
 * which the compiler erases — a static value import is the one kind that survives to runtime, and
 * Vercel's function bundle does not carry the workspace package. The whole platform API answered
 * 500 at BOOT (`ResolveMessage`, exit 1) on every route, including unrouted ones, until this line
 * moved inside the guard. An earlier version of this comment claimed "import-time cost is zero",
 * which was true of the block and false of the import — the distinction that cost the outage.
 */
if (import.meta.main) {
  const { readabilityReport } = await import('@maximal/tokens')
  for (const [origin, draft] of Object.entries(SEED_BY_ORIGIN)) {
    const row = readabilityReport(draft.tokens).accentOnSurface
    const line = `${origin} — accent ${draft.tokens.accent} on surface ${draft.tokens.surface}: ${row.ratio.toFixed(2)}:1 (floor ${row.floor})`
    if (!row.meets)
      throw new Error(`${line} — BELOW the floor; the config page withholds the snippet`)
    console.log(`ok ${line}`)
  }
}
