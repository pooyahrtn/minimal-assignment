import type { Density, Elevation, LabelCase } from '../../../tokens/src/merchant'
import type { Chip, Product } from '../types'

/**
 * What a chip constrains: a tag a product must carry, or a price ceiling. [ENGINEERING §6]
 * `ParsedChip` extends the closed `Chip` contract rather than replacing it — it is still
 * structurally a `Chip`, so it can go straight into a `chips-update`/`no-match` block.
 */
export type ChipKind =
  | { type: 'tag'; tag: string }
  | { type: 'price-max'; max: number }
  /**
   * A constraint the shopper stated that this catalog cannot express — no product records it, so
   * no predicate can be written for it. It filters NOTHING; it exists to be shown. The chip row is
   * the brief and the receipt [ENGINEERING §2.10], and a brief that silently omits what was asked
   * for is neither. Carried as a chip rather than a message so it PERSISTS next to the live
   * constraints instead of scrolling away in the transcript.
   */
  | { type: 'unsupported'; phrase: string }

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

/**
 * Catalog tags a shopper names with the tag's own word — matched and labelled verbatim, so they
 * cost one word each instead of a table row (the widget has ~600 B of gzip headroom, and 14 rows
 * do not fit in it). A `-` in a tag matches a space or nothing too, so `pre-workout` also answers
 * to "pre workout" and "preworkout". The colours are `catalog.velde.json`'s own, which is what
 * makes "rather have navy" a constraint instead of noise.
 *
 * `protein` is deliberately absent even though it is all over `catalog.kracht.json`: it selects
 * the identical product set as `protein-shake`, and `offerableTags` in `apps/platform/chat.ts`
 * breaks that tie by asking `parserKnowsTag` — teaching the parser both names would hand the slot
 * to the vaguer one and put two chips on one constraint.
 */
const PLAIN_TAGS =
  'vegan halal creatine pre-workout navy camel olive charcoal stone sand tan ecru knitwear leather'

/**
 * Words that flip the tag they precede from "add this" to "drop this". Deliberately tiny and
 * positional: this is a fixed-vocabulary parser, so "a few words before the tag" is the whole
 * theory of negation. `negatedAt` masks every other match out of that window first, which is what
 * keeps the `no` in "no sweeteners, lactose-free" from cancelling `lactose-free`.
 */
const NEGATORS = /\b(?:no|not|without|forget|rather than|instead of)\b/i

/**
 * Price constraints come out by regex, never a table entry. The trigger word carries the meaning,
 * so the currency marker is optional (`under €30`, `under EUR30`, `under 30 euros`, `max 30`) —
 * but a bare number alone is never a budget, and the unit lookahead keeps "1 kg" and "24 g
 * protein" out of it.
 */
