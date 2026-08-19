import { fill, money } from './blocks'
import type { Action, BrainState } from './brain/fsm'
import { createBrain, step } from './brain/fsm'
import type { ParsedChip } from './brain/parse'
import { intersect } from './brain/retrieve'
import { isRecord, str } from './config'
import type { Block, ConfigResponse } from './types'
import type { MxAgent } from './widget'

/**
 * Where the live intake turn lives, and which shop is asking [TASKS T13]. Optional at the call
 * site rather than derived here: `boot.ts` is the only place that legitimately knows the platform
 * origin (it reads `script.src`), and a widget constructed by a test or by `bench/gallery.ts` gets
 * no endpoint and therefore no network path at all.
 */
export type ChatEndpoint = { url: string; shop: string }

/**
 * The seam: shell events in, brain blocks out. The shell owns no conversation logic and the brain
 * owns no DOM, so this file is the only place that knows both exist.
 *
 * T5 landed, so every block now has a real renderer and passes straight through. Two things still
 * happen here, and both are the same rule: copy belongs to the merchant, not to the brain.
 *   - `quick-replies` carries a hardcoded English prompt built in `fsm.ts`. It is replaced with the
 *     merchant's own `clarify` string on the way past.
 *   - `no-match` is preceded by the obstacle SENTENCE, built from the merchant's template plus
 *     arithmetic [PRINCIPLES §8]. The card that follows shows the near misses; the sentence is what
 *     names the blocking constraint and quantifies it.
 */

/** Reads one string off a `CustomEvent.detail` without trusting its shape. No `as`. */
function detailString(event: Event, key: string): string | null {
  if (!(event instanceof CustomEvent)) return null
  const detail: unknown = event.detail
  if (!isRecord(detail)) return null
  const value = detail[key]
  return typeof value === 'string' ? value : null
}

function text(value: string): Block {
  return { kind: 'text', text: value }
}

// `recommend.item` is still in the payload and is no longer read: the product card renders title
// and price itself now. The key stays because an embed script pasted last month is a binary we
// cannot recall and may still be reading it — fields are added, never removed. [ENGINEERING §2.2]

/** Plural forms are copy, not code: the merchant owns both halves. */
function countPhrase(strings: Record<string, string>, n: number): string {
  return n === 1
    ? str(strings, 'obstacle.count.one')
    : fill(str(strings, 'obstacle.count.many'), { n: String(n) })
}

/**
 * PRINCIPLES §8: a template in the config payload plus arithmetic in the widget. `obstacle.ts`
 * computed WHICH constraint blocks and which products sit closest; the count of what would be
 * rescued is recomputed here from the live chip row, because the block only carries the three
 * nearest near-misses and "3 options fit" would be a lie on a set of seven.
 */
function obstacleText(
  block: Extract<Block, { kind: 'no-match' }>,
  state: BrainState,
  strings: Record<string, string>,
): string {
  const closest = block.closest[0]
  if (closest === undefined) return str(strings, 'no-results')
  const rescued = intersect(
    state.chips.filter((chip) => chip.id !== block.blocking.id),
    state.catalog,
  )
  return fill(str(strings, 'obstacle.text'), {
    blocking: block.blocking.label,
    options: countPhrase(strings, rescued.length),
    closest: money(closest.product),
  })
}

/**
 * The brain's blocks, with every string it built itself replaced by one the merchant owns. The
 * FSM is deliberately brand-blind, so the two literals it does produce — the clarify prompt and a
 * product card's `reason` — must not reach a shopper. `reason` is dropped by the renderer;
 * the prompt is swapped here, where the payload is in scope.
 */
function voice(block: Block, state: BrainState, strings: Record<string, string>): Block[] {
  switch (block.kind) {
    case 'text':
    case 'chips-update':
    case 'product-card':
    case 'product-compare':
    case 'cta':
      return [block]
    case 'quick-replies':
      return [{ ...block, prompt: str(strings, 'clarify') }]
    case 'no-match':
      return [text(obstacleText(block, state, strings)), block]
    default: {
      const _exhaustive: never = block
      throw new Error(`maximal: unknown block ${JSON.stringify(_exhaustive)}`)
    }
  }
}

