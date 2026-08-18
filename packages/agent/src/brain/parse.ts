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
