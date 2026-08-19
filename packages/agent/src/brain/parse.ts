import type { Density, Elevation, LabelCase } from '../../../tokens/src/merchant'
import type { Chip } from '../types'

/**
 * What a chip constrains: a tag a product must carry, or a price ceiling. [ENGINEERING §6]
 * `ParsedChip` extends the closed `Chip` contract rather than replacing it — it is still
 * structurally a `Chip`, so it can go straight into a `chips-update`/`no-match` block.
 */
export type ChipKind = { type: 'tag'; tag: string } | { type: 'price-max'; max: number }

export type ParsedChip = Chip & { kind: ChipKind }

type SynonymEntry = { pattern: RegExp; tag: string; label: string }

/**
 * Keyword/synonym map matched phrase-by-phrase against the sentence — never a match on the
 * whole sentence. This is the one module T4's intake and T7's config-page refinement field both
 * import. [ENGINEERING §2.4]
 */
const SYNONYMS: SynonymEntry[] = [
  {
    pattern: /protein shake|protein powder|whey protein/i,
    tag: 'protein-shake',
    label: 'protein shake',
  },
  {
    pattern: /no sweeteners?|sweetener[- ]free|unsweetened/i,
    tag: 'no-sweeteners',
    label: 'no sweeteners',
  },
  {
    pattern: /lactose[- ]free|no lactose|dairy[- ]free/i,
    tag: 'lactose-free',
    label: 'lactose-free',
  },
  { pattern: /\bjacket\b|\bcoat\b/i, tag: 'jacket', label: 'jacket' },
  { pattern: /\boffice\b|workwear|smart casual/i, tag: 'office', label: 'office-ready' },
  { pattern: /\bbike\b|\bcycling\b|\bcommut(e|ing)\b/i, tag: 'bike', label: 'bike-ready' },
  { pattern: /\bblack\b/i, tag: 'black', label: 'black' },
  { pattern: /nothing shiny|not shiny|no shine|\bmatte\b/i, tag: 'matte', label: 'matte finish' },
]

/** Price constraints come out by regex, never a table entry. */
const PRICE_PATTERN =
  /(?:under|below|less than|max(?:imum)?)\s*€\s*(\d+(?:\.\d+)?)|€\s*(\d+(?:\.\d+)?)\s*(?:or less|max)/i

/** The ceiling itself, not a chip: `chipsFrom` below is the one place a chip is built. */
function parsePriceMax(text: string): number | undefined {
  const match = PRICE_PATTERN.exec(text)
  if (!match) return undefined
  const raw = match[1] ?? match[2]
  if (!raw) return undefined
  return Number(raw)
}

/**
 * The one place a `ParsedChip` is constructed, with two callers: `parseChips` below (the
 * deterministic path) and `POST /v1/chat` (the model path, T13). Both therefore emit the same
 * `id` and the same `label` for the same tag — which is what makes T13's DoD box 2 ("three
 * openings reach the same chips as the verbatim §8 message") a property of the code rather than
 * a coincidence the model has to reproduce. The model's only degree of freedom is WHICH tags,
 * never what a tag is called: `PRINCIPLES §8` says the chip row is computed, never generated, so
 * a label may not come off the wire. A tag with no table entry falls back to the tag itself
 * rather than being dropped — the catalog is the vocabulary, and `build-config.ts` can add a tag
 * the table has never named.
 */
export function chipsFrom(constraints: { tags: string[]; maxPrice?: number }): ParsedChip[] {
  const chips: ParsedChip[] = []
  const seen = new Set<string>()
  for (const tag of constraints.tags) {
    if (seen.has(tag)) continue
    seen.add(tag)
    chips.push({
      id: `chip-${tag}`,
      label: SYNONYMS.find((entry) => entry.tag === tag)?.label ?? tag,
      state: 'active',
      kind: { type: 'tag', tag },
    })
  }
  const max = constraints.maxPrice
  // Finite and positive, or there is no price chip. `obstacle.ts` does `product.price - max`
  // arithmetic and `parse.ts` renders `under €${max}` straight into the chip row, so a NaN or an
  // Infinity off the wire would reach both the sentence and the row. The regex path cannot
  // produce one; the model path can, and this is the only place that has to care.
  if (max !== undefined && Number.isFinite(max) && max > 0) {
    chips.push({
      id: 'chip-price',
      label: `under €${max}`,
      state: 'active',
      kind: { type: 'price-max', max },
    })
  }
  return chips
}

/**
 * Whether the deterministic table names this tag. `POST /v1/chat` uses it to decide which of two
 * co-extensive catalog tags to offer the model, so both paths agree on what a constraint is called
 * [apps/platform/chat.ts]. A function, not a module-scope `Set`: this module IS in the bundle via
 * `fsm.ts`, and a top-level call is the thing DCE cannot prove pure — the +1859 B in this file's
 * header is that mistake, already made once.
 */