/**
 * Never answer with silence. Exported so the graded turn is checkable without a DOM.
 * A turn that produced no sentence — no rescue exists, or the config
 * arrived from the built-in fallback with no catalog at all — says so in the merchant's own
 * words instead of leaving a spinner or a blank panel. [ENGINEERING §2.9]
 */
export function reply(
  blocks: Block[],
  state: BrainState,
  strings: Record<string, string>,
): Block[] {
  const out: Block[] = []
  for (const block of blocks) {
    // The lead-in goes once, above the first product line.
    if (block.kind === 'product-card' && !out.some((b) => b.kind === 'text')) {
      out.push(text(str(strings, 'recommend.lead')))
    }
    out.push(...voice(block, state, strings))
  }
  // The predicate is "the turn answered nothing", not "the turn produced no prose". Before T5 the
  // two were the same thing only because every block was flattened into text; testing for prose
  // now would staple "Nothing in the range does all of that" underneath every clarify prompt and
  // every CTA. A `chips-update` is the only block that is not an answer — it echoes the brief back
  // — so a turn that produced nothing else still owes the shopper a sentence. [ENGINEERING §2.9]
  const answered = out.some((block) => block.kind !== 'chips-update')
  if (!answered) {
    const key = state.catalog.length === 0 ? 'catalog.offline' : 'no-results'
    out.push(text(str(strings, key)))
  }
  return out
}

/**
 * A `ParsedChip[]` off the network, or null. Nothing here trusts the platform's shape: `retrieve.ts`
 * switches on `chip.kind.type` and closes with a `never` that THROWS, and `obstacle.ts` does
 * arithmetic on `kind.max` unguarded — so one malformed chip would take down the turn from inside
 * an async handler, where it becomes an unhandled rejection and the panel simply stops answering.
 * The origin serving this script is trusted to be us; the bytes are still just bytes. [widget.ts:
 * "an origin check makes the sender trusted, not the data well-formed"]
 */
function parsedKind(kind: unknown): ParsedChip['kind'] | null {
  if (!isRecord(kind)) return null
  if (kind.type === 'tag' && typeof kind.tag === 'string') return { type: 'tag', tag: kind.tag }
  // Finite, not merely a number: NaN and Infinity both pass `typeof === 'number'`, and both reach
  // the obstacle sentence's `product.price - max` arithmetic and the chip row's label.
  if (kind.type === 'price-max' && typeof kind.max === 'number' && Number.isFinite(kind.max)) {
    return { type: 'price-max', max: kind.max }
  }
  return null
}

function parsedChip(chip: unknown): ParsedChip | null {
  if (!isRecord(chip)) return null
  const { id, label, state } = chip
  if (typeof id !== 'string' || typeof label !== 'string') return null
  if (state !== 'active' && state !== 'dropped') return null
  const kind = parsedKind(chip.kind)
  return kind === null ? null : { id, label, state, kind }
}

export function parsedChips(value: unknown): ParsedChip[] | null {
  if (!isRecord(value) || !Array.isArray(value.chips)) return null
  const chips: ParsedChip[] = []
  for (const raw of value.chips) {
    const chip = parsedChip(raw)
    if (chip === null) return null
    chips.push(chip)
  }
  return chips.length > 0 ? chips : null
}

/**
 * The model's reading of one message, or null to use the local parser for this turn [TASKS T13].
 *
 * Every branch answers null: the kill switch is server-side, a 503 is the platform saying it has
 * no key or no confidence, and a network error, an abort, a non-JSON body or a malformed chip all
 * mean the same thing to a shopper. The 5s timeout is the widget's own — the platform has one too,
 * and neither is allowed to be the only one.
 */
