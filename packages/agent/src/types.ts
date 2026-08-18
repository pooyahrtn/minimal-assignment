import type { DerivedTokens, Voice } from '@maximal/tokens'

/**
 * Normalised product. PRINCIPLES §6 — messy JSON-LD is cleaned once, at ingest, and nothing
 * downstream sees a half-normalised product. [ENGINEERING §2.5]
 *
 * `specs` is deliberately `{label,value}[]`: the product card must render MARENNE's
 * "key ingredients" and KLYFT's "waterproof rating" with no schema-specific code.
 */
export type Product = {
  id: string
  title: string
  url: string
  /** null, not optional — the missing-image case is real and every caller must handle it. */
  image: string | null
  price: number
  currency: string
  inStock: boolean
  specs: { label: string; value: string }[]
  /** Structured attributes derived at ingest; each constraint chip is a predicate over these. */
  tags: string[]
}

/**
 * The shopper's accumulated brief, made visible. A dropped chip stays in the row struck through
 * rather than being evicted — the row is both the brief and the receipt. [ENGINEERING §2.10]
 */
export type Chip = {
  id: string
  label: string
  state: 'active' | 'dropped'
}

/** The 7 message blocks of PRINCIPLES §8, one renderer each, closed with a `never` default. */
export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'quick-replies'; prompt: string; options: { id: string; label: string }[] }
  | { kind: 'chips-update'; chips: Chip[] }
  | { kind: 'product-card'; product: Product; reason: string }
  | { kind: 'product-compare'; products: Product[]; rows: { label: string; values: string[] }[] }
  | {
      kind: 'no-match'
      /** The single chip whose removal yields results — computed, never scripted. */
      blocking: Chip
      /** Near misses, with the gap quantified: "€48, eight over". */
      closest: { product: Product; gap: string }[]
      /** The chip row as it would read if `blocking` were dropped. */
      alternatives: Chip[]
    }
  | { kind: 'cta'; label: string; href: string }

/**
 * The config API envelope. ADD fields, never repurpose or remove one — an embedded script from
 * last month still has to render whatever this returns. [ENGINEERING §2.2]
 */
export type ConfigResponse = {
  tokens: DerivedTokens
  voice: Voice
  /**
   * Every user-visible string the widget renders, keyed. Templates carry `{placeholders}` the
   * widget interpolates — the obstacle sentence is a template plus arithmetic, never a hardcoded
   * sentence.
   *
   * This survives the localization descope on its own merits: the embed script is a binary we
   * cannot recall, so copy that lives inside it can only be fixed by every merchant re-pasting
   * their script tag [ENGINEERING §2.1]. One language, still server-owned.
   * `noUncheckedIndexedAccess` makes a missing key `string | undefined`, so a gap is a type error
   * at the callsite rather than the word "undefined" on a merchant's page.
   */
  strings: Record<string, string>
  catalog: Product[]
}
