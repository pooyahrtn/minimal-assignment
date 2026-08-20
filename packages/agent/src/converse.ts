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
    // The row carries the disclosure; the sentence is what makes it legible. Built here rather
    // than in the FSM for the same reason the clarify prompt is: the words are the merchant's.
    case 'chips-update': {
      const unsupported = block.chips.filter((chip) => chip.state === 'unsupported')
      if (unsupported.length === 0) return [block]
      const labels = unsupported.map((chip) => `“${chip.label}”`).join(', ')
      return [block, text(fill(str(strings, 'chips.cannot'), { labels }))]
    }
    case 'text':
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
 * The disclosure sentence when the merchant's config has no `recommend.more` key. Same problem
 * `chat.error` solves below, for the same reason: this key is new, so every runtime-minted
 * `shop-*.json` predates it, and `str()` renders a missing key AS THE KEY — a shopper on a minted
 * shop would read the literal text "recommend.more" stapled under six product cards, which is a
 * worse defect than the truncation this whole feature exists to disclose. English, in the bundle,
 * deliberately, and still run through `fill()` — unlike `chat.error`, this template carries
 * placeholders, so the fallback needs the same interpolation a real merchant string gets, not just
 * a static sentence. [config.ts `str`]
 */
const BUILT_IN_RECOMMEND_MORE =
  'Showing the {shown} cheapest of {total} matches. Tell me more to narrow the list.'

