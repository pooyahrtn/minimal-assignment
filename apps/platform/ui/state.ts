import type { MerchantTokens, RadiusStep, Scale } from '@maximal/tokens'
import type { StyleDelta, StyleEdit } from '../../../packages/agent/src/brain/parse'
import {
  gamutMap,
  hexToRgb,
  oklchToRgb,
  rgbToHex,
  rgbToOklch,
} from '../../../packages/tokens/src/oklch'

/**
 * One history stack for the whole page, so undo means the same thing on a colour picker, a
 * segmented control and the natural-language field [T7 DoD box 5]. `entries[0]` is always what
 * the extractor handed us, which is what makes "reset to detected" a stack operation rather than
 * a second source of truth to keep in sync.
 *
 * A natural-language phrase can move three token groups at once, so undo is transactional: one
 * push per user action, never one per field it happened to touch. Undoing "warmer, less rounded,
 * more compact" puts back all three, which is what the merchant means by undo.
 */
export type HistoryEntry = {
  tokens: MerchantTokens
  /** Shown on the undo button, so the merchant knows what they are about to take back. */
  label: string
}

export class Editor {
  private entries: HistoryEntry[]
  private readonly listeners: (() => void)[] = []

  constructor(detected: MerchantTokens) {
    this.entries = [{ tokens: detected, label: 'what we found' }]
  }

  get tokens(): MerchantTokens {
    const last = this.entries[this.entries.length - 1]
    // `noUncheckedIndexedAccess` is on and the array is never empty by construction — the
    // constructor seeds it and `undo` refuses to pop the last entry. Throwing beats a non-null
    // assertion, which the repo forbids [ENGINEERING §1.4].
    if (last === undefined) throw new Error('editor: history is empty, which cannot happen')
    return last.tokens
  }

  get detected(): MerchantTokens {
    const first = this.entries[0]
    if (first === undefined) throw new Error('editor: history is empty, which cannot happen')
    return first.tokens
  }

  get canUndo(): boolean {
    return this.entries.length > 1
  }

  get undoLabel(): string {
    const last = this.entries[this.entries.length - 1]
    return last === undefined ? '' : last.label
  }

  get isDetected(): boolean {
    return this.entries.length === 1
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  /** One user action, one entry. Callers batch a multi-field change into a single call. */
  commit(label: string, change: Partial<MerchantTokens>): void {
    this.entries.push({ tokens: { ...this.tokens, ...change }, label })
    this.emit()
  }

  undo(): void {
    if (!this.canUndo) return
    this.entries.pop()
    this.emit()
  }

  /** Not `entries = [entries[0]]` as a fresh stack — reset is itself undoable. */
  resetToDetected(): void {
    if (this.isDetected) return
    this.entries.push({ tokens: this.detected, label: 'reset to what we found' })
    this.emit()
  }
}

// ---------------------------------------------------------------------------------------------
// Applying a parsed style phrase.
//
// `parse.ts` emits declarative deltas and does no colour maths, so the arithmetic lives here — on
// the page that already depends on the token engine — rather than in a module `boot.ts` reaches.
//
// The honest version of why, because the first draft of this comment overstated it: a plain value
// import of the OKLCH helpers into `parse.ts` costs about 2 B, since Bun tree-shakes
// `parseStylePhrases` out of `agent.js` entirely (nothing in `boot.ts`'s graph names it). What
// actually cost 1859 B gzipped was the FIRST shape of that table, whose entries called a
// user-defined `accentEdit(...)` at module scope inside the array literal: a top-level call to a
// non-builtin is a possible side effect, so DCE conservatively keeps the declaration and
// everything it closes over. Declarative deltas are provably pure and shake cleanly.
//
// So the rule worth remembering is about module-scope CALLS, not about imports. Keeping the maths
// here is still right — it makes `parse.ts` a parser and nothing else [ENGINEERING §2.4] — but it
// is a design argument, not a bundle-budget one.
// ---------------------------------------------------------------------------------------------

const RADIUS_LADDER: RadiusStep[] = ['0', 'sm', 'md', 'lg', 'pill']
const SCALE_LADDER: Scale[] = ['compact', 'regular', 'generous']

function step<T>(ladder: T[], current: T, steps: number): T {
  const at = ladder.indexOf(current)
  if (at === -1) return current
  const next = ladder[Math.max(0, Math.min(ladder.length - 1, at + steps))]
  return next === undefined ? current : next
}

/** The shorter way round the colour wheel, so "warmer" never overshoots into blue. */
function rotateToward(hue: number, target: number, degrees: number): number {
  const diff = ((((target - hue) % 360) + 540) % 360) - 180
  const moved = hue + Math.sign(diff) * Math.min(degrees, Math.abs(diff))
  return ((moved % 360) + 360) % 360
}

function editColour(
  hex: string,
  edit: (l: number, c: number, h: number) => [number, number, number],
): string {
  const current = rgbToOklch(hexToRgb(hex))
  const [l, c, h] = edit(current.l, current.c, current.h)
  return rgbToHex(
    oklchToRgb(gamutMap({ l: Math.max(0, Math.min(1, l)), c: Math.max(0, Math.min(0.4, c)), h })),
  )
}

function applyDelta(tokens: MerchantTokens, delta: StyleDelta): Partial<MerchantTokens> {
  switch (delta.kind) {
    case 'hue':
      return {
        accent: editColour(tokens.accent, (l, c, h) => [
          l,
          c,
          rotateToward(h, delta.toward, delta.degrees),
        ]),
      }
    case 'chroma':
      return { accent: editColour(tokens.accent, (l, c, h) => [l, c + delta.delta, h]) }
    case 'lightness':
      return { accent: editColour(tokens.accent, (l, c, h) => [l + delta.delta, c, h]) }
    case 'radius':
      return { radius: step(RADIUS_LADDER, tokens.radius, delta.steps) }
    case 'scale':
      return { scale: step(SCALE_LADDER, tokens.scale, delta.steps) }
    case 'density':
      return { density: delta.value }
    case 'elevation':
      return { elevation: delta.value }
    case 'labelCase':
      return { labelCase: delta.value }
  }
}

/**
 * Folds every edit a phrase produced into ONE change, so the whole phrase is one undo step.
 * Later edits see the result of earlier ones — "bolder and warmer" rotates the hue of the
 * already-saturated accent, not of the original.
 */
export function applyStyleEdits(
  tokens: MerchantTokens,
  edits: StyleEdit[],
): Partial<MerchantTokens> {
  let working = tokens
  let change: Partial<MerchantTokens> = {}
  for (const edit of edits) {
    const next = applyDelta(working, edit.delta)
    change = { ...change, ...next }
    working = { ...working, ...next }
  }
  return change
}
