import type { Density, Elevation, LabelCase } from '../../../tokens/src/merchant'
import type { Chip } from '../types'

/**
 * What a chip constrains: a tag a product must carry, or a price ceiling. [ENGINEERING §6]
 * `ParsedChip` extends the closed `Chip` contract rather than replacing it — it is still
 * structurally a `Chip`, so it can go straight into a `chips-update`/`no-match` block.
 */
export type ChipKind =
  | { type: 'tag'; tag: string }
  | { type: 'price-max'; max: number }
  /**
   * A GOAL rather than an attribute: the shopper named an outcome ("I want to gain muscle") and
   * the model expanded it into the attributes THIS merchant sells that serve it. Satisfied by ANY
   * of them, and that is the whole reason it is one kind rather than several `tag` chips: on
   * KRACHT no product carries both `protein` and `creatine`, so ANDing the expansion intersects to
   * zero and the obstacle sentence tells the shopper their own goal contradicts itself. One thing
   * the shopper said is one chip — dropped and restored in one tap like every other constraint.
   * [ENGINEERING §2.10]
   *
   * A `dropped` id is `chip-<tag>`, so retracting ONE alternative inside a goal ("gain muscle, but
   * no creatine") cannot strike this chip by id alone — `mergeChips` [fsm.ts] does not rely on id
   * matching for this kind. It narrows the member `tags` instead: a smaller `any-of` with 2+ left,
   * the ordinary `tag` chip this file builds for a single-attribute goal with exactly 1, or drops
   * the whole chip with 0 — the same in-place-replacement shape a new ceiling already gets against
   * a standing price chip.
   */
  | { type: 'any-of'; tags: string[] }
  /**
   * A constraint the shopper stated that this catalog cannot express — no product records it, so
   * no predicate can be written for it. It filters NOTHING; it exists to be shown. The chip row is
   * the brief and the receipt [ENGINEERING §2.10], and a brief that silently omits what was asked
   * for is neither. Carried as a chip rather than a message so it PERSISTS next to the live
   * constraints instead of scrolling away in the transcript.
   */
  | { type: 'unsupported'; phrase: string }

export type ParsedChip = Chip & { kind: ChipKind }

/**
 * The one place a `ParsedChip` is constructed, and now it has exactly ONE caller: `POST /v1/chat`
 * (`apps/platform/chat.ts`). The deterministic regex intake it used to share this file with is
 * deleted — the model is the only intake path [DECISIONS-LOG, T13 "degrade, never break"
 * override].
 *
 * The model's only degree of freedom is WHICH tags, never what a tag is called. `PRINCIPLES §8`
 * says the chip row is COMPUTED, never generated, so a label may not come off the wire from the
 * model — and it does not: the label is looked up here, server-side, out of the MERCHANT's own
 * `strings` under a `chip.label.<tag>` key [tools/build-config.ts], which is where a decision that
 * could change belongs [ENGINEERING §2.1].
 *
 * A tag with no `chip.label.*` entry falls back to THE TAG ITSELF, never to the key. That is the
 * whole handling for the ~150 runtime-minted `shop-*.json` configs, which carry no label keys at
 * all: `config.ts:47 str()` would render the missing key `chip.label.vegan` into the row, so this
 * deliberately does not go through `str()`. The catalog is the vocabulary, and a raw tag is a
 * legible label — `vegan`, `leather`, `creatine` all read fine unstyled.
 */