const PRICE_PATTERN =
  /(?:under|below|less than|max(?:imum)?|up to)\s*(?:€|eur(?:os?)?)?\s*(\d+(?:\.\d+)?)(?!\s*(?:k?g|ml|servings?)\b)|€\s*(\d+(?:\.\d+)?)\s*(?:or less|max)/i

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
export function chipsFrom(constraints: {
  tags: string[]
  maxPrice?: number
  unsupported?: string[]
}): ParsedChip[] {
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
  // Last in the row, and never `active`: an unsupported chip is a disclosure, not a filter, and
  // `intersect`/`findObstacle` both read `state === 'active'` only — so this kind reaches neither
  // without a line of code in either file.
  for (const phrase of constraints.unsupported ?? []) {
    const id = `chip-unsupported-${phrase.toLowerCase().replace(/\W+/g, '-')}`
    if (seen.has(id)) continue
    seen.add(id)
    chips.push({ id, label: phrase, state: 'unsupported', kind: { type: 'unsupported', phrase } })
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
  return SYNONYMS.some((entry) => entry.tag === tag) || PLAIN_TAGS.split(' ').includes(tag)
}

type Hit = { tag: string; start: number; end: number }

/**
 * Every vocabulary entry that fires on this sentence, with WHERE it fired — the position is what
 * the negation pass needs. `allowed`, when given, is the catalog's own tag set: a tag the shop
 * does not sell is not part of that shop's vocabulary, which is what stops KRACHT (a protein
 * store) from chipping "a black jacket for the office". Undefined means "no catalog in hand" —
 * the whole table, as before.
 */
function findHits(text: string, allowed?: Set<string>): Hit[] {
  const hits: Hit[] = []
  const push = (tag: string, pattern: RegExp): void => {
    if (allowed !== undefined && !allowed.has(tag)) return
    const match = pattern.exec(text)
    if (match !== null) hits.push({ tag, start: match.index, end: match.index + match[0].length })
  }
  for (const entry of SYNONYMS) push(entry.tag, entry.pattern)
  for (const tag of PLAIN_TAGS.split(' ')) {
    push(tag, new RegExp(`\\b${tag.replace('-', '[- ]?')}\\b`, 'i'))
  }
  return hits
}

/**
 * Whether a negator sits in the three words immediately BEFORE this match. Before only: English
 * puts the negation first ("forget black", "without lactose", "instead of navy"), and looking
 * after it would let "whey protein powder without any of that stuff" cancel the protein shake it
 * is asking for. `masked` is the sentence with every match blanked out, so the `no` inside "no
 * sweeteners" cannot also negate the `lactose-free` three words later.
 */
function negatedAt(masked: string, hit: Hit): boolean {
  const words = masked.slice(0, hit.start).split(/\W+/).filter(Boolean).slice(-3)
  return NEGATORS.test(words.join(' '))
}

/**
 * Numbers, digits or spelled out. A quantified attribute is the one shape of "I asked for
 * something you do not stock data about" that a fixed-vocabulary parser can recognise with high
 * precision, because a number that survived both the tag mask and the price mask is, by
 * elimination, quantifying something this catalog has no field for.
 */
/**
 * A number that survived BOTH the tag mask and the price mask is, by elimination, quantifying
 * something this catalog has no field for. Digits always count. Spelled-out numerals only count
 * behind an intensifier, because "one" is a pronoun as often as it is a number — `I need one that
 * works` must not read as a constraint, while `exactly one button` must.
 */
const QUANTIFIED =
  /(?:(?:exactly|only|just|with)\s+(?:one|two|three|four|five)|(?:\w+\s+)?\d+(?:[.,]\d+)?)(?:\s+\w+){0,2}/gi

/**
 * Quantified phrases left over after everything the vocabulary understood has been masked out:
 * "exactly one button", "size 52 long", "2 kg tub", "around 250".
 *
 * DELIBERATELY NARROW, and the narrowness is the design. The obvious alternative — treat every
 * leftover content word as unsupported and filter it through a stop-list — was tried against the
 * two verbatim opening messages of `PRINCIPLES §8` and yields "I cannot filter on ‘wear’",
 * "‘ideally’", "‘please’". A false disclosure is worse than silence: it makes the agent look
 * broken on the one message the demo is graded on, and the stop-list needed to suppress it is
 * open-ended conversational filler with no end to it. Precision first; recall is the model's job.
 *
 * KNOWN GAP, stated rather than hidden: unquantified attributes ("waterproof", "arrives before
 * Friday", "my mother would like") are NOT caught here and still pass silently. `limits.test.ts`
 * keeps a row per missed case, so the gap is a number that can move rather than a comment that
 * rots.
 */
function unsupportedIn(masked: string): string[] {
  const phrases: string[] = []
  for (const match of masked.matchAll(QUANTIFIED)) {
    const phrase = match[0].trim().replace(/\s+/g, ' ')
    if (phrase.length > 0 && !phrases.includes(phrase)) phrases.push(phrase)
  }
  return phrases
}

/** What one turn of free text asks for, what it takes back, and what it asked for in vain. */
export type Intake = {
  chips: ParsedChip[]
  /** Chip ids the shopper just cancelled — dropped by `fsm.ts` if they are already in the row. */
  dropped: string[]
  /** Constraints this catalog cannot express. Shown, never filtered on. */
  unsupported: string[]
}

/**
 * Free text → constraint chips, plus the constraints this turn RETRACTS. Exported cleanly, free
 * of any agent/FSM state; `catalog` is read-only vocabulary scoping, never retrieval.
 */
export function parseIntake(text: string, catalog?: Product[]): Intake {
  const allowed = catalog === undefined ? undefined : new Set(catalog.flatMap((p) => p.tags))
  const hits = findHits(text, allowed)
  const blank = (source: string, start: number, end: number): string =>
    source.slice(0, start) + ' '.repeat(end - start) + source.slice(end)
  let masked = text
  for (const hit of hits) masked = blank(masked, hit.start, hit.end)
  const tags: string[] = []
  const dropped: string[] = []
  for (const hit of hits) {
    if (negatedAt(masked, hit)) dropped.push(`chip-${hit.tag}`)
    else tags.push(hit.tag)
  }
  // The budget is masked out too, and only here — `negatedAt` above must still see the sentence
  // with prices in it, or "no less than 200" loses the word its window is looking for. What is
  // left after this second pass is the residue `unsupportedIn` reads: every number the parser did
  // NOT turn into a ceiling.
  const price = PRICE_PATTERN.exec(masked)
  if (price !== null) masked = blank(masked, price.index, price.index + price[0].length)
  const unsupported = unsupportedIn(masked)
  return {
    chips: chipsFrom({ tags, maxPrice: parsePriceMax(text), unsupported }),
    dropped,
    unsupported,
  }
}

/** The additive half of `parseIntake`, for callers with no chip row to retract from. */
export function parseChips(text: string, catalog?: Product[]): ParsedChip[] {
  return parseIntake(text, catalog).chips
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

  const ids = (chips: ParsedChip[]): string[] => chips.map((c) => c.id)
  const priceOf = (text: string): number | undefined => {
    const chip = parseChips(text).find((c) => c.kind.type === 'price-max')
    return chip?.kind.type === 'price-max' ? chip.kind.max : undefined
  }
  for (const [text, expected] of [
    ['under €30', 30],
    ['under EUR30', 30],
    ['under 30 euros', 30],
    ['max 30', 30],
    ['below 30', 30],
    ['up to 30', 30],
    ['€30 or less', 30],
    ['1 kg of whey with 24 g protein per serving', undefined],
    ['a 2 kg tub', undefined],
  ] as const) {
    check(priceOf(text) === expected, `price parse of ${JSON.stringify(text)} was ${priceOf(text)}`)
  }

  // Vocabulary is scoped to the catalog being searched: same sentence, two shops, no leak.
  const shop = (tags: string[]): Product[] => [
    {
      id: 'p',
      title: 'p',
      url: '',
      image: null,
      price: 1,
      currency: 'EUR',
      inStock: true,
      specs: [],
      tags,
    },
  ]
  const supplements = shop(['protein-shake', 'lactose-free', 'vegan'])
  const clothes = shop(['jacket', 'office', 'black', 'navy'])
  check(
    parseChips('a black jacket for the office', supplements).length === 0,
    'clothing vocabulary leaked into a supplement catalog',
  )
  check(
    parseChips('a lactose-free vegan protein shake', clothes).length === 0,
    'supplement vocabulary leaked into a clothing catalog',
  )

  // Negation drops the tag it precedes, and only that one.
  const mindChange = parseIntake('actually forget black, I would rather have navy', clothes)
  check(
    ids(mindChange.chips).join(',') === 'chip-navy',
    `expected only chip-navy, got ${JSON.stringify(ids(mindChange.chips))}`,
  )
  check(
    mindChange.dropped.join(',') === 'chip-black',
    `expected chip-black dropped, got ${JSON.stringify(mindChange.dropped)}`,
  )
  // The opening messages contain negator words INSIDE their own matches; neither may self-cancel.
  check(
    parseIntake('a protein shake with no sweeteners, lactose-free').dropped.length === 0,
    "'no sweeteners' must not negate the 'lactose-free' that follows it",
  )
  check(
    parseIntake('Black, nothing shiny, and ideally under €250').dropped.length === 0,
    "'nothing shiny' is the matte constraint, not a negation of it",
  )

  check(count > 0, 'self-check made zero assertions')
  console.log(`parse.ts self-check: ${count} assertions passed`)
}