function recommendMoreText(strings: Record<string, string>, shown: number, total: number): string {
  return fill(strings['recommend.more'] ?? BUILT_IN_RECOMMEND_MORE, {
    shown: String(shown),
    total: String(total),
  })
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
  let led = false
  for (const block of blocks) {
    // The lead-in goes once, above the first product line. Tracked with a flag rather than by
    // scanning `out` for a text block: the disclosure sentence a `chips-update` can now emit is
    // also text, and scanning made it swallow the lead-in on exactly the turns that need both.
    if (block.kind === 'product-card' && !led) {
      led = true
      out.push(text(str(strings, 'recommend.lead')))
    }
    out.push(...voice(block, state, strings))
  }
  // The bookend to the lead-in above: `led` is reused rather than a second flag because it is
  // already exactly "this turn showed at least one card" — the precondition the disclosure needs
  // too. `shown`/`total` are recomputed from the live chip row rather than threaded through a
  // block, for the same reason `obstacleText` recomputes `rescued` above: `evaluate` [fsm.ts
  // RESULT_CAP] only forwards the CAPPED cards, so the full match count does not otherwise reach
  // this file, and the FSM stays brand-blind — it does the cut, never the copy.
  if (led) {
    const shown = blocks.filter((block) => block.kind === 'product-card').length
    const total = intersect(state.chips, state.catalog).length
    if (total > shown) out.push(text(recommendMoreText(strings, shown, total)))
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
  // A goal chip: several attributes, satisfied by any ONE of them. Length-checked rather than
  // quietly filtered — an `any-of` missing an entry is a DIFFERENT constraint, and an empty one
  // matches nothing at all (`some` over `[]` is false), so it would empty the catalog instead of
  // widening it, which is the exact opposite of what the shopper asked for.
  if (kind.type === 'any-of' && Array.isArray(kind.tags)) {
    const tags = kind.tags.filter((tag): tag is string => typeof tag === 'string')
    if (tags.length > 0 && tags.length === kind.tags.length) return { type: 'any-of', tags }
    return null
  }
  // An `unsupported` chip is a DISCLOSURE and it now travels this wire: the model is the only
  // thing that can recognise "exactly one button" as a constraint this catalog has no field for.
  // Inert by construction — `intersect` and `findObstacle` both read `state === 'active'` only —
  // and rendered with `textContent`, never markup [blocks.ts `renderChips`].
  if (kind.type === 'unsupported' && typeof kind.phrase === 'string') {
    return { type: 'unsupported', phrase: kind.phrase }
  }
  return null
}

function parsedChip(chip: unknown): ParsedChip | null {
  if (!isRecord(chip)) return null
  const { id, label, state } = chip
  if (typeof id !== 'string' || typeof label !== 'string') return null
  if (state !== 'active' && state !== 'dropped' && state !== 'unsupported') return null
  const kind = parsedKind(chip.kind)
  return kind === null ? null : { id, label, state, kind }
}

/**
 * One turn of intake, as `POST /v1/chat` puts it on the wire. Declared here rather than imported
 * from `apps/platform/chat.ts`: that module imports `ai`, `@ai-sdk/anthropic` and `zod`, and even
 * a type-only import across that boundary is one refactor away from dragging the provider SDK into
 * a bundle H6 caps at 18 kB. Two fields is a cheaper duplicate than that risk.
 */
export type Reading = { chips: ParsedChip[]; dropped: string[] }

/**
 * The error sentence when the merchant's config has no `chat.error` key. The ~150 runtime-minted
 * `shop-*.json` configs predate the key and will never have it, and `str()` renders a missing key
 * AS THE KEY — so without this a shopper on a minted shop would read the literal text
 * "chat.error" in the panel. English, in the bundle, deliberately: a shipped default that reads
 * like a sentence is the one thing that cannot be missing. [config.ts `str`]
 */
const BUILT_IN_CHAT_ERROR =
  'I cannot read your message right now. Nothing has been filtered — try again in a moment.'

function chatErrorText(strings: Record<string, string>): string {
  return strings['chat.error'] ?? BUILT_IN_CHAT_ERROR
}

/**
 * One turn's reading off the network, or null. Nothing here trusts the platform's shape.
 *
 * An EMPTY chip list is a valid reading now, not a miss: with no local parser behind it, "the
 * model understood no constraint" and "the model could not be reached" are different answers and
 * the shopper is owed a different one for each. Only a malformed body is null.
 */
export function parsedReading(value: unknown): Reading | null {
  if (!isRecord(value) || !Array.isArray(value.chips)) return null
  const chips: ParsedChip[] = []
  for (const raw of value.chips) {
    const chip = parsedChip(raw)
    if (chip === null) return null
    chips.push(chip)
  }
  const dropped = Array.isArray(value.dropped)
    ? value.dropped.filter((id): id is string => typeof id === 'string')
    : []
  return { chips, dropped }
}

/**
 * The model's reading of one message, or a failure. There is no third answer and no local parser
 * behind it any more [DECISIONS-LOG: T13's "degrade, never break" overridden by ENGINEERING §2.9].
 *
 * `off` means "stop asking for the rest of this session" — the platform has no key or the kill
 * switch is set, and neither changes without a restart. `null` is everything else: a timeout, a
 * network error, a non-JSON body, a malformed chip, a provider outage. Both now paint the same
 * visible error state, and the DISTINCTION is about what happens NEXT: `off` latches and stops
 * spending a round trip per turn to be told the same thing, while `null` does not, so the turn
 * after a slow one on hotel wifi asks again and can succeed.
 *
 * Latching on every failure was the defect this split exists to prevent, and it costs more now
 * than it did: with no fallback path, a latched widget is a widget that has stopped working.
 */
type ChatOutcome = Reading | null | 'off'

/**
 * The client timeout is deliberately LONGER than the platform's own (8s): if they were equal the
 * client would always win the race and the server's own reasons would never reach the widget. The
 * server is the one that should be timing the model out.
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
    return parsedReading(await response.json())
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
   * that answer cannot change without a server restart and re-asking every turn would spend a
   * round trip to be told the same thing. A transient failure does NOT latch: the next turn asks
   * again.
   */
  let live = chat !== undefined

  /**
   * The loud failure [ENGINEERING §2.9 "Fail loudly, never half-paint"]. Nothing is parsed, nothing
   * is guessed, and no block is pushed — the FSM is not stepped at all, so the chip row keeps
   * showing the brief the shopper actually built rather than being redrawn as if this turn had
   * happened. The panel shows the merchant's own sentence and the console carries the detail for
   * whoever is debugging the storefront.
   */
  const fail = (reason: string): void => {
    console.error(`maximal: intake unavailable (${reason}) — the shopper's turn was not read`)
    agent.setError(chatErrorText(config.strings))
  }

  const message = async (text: string): Promise<void> => {
    // No endpoint at all: a widget built by a test or by `bench/gallery.ts` has no network path,
    // and with the local parser deleted there is nothing else it could do with the sentence.
    if (!live || chat === undefined) {
      fail(chat === undefined ? 'no chat endpoint' : 'the platform reported no model')
      return
    }
    agent.setPending(true)
    try {
      const outcome = await askPlatform(chat.url, chat.shop, text)
      if (outcome === 'off') {
        live = false
        fail('the platform reported no model')
        return
      }
      if (outcome === null) {
        fail('the platform could not read that turn')
        return
      }
      // Only a real reading clears the banner, and only on the turn that produced one.
      agent.setError(null)
      run({ type: 'message', chips: outcome.chips, dropped: outcome.dropped })
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
