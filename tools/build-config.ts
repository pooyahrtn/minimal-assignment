import {
  DEFAULT_BRAND,
  DEFAULT_VOICE,
  derive,
  HELDER,
  HELDER_VOICE,
  KRACHT,
  KRACHT_VOICE,
  VELDE,
  VELDE_VOICE,
} from '@maximal/tokens'
import type { MerchantTokens, Voice } from '@maximal/tokens'
import { loadCatalog } from '../packages/agent/src/brain/catalog'
import type { ConfigResponse, Product } from '../packages/agent/src/types'

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
  /** `null` = the catalog's own product URLs are this shop's own. Non-null for a brand that
   * borrows another brand's catalog: see `relink` below. */
  productOrigin: string | null
  strings: Record<string, string>
}

/**
 * The house-neutral string set. `default` uses it as-is; a new brand spreads it and overrides only
 * the lines that carry voice, so adding a brand does not mean authoring 24 strings by hand.
 * A named const rather than an optional `ShopSpec.strings` — ENGINEERING §2.7 prefers non-optional
 * types, and an optional field would put a branch in `buildConfig()` for no gain.
 */
const NEUTRAL_STRINGS: Record<string, string> = {
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
  'chips.cannot': 'I cannot filter on {labels}. The rest of the brief is applied.',
  'no-results': 'Nothing matches all of that. Drop a filter and I will look again.',
  'catalog.offline':
    'This shop is not set up yet, so I cannot show you products. Tell the shop owner their embed key does not match a configured shop.',
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
    productOrigin: null,
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
      'chips.cannot': 'I cannot filter on {labels}. The rest of the brief is applied.',
      'no-results': 'Nothing in the range does all of that. Drop a filter and I will look again.',
      'catalog.offline':
        'I cannot reach the catalogue right now, so I cannot show you pieces. Your brief is kept. Try again in a moment.',
    },
  },
  kracht: {
    merchant: KRACHT,
    voice: KRACHT_VOICE,
    catalogPath: 'packages/agent/src/brain/catalog.kracht.json',
    productOrigin: null,
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
      'chips.cannot': "I can't filter on {labels} — it's not in the product data.",
      'no-results': "Nothing in the range does all that. Drop one filter and I'll look again.",
      'catalog.offline':
        "I can't reach the catalogue right now, so I can't check what's in stock. Your filters are saved — try me again in a minute.",
    },
  },
  /**
   * T11's third brand. Ten lines and no new code — that is the whole claim: it reuses VELDE's
   * catalog on purpose, because "same products, same renderers, unrecognisably different brand"
   * is the token system's proof. A third catalog would be an asset task, not a token one.
   *
   * `NEUTRAL_STRINGS` spread with only the lines that would otherwise lie: the neutral
   * `catalog.offline` tells a shopper the shop is not set up, which is false for a configured
   * merchant, and the neutral launcher label is byte-identical to VELDE's.
   */
  helder: {
    merchant: HELDER,
    voice: HELDER_VOICE,
    catalogPath: 'packages/agent/src/brain/catalog.velde.json',
    // Reserved, unbuilt, and unresolvable by construction — `.example` is IANA-reserved, so this
    // can never become somebody's real site. HELDER has no storefront; a link that says so is the
    // honest one. [COMPLAINS T11]
    productOrigin: 'https://helder.example',
    strings: {
      ...NEUTRAL_STRINGS,
      'launcher.label': 'Find me something',
      'composer.placeholder': 'What are you after?',
      // Without this override `clarify` reads 'Tell me what you need and I will narrow it down.',
      // three bubbles from the greeting and near-verbatim to it — it reads as a repeat bug.
      clarify: 'Give me the occasion, or a budget, and I will work from there.',
      'catalog.offline':
        'I cannot reach the catalogue right now, so I cannot show you anything. Your filters are kept — try again in a moment.',
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
    productOrigin: null,
    // No persona, no house style — plain second-person English that reads as unfinished setup
    // rather than as somebody's brand voice.
    strings: NEUTRAL_STRINGS,
  },
}

/** The shop key `/v1/config` falls back to. Not a merchant; see the SHOPS entry above. */
const DEFAULT_KEY = 'default'

/**
 * A brand that borrows another brand's catalog must not borrow its links. `url` navigates a
 * shopper to a merchant, so HELDER's cards pointing at VELDE's storefront put a shopper in another
 * shop under HELDER's name — the one part of the reuse that lies. [COMPLAINS T11]
 *
 * `image` is left alone on purpose: a photo is an asset we serve, it names no merchant, and
 * rewriting it to an origin nothing answers would blank every card.
 */
const relink =
  (origin: string) =>
  (product: Product): Product => ({ ...product, url: `${origin}${new URL(product.url).pathname}` })

async function buildConfig(spec: ShopSpec): Promise<ConfigResponse> {
  const catalog = spec.catalogPath === null ? [] : await loadCatalog(spec.catalogPath)
  return {
    tokens: derive(spec.merchant),
    voice: spec.voice,
    strings: spec.strings,
    catalog: spec.productOrigin === null ? catalog : catalog.map(relink(spec.productOrigin)),
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
  built.push([shop, await buildConfig(spec)])
}

// Two shops sharing a product URL means one of them links into the other's storefront. Nothing
// else in the tree checks catalog distinctness, and this is where every config is in hand at
// once. It throws BEFORE anything is written, so a bad config never reaches disk. [COMPLAINS T11]
const owners = new Map<string, string>()
for (const [shop, config] of built) {
  for (const product of config.catalog) {
    const owner = owners.get(product.url)
    if (owner !== undefined) {
      throw new Error(`build-config: ${shop} and ${owner} both ship ${product.url}`)
    }
    owners.set(product.url, shop)
  }
}

for (const [shop, config] of built) {
  // Next to the server that reads them and the config page (T7) that will edit them, rather than
  // in `tools/`, which only writes them.
  const path = `${root}/apps/platform/config/${shop}.json`
  await Bun.write(path, JSON.stringify(config, null, 2))
  written.push(path)
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