export function parserKnowsTag(tag: string): boolean {
  return SYNONYMS.some((entry) => entry.tag === tag)
}

/** Free text → constraint chips. Exported cleanly, free of any agent/FSM state. */
export function parseChips(text: string): ParsedChip[] {
  const tags = SYNONYMS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.tag)
  return chipsFrom({ tags, maxPrice: parsePriceMax(text) })
}

/** Which group of MerchantTokens a phrase moves. The config page shows one row per group it
 *  touched, so a merchant can see that "warmer, less rounded" did two separate things. */
export type StyleGroup = 'colour' | 'shape' | 'density' | 'scale' | 'elevation' | 'labelCase'

/**
 * A declarative intent, not an applied change: `parse.ts` is string → intent and nothing else
 * [ENGINEERING §2.4 — this stays a parser]. The OKLCH colour maths and the radius/scale ladder
 * walk live wherever `MerchantTokens` is actually mutated (the config page), which also keeps
 * this module a parser and nothing else.
 *
 * A bundle note, stated accurately because an earlier draft of it was not: `parseChips` IS in
 * `boot.ts`'s import graph via `fsm.ts` and `parseStylePhrases` is not, and Bun tree-shakes the
 * latter out of `agent.js` cleanly — a plain value import here costs ~2 B, not the 1859 B the
 * first draft claimed. That 1859 B was real but had a different cause: the table's entries used
 * to call a user-defined helper at module scope inside the array literal, and DCE cannot prove a
 * top-level call to a non-builtin is side-effect free, so it kept the declaration and its whole
 * closure. Literal deltas are provably pure. Watch module-scope calls, not imports.
 */
export type StyleDelta =
  | { kind: 'hue'; degrees: number; toward: number } // rotate accent hue toward `toward`, shorter arc, clamped at `degrees`
  | { kind: 'chroma'; delta: number }
  | { kind: 'lightness'; delta: number }
  | { kind: 'radius'; steps: number } // +1 rounder, -1 sharper, ladder-clamped by the applier
  | { kind: 'scale'; steps: number } // +1 bigger, -1 smaller, ladder-clamped by the applier
  | { kind: 'density'; value: Density }
  | { kind: 'elevation'; value: Elevation }
  | { kind: 'labelCase'; value: LabelCase }

export type StyleEdit = {
  group: StyleGroup
  /** The phrase as the merchant typed it, for the undo label and the visible delta list. */
  matched: string
  /** Human sentence for the delta list, e.g. "warmer — accent hue rotated toward orange". */
  describe: string
  delta: StyleDelta
}

type StyleEntry = {
  group: StyleGroup
  pattern: RegExp
  describe: string
  delta: StyleDelta
}

/**
 * The config page's natural-language refinement field: a fixed vocabulary over the six
 * `MerchantTokens` style groups, no LLM. One row per phrase, matched independently of
 * `SYNONYMS` above — deliberately in the same module [ENGINEERING §2.4], a separate table and a
 * separate entry point so a style phrase never reaches the shopper's FSM chips.
 *
 * Two pairs need help staying in their own lane because one phrase is a literal substring of
 * the other's trigger word: "softer corners" (shape) is not allowed to also fire colour's
 * "softer", and "tighter text" (scale) is not allowed to also fire density's "tighter" — both
 * excluded with a negative lookahead rather than by table order, since the two entries live in
 * different groups and table order can't arbitrate between groups.
 */