export function chipsFrom(
  constraints: {
    tags: string[]
    /** Attributes that serve an OUTCOME the shopper named. Alternatives, never a stack. */
    goal?: string[]
    maxPrice?: number
    unsupported?: string[]
  },
  /** The merchant's own `strings` payload. Absent means "no merchant copy" → tags label themselves. */
  strings: Record<string, string> = {},
): ParsedChip[] {
  const chips: ParsedChip[] = []
  const seen = new Set<string>()
  // Sorted, so the same goal read on two turns keeps the same id and `mergeChips` sees one chip
  // rather than two. A ONE-attribute goal is just that attribute: it becomes an ordinary tag chip
  // with the ordinary id, so a shopper who states a goal and then names the same thing out loud
  // does not end up with two chips for one constraint.
  const goal = [...new Set(constraints.goal ?? [])].sort()
  const named = goal.length === 1 ? [...constraints.tags, ...goal] : constraints.tags
  for (const tag of named) {
    if (seen.has(tag)) continue
    seen.add(tag)
    chips.push({
      id: `chip-${tag}`,
      label: strings[`chip.label.${tag}`] ?? tag,
      state: 'active',
      kind: { type: 'tag', tag },
    })
  }
  if (goal.length > 1) {
    chips.push({
      id: `chip-any-${goal.join('-')}`,
      // Computed from the merchant's own labels exactly as a tag chip is, and joined HERE rather
      // than carried on the wire: the model still never writes a word a shopper reads in the row
      // [PRINCIPLES §8]. Showing the expansion is the point — "protein or creatine" is what the
      // goal actually became, and the row is the receipt as well as the brief.
      label: goal.map((tag) => strings[`chip.label.${tag}`] ?? tag).join(' or '),
      state: 'active',
      kind: { type: 'any-of', tags: goal },
    })
  }
  const max = constraints.maxPrice
  // Finite and positive, or there is no price chip. `obstacle.ts` does `product.price - max`
  // arithmetic and `parse.ts` renders `under €${max}` straight into the chip row, so a NaN or an
  // Infinity off the wire would reach both the sentence and the row. The model is the only
  // intake path now, so it is the only thing that can produce one — and this is the only place
  // that has to care.
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

/** Which group of MerchantTokens a phrase moves. The config page shows one row per group it
 *  touched, so a merchant can see that "warmer, less rounded" did two separate things. */
export type StyleGroup = 'colour' | 'shape' | 'density' | 'scale' | 'elevation' | 'labelCase'

/**
 * A declarative intent, not an applied change: `parse.ts` is string → intent and nothing else
 * [ENGINEERING §2.4 — this stays a parser]. The OKLCH colour maths and the radius/scale ladder
 * walk live wherever `MerchantTokens` is actually mutated (the config page), which also keeps
 * this module a parser and nothing else.
 *
 * A bundle note, stated accurately because an earlier draft of it was not: `chipsFrom` IS in
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
 * `MerchantTokens` style groups, no LLM. This is T7's config-page refinement field and it is a
 * COMPLETELY DIFFERENT FEATURE from shopper intake — it merely shares the file [ENGINEERING
 * §2.4]. It survived the deletion of the regex intake path untouched, and its own entry point
 * below means a style phrase never reaches the shopper's FSM chips.
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
 * The config page's natural-language refinement field. A fixed vocabulary, no LLM, and the only
 * parser left in this file — shopper intake is the model's now [apps/platform/chat.ts].
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

  // The label source [PRINCIPLES §8: computed, never generated]. Merchant copy wins; a tag the
  // merchant never named labels itself; the missing KEY must never reach the row, which is the
  // whole ~150-minted-`shop-*.json` case.
  const labelled = chipsFrom({ tags: ['office', 'vegan'] }, { 'chip.label.office': 'office-ready' })
  check(
    labelled.map((c) => c.label).join(',') === 'office-ready,vegan',
    `expected 'office-ready,vegan', got ${JSON.stringify(labelled.map((c) => c.label))}`,
  )
  check(
    !labelled.some((c) => c.label.startsWith('chip.label.')),
    'a missing label key reached the chip row as a raw key string',
  )
  // An unsupported phrase is a disclosure, never a filter: last in the row, never `active`.
  const disclosed = chipsFrom({ tags: ['vegan'], unsupported: ['exactly one button'] })
  check(
    disclosed.map((c) => c.state).join(',') === 'active,unsupported',
    `expected active,unsupported, got ${JSON.stringify(disclosed.map((c) => c.state))}`,
  )

  check(count > 0, 'self-check made zero assertions')
  console.log(`parse.ts self-check: ${count} assertions passed`)
}
