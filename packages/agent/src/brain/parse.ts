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

function parsePriceChip(text: string): ParsedChip | null {
  const match = PRICE_PATTERN.exec(text)
  if (!match) return null
  const raw = match[1] ?? match[2]
  if (!raw) return null
  const max = Number(raw)
  return {
    id: 'chip-price',
    label: `under €${max}`,
    state: 'active',
    kind: { type: 'price-max', max },
  }
}

/** Free text → constraint chips. Exported cleanly, free of any agent/FSM state. */
export function parseChips(text: string): ParsedChip[] {
  const chips: ParsedChip[] = []
  const seen = new Set<string>()
  for (const entry of SYNONYMS) {
    if (!seen.has(entry.tag) && entry.pattern.test(text)) {
      seen.add(entry.tag)
      chips.push({
        id: `chip-${entry.tag}`,
        label: entry.label,
        state: 'active',
        kind: { type: 'tag', tag: entry.tag },
      })
    }
  }
  const priceChip = parsePriceChip(text)
  if (priceChip) chips.push(priceChip)
  return chips
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