const STYLE_TABLE: StyleEntry[] = [
  {
    group: 'colour',
    pattern: /warmer|warm it up|cosier|cozier/i,
    describe: 'warmer — accent hue rotated toward orange',
    delta: { kind: 'hue', degrees: 18, toward: 60 },
  },
  {
    group: 'colour',
    pattern: /cooler|cool it down|calmer/i,
    describe: 'cooler — accent hue rotated toward blue',
    delta: { kind: 'hue', degrees: 18, toward: 250 },
  },
  {
    group: 'colour',
    pattern: /bolder|punchier|more vivid|more saturated/i,
    describe: 'bolder — accent colour made more vivid',
    delta: { kind: 'chroma', delta: 0.04 },
  },
  {
    group: 'colour',
    pattern: /softer(?!\s+corners)|muted|less saturated|subtler/i,
    describe: 'softer — accent colour made more muted',
    delta: { kind: 'chroma', delta: -0.04 },
  },
  {
    group: 'colour',
    pattern: /\bdarker\b/i,
    describe: 'darker — accent colour deepened',
    delta: { kind: 'lightness', delta: -0.08 },
  },
  {
    group: 'colour',
    pattern: /\blighter\b/i,
    describe: 'lighter — accent colour lightened',
    delta: { kind: 'lightness', delta: 0.08 },
  },
  {
    group: 'shape',
    pattern: /less rounded|sharper|squarer|boxier/i,
    describe: 'less rounded — corner radius stepped down',
    delta: { kind: 'radius', steps: -1 },
  },
  {
    group: 'shape',
    pattern: /more rounded|rounder|softer corners/i,
    describe: 'more rounded — corner radius stepped up',
    delta: { kind: 'radius', steps: 1 },
  },
  {
    group: 'density',
    pattern: /more compact|\btighter\b(?!\s+text)|denser/i,
    describe: 'more compact — spacing tightened',
    delta: { kind: 'density', value: 'compact' },
  },
  {
    group: 'density',
    pattern: /roomier|more spacious|airier|looser/i,
    describe: 'roomier — spacing loosened',
    delta: { kind: 'density', value: 'comfortable' },
  },
  {
    group: 'scale',
    pattern: /bigger text|larger text|more generous/i,
    describe: 'bigger text — type scale stepped up',
    delta: { kind: 'scale', steps: 1 },
  },
  {
    group: 'scale',
    pattern: /smaller text|tighter text/i,
    describe: 'smaller text — type scale stepped down',
    delta: { kind: 'scale', steps: -1 },
  },
  {
    group: 'elevation',
    pattern: /flatter|no shadow|\bflat\b/i,
    describe: 'flatter — shadows removed',
    delta: { kind: 'elevation', value: 'hairline' },
  },
  {
    group: 'elevation',
    pattern: /\blift\b|more depth|raised|floating/i,
    describe: 'more depth — shadows added',
    delta: { kind: 'elevation', value: 'soft' },
  },
  {
    group: 'labelCase',
    pattern: /shouty labels|uppercase labels|\bcaps\b/i,
    describe: 'shouty labels — labels set to uppercase with tracking',
    delta: { kind: 'labelCase', value: 'upper-tracked' },
  },
  {
    group: 'labelCase',
    pattern: /quieter labels|sentence case|normal labels/i,
    describe: 'quieter labels — labels set to sentence case',
    delta: { kind: 'labelCase', value: 'sentence' },
  },
]

/**
 * The config page's natural-language refinement field. A fixed vocabulary, no LLM — the same
 * shape as `parseChips` above and deliberately in the same module [ENGINEERING §2.4], but a
 * separate table and a separate entry point so style phrases never reach the shopper's FSM.
 */
export function parseStylePhrases(text: string): StyleEdit[] {
  const edits: StyleEdit[] = []
  const seen = new Set<StyleGroup>()
  for (const entry of STYLE_TABLE) {
    if (seen.has(entry.group)) continue
    const match = entry.pattern.exec(text)
    if (match === null) continue
    seen.add(entry.group)
    edits.push({
      group: entry.group,
      matched: match[0],
      describe: entry.describe,
      delta: entry.delta,
    })
  }
  return edits
}

// Non-trivial logic leaves one runnable check behind (universal DoD). Guarded by
// `import.meta.main` so it never runs (and, since this module is never the bundle's entry point,
// never survives dead-code elimination into) the shipped `agent.js`.
if (import.meta.main) {
  let count = 0
  const check = (condition: boolean, message: string): void => {
    count++
    if (!condition) throw new Error(`parse.ts self-check failed: ${message}`)
  }

  const threeGroups = parseStylePhrases('warmer, less rounded, more compact')
  check(threeGroups.length === 3, `expected 3 edits, got ${threeGroups.length}`)
  check(
    threeGroups.map((e) => e.group).join(',') === 'colour,shape,density',
    `expected colour,shape,density order, got ${threeGroups.map((e) => e.group).join(',')}`,
  )

  check(
    parseStylePhrases('a protein shake with no sweeteners').length === 0,
    'style phrases must not fire on shopper-vocabulary text',
  )
  check(
    parseChips('warmer, less rounded').length === 0,
    'shopper chips must not fire on style-vocabulary text',
  )

  const shapeDown = parseStylePhrases('less rounded').find((e) => e.group === 'shape')
  check(shapeDown !== undefined, "'less rounded' did not produce a shape edit")
  check(
    shapeDown !== undefined && shapeDown.delta.kind === 'radius' && shapeDown.delta.steps === -1,
    "'less rounded' should emit a radius delta with steps: -1",
  )

  const GROUP_PHRASES: Record<StyleGroup, string> = {
    colour: 'warmer',
    shape: 'less rounded',
    density: 'more compact',
    scale: 'bigger text',
    elevation: 'flatter',
    labelCase: 'shouty labels',
  }
  for (const [group, phrase] of Object.entries(GROUP_PHRASES)) {
    const edits = parseStylePhrases(phrase)
    check(
      edits.length === 1 && edits[0]?.group === group,
      `phrase '${phrase}' did not reach group '${group}' (got ${JSON.stringify(edits.map((e) => e.group))})`,
    )
  }

  check(count > 0, 'self-check made zero assertions')
  console.log(`parse.ts self-check: ${count} assertions passed`)
}
