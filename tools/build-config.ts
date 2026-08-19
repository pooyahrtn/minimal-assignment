import {
  DEFAULT_BRAND,
  DEFAULT_VOICE,
  derive,
  KRACHT,
  KRACHT_VOICE,
  VELDE,
  VELDE_VOICE,
} from '@maximal/tokens'
import type { MerchantTokens, Voice } from '@maximal/tokens'
import { loadCatalog } from '../packages/agent/src/brain/catalog'
import type { ConfigResponse } from '../packages/agent/src/types'

/**
 * Build-time config generator. Everything that could change — derived tokens, voice strings, the
 * obstacle template, the catalog — is computed HERE, on our side of the wire, and shipped in the
 * payload. The embed script is a binary we cannot recall, so it must carry neither `derive()` nor
 * a 34-product catalog. [ENGINEERING §2.1]
 *
 * Writes two things from one source:
 *   1. `tools/config/{shop}.json` — the complete `/v1/config/:shop` body, catalog included.
 *   2. `packages/agent/src/fallback.ts` — the same payload as literals, catalog EMPTY, for the
 *      offline case. Generated rather than hand-written so the two cannot drift.
 */

type ShopSpec = {
  merchant: MerchantTokens
  voice: Voice
  /** `null` = no catalog at all, which is the honest shape for the unknown-key default. A path to
   * an empty JSON array would be a file on disk pretending to be data. */
  catalogPath: string | null
  strings: Record<string, string>
}

/**
 * Every user-visible string, per brand. The obstacle sentence is a TEMPLATE with `{placeholders}`
 * — the blocking constraint and its quantified cost are arithmetic in the widget, only the
 * wording is a token. [PRINCIPLES §8]
 *
 * Placeholders the widget fills:
 *   {blocking} the computed blocking chip's label · {options} how many products fit everything
 *   else (pluralised through obstacle.count.*) · {closest} the nearest price, in the catalog's
 *   own currency · {n} a count · {title} {price} one recommended product.
 */
const SHOPS: Record<string, ShopSpec> = {
  velde: {
    merchant: VELDE,
    voice: VELDE_VOICE,
    catalogPath: 'packages/agent/src/brain/catalog.velde.json',
    // No name, no face, no contractions: clipped lines, product first.
    strings: {
      'launcher.label': 'Help me choose',
      'panel.close': 'Close',
      'chips.legend': 'Looking for',
      'chips.drop': 'Drop {label}',
      'chips.restore': 'Put {label} back',
      'composer.placeholder': 'What is it for?',
      'composer.send': 'Send',
      clarify: 'Tell me the piece and what it has to do.',
      'recommend.lead': 'Matches:',
      'recommend.item': '{title} · {price}',
      'obstacle.text':
        'No match on all of it. {options} everything except “{blocking}”. Closest: {closest}. Tap “{blocking}” to drop it, or drop something else instead.',
      'obstacle.count.one': 'One piece fits',
      'obstacle.count.many': '{n} pieces fit',
      'card.specs': 'Details',
      'card.outofstock': 'Out of stock',
      'card.noimage': 'No photograph',
      'card.view': 'See the piece',
      'nomatch.heading': 'Closest without “{blocking}”',
      'nomatch.drop': 'Drop “{blocking}” and show these',
      'compare.heading': 'Side by side',
      'no-results': 'Nothing in the range does all of that. Drop a filter and I will look again.',
      'catalog.offline':
        'I cannot reach the catalogue right now, so I cannot show you pieces. Your brief is kept. Try again in a moment.',
    },
  },
  kracht: {
    merchant: KRACHT,
    voice: KRACHT_VOICE,
    catalogPath: 'packages/agent/src/brain/catalog.kracht.json',
    // Joep, a coach: warm, direct, second person, contractions.
    strings: {
      'launcher.label': 'Ask Joep',
      'panel.close': 'Close',
      'chips.legend': 'Your filters',
      'chips.drop': 'Drop {label}',
      'chips.restore': 'Put {label} back',
      'composer.placeholder': 'Tell me what you need',
      'composer.send': 'Send',
      clarify: 'Give me something to work with — a goal, an ingredient, a budget.',
      'recommend.lead': "Here's what fits:",
      'recommend.item': '{title} · {price}',
      'obstacle.text':
        "Nothing clears all of it. {options} everything except “{blocking}” — the closest is {closest}. Tap “{blocking}” to drop it and I'll show you those, or keep it and drop something else.",
      'obstacle.count.one': 'One option fits',
      'obstacle.count.many': '{n} options fit',
      'card.specs': "What's in it",
      'card.outofstock': 'Sold out',
      'card.noimage': 'No photo yet',
      'card.view': 'Take a look',
      'nomatch.heading': 'Closest if you drop “{blocking}”',
      'nomatch.drop': 'Drop “{blocking}” and show me those',
      'compare.heading': 'Side by side',
      'no-results': "Nothing in the range does all that. Drop one filter and I'll look again.",
      'catalog.offline':
        "I can't reach the catalogue right now, so I can't check what's in stock. Your filters are saved — try me again in a minute.",
    },
  },
  /**
   * The unknown-key answer, NOT a merchant. `/v1/config/:shopKey` serves this instead of a 404 so
   * a typo in `data-shop` degrades to a neutral, legible widget rather than a console error on a
   * merchant's page [TASKS T6 DoD]. Excluded from the generated `FALLBACK` below: `FALLBACK` is
   * keyed by shop and only paints when the network is gone, so an entry no embed can ever key
   * into would be pure weight in a bundle H6 caps.
   */
  default: {
    merchant: DEFAULT_BRAND,
    voice: DEFAULT_VOICE,
    catalogPath: null,
    // No persona, no house style — plain second-person English that reads as unfinished setup
    // rather than as somebody's brand voice.
    strings: {
      'launcher.label': 'Help me choose',
      'panel.close': 'Close',
      'chips.legend': 'Looking for',
      'chips.drop': 'Drop {label}',
      'chips.restore': 'Put {label} back',
      'composer.placeholder': 'What are you looking for?',
      'composer.send': 'Send',
      clarify: 'Tell me what you need and I will narrow it down.',
      'recommend.lead': 'Here is what fits:',
      'recommend.item': '{title} · {price}',
      'obstacle.text':
        'Nothing matches all of it. {options} everything except “{blocking}”. Closest: {closest}. Tap “{blocking}” to drop it, or drop something else instead.',
      'obstacle.count.one': 'One option fits',
      'obstacle.count.many': '{n} options fit',
      'card.specs': 'Details',
      'card.outofstock': 'Out of stock',
      'card.noimage': 'No image',
      'card.view': 'View',
      'nomatch.heading': 'Closest without “{blocking}”',
      'nomatch.drop': 'Drop “{blocking}” and show these',
      'compare.heading': 'Side by side',
      'no-results': 'Nothing matches all of that. Drop a filter and I will look again.',
      'catalog.offline':
        'This shop is not set up yet, so I cannot show you products. Tell the shop owner their embed key does not match a configured shop.',
    },
  },
}