/**
 * `off` means "stop asking for the rest of this session" — the platform has no key or the kill
 * switch is set, and neither changes without a restart. Everything else is `null`: this ONE turn
 * goes local and the next one asks again.
 *
 * The distinction is the whole point. Latching on every failure meant a single slow first turn on
 * hotel wifi — or one reading the platform declined as no better than the local brain — silently
 * switched the model off for the rest of the conversation, with a page reload the only way back.
 * That is the demo, and it degraded far past "the shopper sees a slower answer".
 */
type ChatOutcome = ParsedChip[] | null | 'off'

/**
 * The client timeout is deliberately LONGER than the platform's own (5s): if they were equal the
 * client would always win the race and the server's own reasons — including a considered decline —
 * would never reach the widget. The server is the one that should be timing the model out.
 */
const CLIENT_TIMEOUT_MS = 11000

async function askPlatform(url: string, shop: string, text: string): Promise<ChatOutcome> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shop, text }),
      credentials: 'omit',
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    })
    if (response.headers.get('x-mx-chat') === 'off') return 'off'
    if (!response.ok) return null
    return parsedChips(await response.json())
  } catch {
    return null
  }
}

/** Wires one mounted widget to its own brain. Called by the loader, once, before mount. */
export function converse(agent: MxAgent, config: ConfigResponse, chat?: ChatEndpoint): void {
  let brain = createBrain(config.catalog)

  const run = (action: Action): void => {
    const result = step(brain, action)
    brain = result.state
    for (const block of reply(result.blocks, brain, config.strings)) agent.push(block)
  }

  /**
   * Turns are serialised, and only MESSAGE turns join the queue. A chip drop or restore is local,
   * synchronous and instant, and `PRINCIPLES §8` grades it as "restorable in one tap" — putting it
   * behind an in-flight network turn would make the graded recovery moment wait on the model. It
   * cannot race either: a drop mutates `brain` immediately, and the message turn that lands after
   * it steps from that already-updated state.
   */
  let queue = Promise.resolve()

  /**
   * Turned off only by an explicit `off` from the platform — no key, or the kill switch — because
   * that answer cannot change without a server restart and re-asking every turn would make the
   * shopper watch the dots on every message of a demo that has already fallen back. A transient
   * failure or a declined reading does NOT latch: the next turn asks again.
   */
  let live = chat !== undefined

  const message = async (text: string): Promise<void> => {
    if (!live || chat === undefined) {
      run({ type: 'message', text })
      return
    }
    agent.setPending(true)
    try {
      const outcome = await askPlatform(chat.url, chat.shop, text)
      if (outcome === 'off') live = false
      run({ type: 'message', text, chips: outcome === 'off' ? undefined : (outcome ?? undefined) })
    } finally {
      // The turn is over however it ended. `push` clears this too, but a turn that produced no
      // block at all — or threw somewhere unforeseen — must not leave the dots running forever.
      agent.setPending(false)
    }
  }

  agent.addEventListener('mx-send', (event) => {
    const value = detailString(event, 'text')
    if (value === null) return
    // The `catch` is the chain itself, not this turn. A rejected promise left in `queue` poisons
    // every LATER turn — `.then` on a rejected promise never runs its callback, so one unforeseen
    // throw would silently stop the widget answering for the rest of the session, with no error
    // visible anywhere. `message` already handles its own failures; this is the backstop that keeps
    // one bad turn from being a permanent one. [ENGINEERING §2.9]
    queue = queue.then(() => message(value)).catch(() => undefined)
  })
  agent.addEventListener('mx-chip-drop', (event) => {
    const id = detailString(event, 'id')
    if (id !== null) run({ type: 'drop-chip', id })
  })
  agent.addEventListener('mx-chip-restore', (event) => {
    const id = detailString(event, 'id')
    if (id !== null) run({ type: 'restore-chip', id })
  })
}