/** The shop key `/v1/config` falls back to. Not a merchant; see the SHOPS entry above. */
const DEFAULT_KEY = 'default'

async function buildConfig(spec: ShopSpec): Promise<ConfigResponse> {
  return {
    tokens: derive(spec.merchant),
    voice: spec.voice,
    strings: spec.strings,
    catalog: spec.catalogPath === null ? [] : await loadCatalog(spec.catalogPath),
  }
}

const HEADER = `// GENERATED by tools/build-config.ts — do not edit by hand. Run \`bun run build:config\`.
//
// The built-in config the widget paints when \`/v1/config/:shopKey\` cannot be reached — the whole
// envelope, not just tokens, because the header needs a persona and the persona is \`Voice\`.
//
// Derived values are literals here BY DESIGN: derivation lives on our side of the wire
// [ENGINEERING §2.1], so the embed script must never carry \`derive()\` — it is a binary we cannot
// recall, and it counts against the H6 size cap. Generating them from \`derive()\` at build time is
// what keeps these numbers from drifting away from the real ones.
//
// \`catalog\` is EMPTY on purpose. The fallback is what paints when the network is gone; a bundled
// catalog is exactly the payload that belongs on the wire. A shopper still gets a greeting, their
// chips, and an honest "I cannot reach the catalogue" line rather than a blank panel.
// [ENGINEERING §2.9]

import type { ConfigResponse } from './types'
`

function constName(shop: string): string {
  return `${shop.toUpperCase()}_CONFIG`
}

function fallbackSource(configs: [string, ConfigResponse][]): string {
  const first = configs[0]
  if (first === undefined) throw new Error('build-config: no shops to generate')
  const literals = configs.map(
    ([shop, config]) =>
      `const ${constName(shop)}: ConfigResponse = ${JSON.stringify({ ...config, catalog: [] }, null, 2)}`,
  )
  const map = configs.map(([shop]) => `${shop}: ${constName(shop)}`).join(', ')
  return [
    HEADER,
    ...literals,
    `/** Keyed by \`data-shop\`. An unknown key has no brand, so the loader fails loudly instead. */
export const FALLBACK: Record<string, ConfigResponse> = { ${map} }`,
    `/**
 * The custom properties the shadow stylesheet actually references. The runtime guard checks a
 * fetched payload against this list, so "the API dropped a variable" is caught at the boundary
 * rather than as a blank panel.
 */
export const CSS_VAR_NAMES: string[] = Object.keys(${constName(first[0])}.tokens.css)`,
    '',
  ].join('\n\n')
}

const root = `${import.meta.dir}/..`
const built: [string, ConfigResponse][] = []
const written: string[] = []
for (const [shop, spec] of Object.entries(SHOPS)) {
  const config = await buildConfig(spec)
  // Next to the server that reads them and the config page (T7) that will edit them, rather than
  // in `tools/`, which only writes them.
  const path = `${root}/apps/platform/config/${shop}.json`
  await Bun.write(path, JSON.stringify(config, null, 2))
  written.push(path)
  built.push([shop, config])
}

// `default` is served but never bundled — see its SHOPS entry. Filtered before `fallbackSource`
// sees the list, so `configs[0]` (which CSS_VAR_NAMES is generated from) stays a real merchant.
const bundled = built.filter(([shop]) => shop !== DEFAULT_KEY)

const fallbackPath = `${root}/packages/agent/src/fallback.ts`
await Bun.write(fallbackPath, fallbackSource(bundled))
written.push(fallbackPath)
// Everything here is emitted from JSON.stringify, so Biome owns the final formatting rather than
// this script pretending to know the repo's quote and width rules.
Bun.spawnSync([`${root}/node_modules/.bin/biome`, 'check', '--write', ...written], {
  stdout: 'inherit',
  stderr: 'inherit',
})

// A run that generated nothing is a failure, never a pass. [ENGINEERING §3.1]
if (built.length === 0) throw new Error('build-config: 0 configs written')
for (const [shop, config] of built) {
  console.log(
    `${shop}: ${config.catalog.length} products, ${Object.keys(config.strings).length} strings, ${Object.keys(config.tokens.css).length} css vars -> apps/platform/config/${shop}.json`,
  )
}
console.log(`${built.length} configs written; fallback.ts regenerated with an empty catalog.`)
