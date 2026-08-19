import type { MerchantDraft } from '../../../packages/agent/src/extract/extract'
import type { StyleEdit } from '../../../packages/agent/src/brain/parse'
import { parseStylePhrases } from '../../../packages/agent/src/brain/parse'
import type { MerchantTokens } from '@maximal/tokens'
import { MAXIMAL, derive, nearestVisibleAccent, readabilityReport } from '@maximal/tokens'
import {
  DENSITIES,
  ELEVATIONS,
  LABEL_CASES,
  LAUNCHER_STYLES,
  RADIUS_STEPS,
  SCALES,
  colourField,
  el,
  group,
  labelCaseName,
  radiusName,
  readabilityPanel,
  segmented,
  textField,
} from './controls'
import { Preview, STOREFRONTS } from './preview'
import { Editor, applyStyleEdits } from './state'

/**
 * The configuration page. PRINCIPLES §9's layered flow, in order: paste a URL, review what we
 * found with everything editable, watch a real storefront change as you edit, refine in plain
 * English, copy a snippet.
 */

// The page's own chrome comes out of the same engine as the widget's, so every colour, radius and
// spacing step on this screen is derived and clamped rather than picked. [T7 DoD box 6]
const HOUSE = derive(MAXIMAL)
for (const [name, value] of Object.entries(HOUSE.css)) {
  document.documentElement.style.setProperty(name, value)
}
for (const href of new Set([HOUSE.fonts.display.href, HOUSE.fonts.body.href])) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.append(link)
}

const ACCENT_FLOOR = 3

function need<T extends Element>(id: string, kind: new () => T): T {
  const node = document.getElementById(id)
  if (!(node instanceof kind)) throw new Error(`config page: #${id} is missing or wrong`)
  return node
}

const pasteScreen = need('paste', HTMLElement)
const reviewScreen = need('review', HTMLElement)
const rail = need('rail', HTMLElement)
const frame = need('preview', HTMLIFrameElement)
const stageFrame = need('stage-frame', HTMLElement)
const stageNote = need('stage-note', HTMLParagraphElement)
const previewLabel = need('preview-label', HTMLElement)
const previewDot = need('preview-dot', HTMLElement)
const extractForm = need('extract-form', HTMLFormElement)
const urlInput = need('store-url', HTMLInputElement)
const extractBtn = need('extract-btn', HTMLButtonElement)

let editor: Editor | null = null
let draft: MerchantDraft & { state?: string } = {
  tokens: MAXIMAL,
  logo: null,
  ok: false,
  note: '',
}
let fontHref: string | null = null
/** What the merchant typed in the font field, kept so the field can show it back to them. */
let fontSrc = ''
let published: { shopKey: string; snippet: string } | null = null
/** Set only once the PLATFORM has served this key to some page that is not us. */
let liveKey: string | null = null
/** Edits made since the last successful publish, so the button can say so rather than lie. */
let dirtySincePublish = false

/** The framed storefront is a stand-in, not the merchant's own site. Read by the ready handler,
 *  which is the only place the label is written. */
let previewForeign = false

const preview = new Preview(frame, () => {
  previewDot.dataset.state = 'live'
  previewLabel.textContent = previewForeign ? 'Live preview — snapshot' : 'Live preview'
  // The detected draft has to reach the widget the moment it can hear us, or "Here's what we
  // found" sits next to a preview still wearing the storefront's own committed brand.
  pushPreview()
})

/**
 * Poll for a real installation. `GET /v1/published/:key` reports when the platform first served
 * that config to anyone; the config page never fetches `/v1/config/:key` for a minted key, so a
 * timestamp there means a genuine page load somewhere else.
 */
function watchForInstall(shopKey: string): void {
  const tick = async (): Promise<void> => {
    if (liveKey !== null) return
    try {
      const response = await fetch(`/v1/published/${shopKey}`)
      const body: unknown = await response.json()
      if (
        typeof body === 'object' &&
        body !== null &&
        'firstSeenAt' in body &&
        body.firstSeenAt !== null
      ) {
        liveKey = shopKey
        render()
        return
      }
    } catch {
      // A poll that cannot reach the platform is not a failure worth showing; the next one may.
    }
    window.setTimeout(() => void tick(), 3000)
  }
  void tick()
}

// ------------------------------------------------------------------------------- screen one --

/**
 * A merchant types `your-store.com`; `new URL` — and the browser's own `type="url"` before it —
 * demands a scheme. Prepend one only when there is NO scheme at all, so anything carrying one
 * (`file:`, `javascript:`, `localhost:4001`) passes through untouched and is still refused by the
 * server's guard. Never `http:`, so this can only upgrade. `.trim()` first: the URL parser tolerates
 * a leading space today, and prepending in front of one would newly reject what already worked.
 */
function withScheme(raw: string): string {
  const typed = raw.trim()
  return /^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`
}

extractForm.addEventListener('submit', (event) => {
  event.preventDefault()
  if (urlInput.value.trim() === '') return
  // Written back, not just sent: the merchant sees the scheme we added, and `storefrontFor` matches
  // its `STOREFRONTS` origins on the same string it is about to be handed.
  urlInput.value = withScheme(urlInput.value)
  void runExtract(urlInput.value)
})

for (const button of document.querySelectorAll('[data-fill]')) {
  if (!(button instanceof HTMLButtonElement)) continue
  button.addEventListener('click', () => {
    urlInput.value = button.dataset.fill ?? ''
  })
}

need('skip-extract', HTMLButtonElement).addEventListener('click', () => {
  draft = {
    tokens: MAXIMAL,
    logo: null,
    ok: false,
    note: 'Starting from our neutral defaults. Nothing here was read off your site.',
    state: 'manual',
  }
  openReview(null)
})

async function runExtract(url: string): Promise<void> {
  if (url === '') return
  extractBtn.disabled = true
  extractBtn.textContent = 'Reading…'
  try {
    const response = await fetch('/v1/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'tokens' in body) {
      // The server's shape is `MerchantDraft` plus a `state` discriminant it computes, because the
      // extractor itself only reports `ok: boolean` and a sentence.
      Object.assign(draft, body)
    } else if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
    ) {
      // A 400 from the route's own guards — a private or malformed address. Without this branch
      // the page silently kept its neutral draft and showed the generic "could not reach it"
      // copy, throwing away the one sentence that says what was actually wrong.
      draft = { tokens: MAXIMAL, logo: null, ok: false, note: body.error, state: 'failed' }
    }
  } catch {
    draft = {
      tokens: MAXIMAL,
      logo: null,
      ok: false,
      note: `We could not reach ${url} from here. Here is a starting point you can edit.`,
      state: 'failed',
    }
  }
  extractBtn.disabled = false
  extractBtn.textContent = 'Start'
  openReview(url)
}

// ------------------------------------------------------------------------------- screen two --

function storefrontFor(url: string | null): { origin: string; foreign: boolean } {
  if (url !== null) {
    for (const origin of Object.values(STOREFRONTS)) {
      if (url.startsWith(origin)) return { origin, foreign: false }
    }
  }
  // A store we do not host cannot be framed DIRECTLY — gsmarena answers `frame-ancestors 'self'`
  // and most shops send X-Frame-Options, so their own origin comes back blank. `/v1/snapshot`
  // re-serves their page from ours, which is a document we are allowed to frame; it never fails
  // into a blank pane, so there is no second fallback to keep here. Manual entry has no URL to
  // snapshot, and only that case still borrows a storefront of ours.
  if (url === null) return { origin: STOREFRONTS.velde ?? '', foreign: true }
  return { origin: `/v1/snapshot?url=${encodeURIComponent(url)}`, foreign: true }
}

function openReview(url: string | null): void {
  // The store being configured is the only state the merchant can see, so it belongs in the URL:
  // a refresh — or a link — replays the selection instead of dumping them back on screen one.
  //
  // PUSH, not replace: screen one and screen two are two places, and Back has to be able to
  // return to the first. `replaceState` collapsed them into one entry, so Back left the site
  // entirely and a merchant who mistyped their store had no way home short of editing the URL.
  //
  // The guard is what makes the push safe to call from all three entry points. `openReview` is
  // reached on first submit (search differs — push), on load with `?store=` already set
  // (search matches — no push, or the merchant would need two Backs to leave), and from
  // `popstate` replaying an entry the browser has already moved to (search matches — no push, or
  // every Back would mint the entry it was trying to leave and the button would appear dead).
  const search = `?${new URLSearchParams({ store: url ?? 'manual' })}`
  if (window.location.search !== search) history.pushState(null, '', search)
  editor = new Editor(draft.tokens)
  editor.onChange(() => {
    render()
    pushPreview()
  })
  pasteScreen.hidden = true
  reviewScreen.hidden = false

  const target = storefrontFor(url)
  previewForeign = target.foreign
  stageNote.textContent = target.foreign
    ? url === null
      ? 'No store URL to frame, so this is your brand on a storefront of ours — the widget and the tokens are the real ones.'
      : 'Your own page, re-served by us so it can be framed: your markup and styles, with your scripts off and links inert. The assistant on it is live.'
    : 'Your storefront, live. The assistant on it is the one your snippet installs.'
  preview.load(target.origin)
  render()
}

function commit(label: string, change: Partial<MerchantTokens>): void {
  dirtySincePublish = true
  editor?.commit(label, change)
}

function pushPreview(): void {
  if (editor === null) return
  paintPreview(editor.tokens)
}

/** Paint the preview from tokens that are NOT (yet) in history — the live drag of a colour. */
function paintPreview(tokens: MerchantTokens): void {
  preview.send(derive(tokens), fontHref)
}

// ------------------------------------------------------------------------------------ render --

function foundCard(): HTMLElement {
  const state = draft.state ?? (draft.ok ? 'ok' : 'failed')
  const card = el('div', 'found')
  card.dataset.state = state
  const heading: Record<string, string> = {
    ok: "Here's what we found.",
    empty: 'We reached your page and learned nothing.',
    blocked: 'Your site turned us away.',
    failed: "We couldn't read your site.",
    manual: 'Starting from scratch.',
  }
  card.append(el('h2', undefined, heading[state] ?? heading.ok ?? ''))
  // NOT `draft.note`. The extractor's note is written for whoever is debugging it — "Seeded from
  // http://localhost:4001 — cached so the demo never waits on a network fetch", "responded with
  // HTTP 403" — and this is the trust moment on the highest-scoring surface after the agent.
  const body: Record<string, string> = {
    ok: 'We read these off your own pages. Nothing here is assumed correct — change anything.',
    empty:
      'The page loaded, but there was no styling on it we could read — often the sign of a store that paints itself with JavaScript. Set it by hand below; it takes a minute.',
    blocked:
      'Your store answered our reader with a block rather than the page. That is your bot protection doing its job. Set it by hand below.',
    failed:
      'We could not reach it from here. Set it by hand below, or check the address and try again.',
    manual: 'Neutral defaults to start from. Nothing here was read off your site.',
  }
  card.append(el('p', undefined, body[state] ?? body.ok ?? ''))
  // The technical reason stays available without leading with it.
  if (draft.note !== '') {
    const detail = el('p', 'group-note', draft.note)
    card.append(detail)
  }
  return card
}

function accentWarning(tokens: MerchantTokens): HTMLElement | null {
  const report = readabilityReport(tokens)
  const row = report.accentOnSurface
  if (row.meets) return null
  const suggestion = nearestVisibleAccent(tokens.accent, tokens.surface, ACCENT_FLOOR)
  const warn = el('div', 'warn')
  warn.append(el('strong', undefined, 'Your accent disappears into your surface.'))
  warn.append(
    el(
      'p',
      undefined,
      `At ${row.ratio.toFixed(2)}:1 the launcher and the primary button are the same colour as the page behind them. Text inside them stays readable — our contrast guarantee covers text on a background, and an accent against a surface is not that pair.`,
    ),
  )
  const actions = el('div', 'warn-actions')
  const fix = el('button', 'btn btn-primary', `Use ${suggestion.toUpperCase()} instead`)
  fix.type = 'button'
  fix.addEventListener('click', () => commit('the suggested accent', { accent: suggestion }))
  const keep = el('button', 'btn btn-ghost', 'Keep mine anyway')
  keep.type = 'button'
  keep.addEventListener('click', () => {
    acknowledgedPair = pairKey(tokens)
    render()
  })
  actions.append(fix, keep)
  warn.append(actions)
  return warn
}

/**
 * Set when the merchant explicitly keeps an invisible accent, so the block is informed consent
 * rather than a wall.
 *
 * It records the PAIR, not the accent. Keying on the accent alone left a hole: acknowledge a
 * marginal accent against one surface, then change the surface, and the same accent is suddenly
 * far worse while still counting as acknowledged — the warning stays suppressed and the snippet
 * unblocks on a combination nobody ever agreed to. Any change to either colour asks again.
 */
let acknowledgedPair: string | null = null

function pairKey(tokens: MerchantTokens): string {
  return `${tokens.accent}|${tokens.surface}`
}

function brandGroup(tokens: MerchantTokens): HTMLElement {
  const section = group('Colour')
  section.append(
    colourField(
      'Accent',
      tokens.accent,
      (hex) => {
        acknowledgedPair = null
        commit('the accent colour', { accent: hex })
      },
      (hex) => paintPreview({ ...tokens, accent: hex }),
    ),
  )
  section.append(
    colourField(
      'Surface',
      tokens.surface,
      (hex) => commit('the surface colour', { surface: hex }),
      (hex) => paintPreview({ ...tokens, surface: hex }),
    ),
  )
  return section
}

function typeGroup(tokens: MerchantTokens): HTMLElement {
  const section = group('Type', 'your own font file')
  section.append(
    textField('Display face', tokens.fontDisplay.family, 'Inter', (family) =>
      commit('the display face', {
        fontDisplay: { ...tokens.fontDisplay, family },
        fontBody: { ...tokens.fontBody, family },
      }),
    ),
  )
  section.append(
    // `fontSrc`, not `''`: the field is rebuilt on every render, so a literal blanked the
    // merchant's own URL off the screen the moment they committed it — set, invisible, and with
    // no way to see or correct what it was.
    textField(
      'Font file (.woff2)',
      fontSrc,
      'https://your-store.com/fonts/brand.woff2',
      (value) => {
        if (value === fontSrc) return
        fontSrc = value
        if (value === '') {
          fontHref = null
          // Put the family back on the stylesheet it was detected with, rather than pushing an
          // empty history entry whose undo label describes a change that never happened.
          commit('the font file', {
            fontDisplay: { ...tokens.fontDisplay, href: draft.tokens.fontDisplay.href },
            fontBody: { ...tokens.fontBody, href: draft.tokens.fontBody.href },
          })
          return
        }
        // The platform wraps the file in a real stylesheet: `FontChoice.href` is documented as a
        // stylesheet URL and `<link rel=stylesheet>` cannot load a font file. Doing the wrapping
        // on our side keeps that contract exact and leaves the shipped widget unchanged.
        const params = new URLSearchParams({
          src: value,
          family: tokens.fontDisplay.family,
          weight: String(tokens.fontDisplay.weight),
        })
        // ABSOLUTE, not root-relative. `boot.ts:injectFonts` puts this href on the STOREFRONT's
        // document, so `/v1/font.css` resolves against :4001 and 404s — measured — and the
        // platform route is never reached. The typeface silently does not change.
        fontHref = `${window.location.origin}/v1/font.css?${params.toString()}`
        commit('the font file', {
          fontDisplay: { ...tokens.fontDisplay, href: fontHref },
          fontBody: { ...tokens.fontBody, href: fontHref },
        })
      },
    ),
  )
  section.append(
    segmented(
      'Labels',
      LABEL_CASES,
      tokens.labelCase,
      (labelCase) => commit('label treatment', { labelCase }),
      labelCaseName,
    ),
  )
  section.append(
    segmented('Text size', SCALES, tokens.scale, (scale) => commit('the type scale', { scale })),
  )
  return section
}

function shapeGroup(tokens: MerchantTokens): HTMLElement {
  const section = group('Shape')
  section.append(
    segmented(
      'Corners',
      RADIUS_STEPS,
      tokens.radius,
      (radius) => commit('the corner radius', { radius }),
      radiusName,
    ),
  )
  section.append(
    segmented('Edges', ELEVATIONS, tokens.elevation, (elevation) =>
      commit('the edge treatment', { elevation }),
    ),
  )
  section.append(
    segmented('Spacing', DENSITIES, tokens.density, (density) =>
      commit('the density', { density }),
    ),
  )
  return section
}

function launcherGroup(tokens: MerchantTokens): HTMLElement {
  const section = group('Launcher')
  section.append(
    segmented('Shape', LAUNCHER_STYLES, tokens.launcher.style, (style) =>
      commit('the launcher shape', { launcher: { ...tokens.launcher, style } }),
    ),
  )
  return section
}

/**
 * The deltas a phrase produced, held outside the rail so they survive it being rebuilt.
 * Committing re-renders the whole rail, and a list rendered inline would be destroyed by the very
 * change it is describing — which is the difference between the DoD's "visible" and a flash.
 */
const GROUP_NAMES: Record<string, string> = {
  colour: 'colour',
  shape: 'shape',
  density: 'spacing',
  scale: 'text size',
  elevation: 'edges',
  labelCase: 'labels',
}

let lastEdits: StyleEdit[] = []
let unrecognised = false

function nlGroup(): HTMLElement {
  const section = group('Say it in words', 'a fixed vocabulary, no model')
  const field = el('div', 'field')
  const label = el('label', 'field-label', 'Describe the change')
  label.htmlFor = 'nl-input'
  const input = el('input', 'input')
  input.type = 'text'
  input.id = 'nl-input'
  input.placeholder = 'warmer, less rounded, more compact'

  const run = (): void => {
    if (editor === null) return
    const typed = input.value.trim()
    if (typed === '') return
    const edits = parseStylePhrases(typed)
    lastEdits = edits
    unrecognised = edits.length === 0
    if (edits.length === 0) {
      render()
      return
    }
    // One phrase, one undo step, even when it moved six groups.
    commit(`"${typed}"`, applyStyleEdits(editor.tokens, edits))
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      run()
    }
  })
  field.append(label, input)
  section.append(field)

  const deltas = el('div', 'deltas')
  if (unrecognised) {
    deltas.append(
      el(
        'p',
        'group-note',
        "Nothing in that we recognise. Try 'warmer', 'less rounded', 'roomier', 'bigger text', 'flatter' or 'shouty labels'.",
      ),
    )
  }
  for (const edit of lastEdits) {
    const row = el('div', 'delta')
    row.append(
      el('span', 'delta-group', GROUP_NAMES[edit.group] ?? edit.group),
      el('span', undefined, edit.describe),
    )
    deltas.append(row)
  }
  section.append(deltas)
  return section
}

/** One guard for both the snippet box and the Save button in the action bar: an accent nobody can
 *  see must not reach a storefront, and a snippet is only half of how it would get there. */
function saveBlocked(tokens: MerchantTokens): boolean {
  return !readabilityReport(tokens).accentOnSurface.meets && acknowledgedPair !== pairKey(tokens)
}

function snippetGroup(tokens: MerchantTokens): HTMLElement {
  const section = group('Install it')

  if (saveBlocked(tokens)) {
    section.append(
      el(
        'p',
        'group-note',
        'Resolve the accent above first — we will not hand you a snippet that installs an invisible button.',
      ),
    )
    return section
  }

  const box = el('textarea', 'snippet')
  box.rows = 3
  box.readOnly = true
  box.value = published?.snippet ?? '<!-- Copy this once your settings are final. -->'
  section.append(box)

  const verify = el('div', 'verify')
  if (published === null) {
    verify.append(el('span', undefined, 'Not published yet.'))
  } else if (liveKey === published.shopKey) {
    verify.append(el('span', undefined, `Detected ✓ — a page loaded ${published.shopKey}.`))
  } else {
    // Deliberately narrow. The earlier version said "detected" as soon as the preview iframe
    // handshook, which was true of the storefront's OWN pre-existing widget and said nothing
    // about the snippet just published — so the "waiting" branch could never render and the tick
    // was decoration. This waits for a load of THIS key, which is what a merchant is being told.
    verify.append(
      el(
        'span',
        undefined,
        'Waiting for first load — paste the snippet on your store. This updates itself.',
      ),
    )
  }
  section.append(verify)
  return section
}

async function publish(button: HTMLButtonElement): Promise<void> {
  if (editor === null) return
  button.disabled = true
  try {
    // Every click publishes. The first mints a key; the rest overwrite it. Gating this on
    // `published === null` meant the merchant edited, clicked "Copy snippet", and walked away with
    // a tag serving their PRE-edit brand — silently, with the preview showing the new one.
    const query = published === null ? '' : `?shopKey=${encodeURIComponent(published.shopKey)}`
    const response = await fetch(`/v1/config${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(await buildConfig(editor.tokens)),
    })
    // BEFORE the shape guard. A 400 simply misses that guard, and the code below then cleared
    // `dirtySincePublish` and copied the STALE snippet — the page affirming a publish that failed.
    if (!response.ok) throw new Error(`publish failed: ${response.status}`)
    const body: unknown = await response.json()
    if (
      typeof body === 'object' &&
      body !== null &&
      'shopKey' in body &&
      'snippet' in body &&
      typeof body.shopKey === 'string' &&
      typeof body.snippet === 'string'
    ) {
      const first = published === null
      published = { shopKey: body.shopKey, snippet: body.snippet }
      if (first) watchForInstall(body.shopKey)
    }
    dirtySincePublish = false
    if (published !== null) await navigator.clipboard.writeText(published.snippet).catch(() => {})
  } finally {
    button.disabled = false
    render()
  }
}

/**
 * The merchant's brand over the neutral config the platform already serves.
 *
 * `strings` is 22 keys and `voice` is four fields, both owned by `tools/build-config.ts`. Copying
 * them here would be a second source of truth that goes stale the first time a key is added —
 * `isConfigResponse` rejects a gap, so the failure would be a widget that will not boot. Fetching
 * `/v1/config/default` costs one request at publish time and cannot drift.
 */
async function buildConfig(tokens: MerchantTokens): Promise<unknown> {
  const response = await fetch('/v1/config/default')
  const base: unknown = await response.json()
  if (typeof base !== 'object' || base === null) {
    throw new Error('config page: /v1/config/default did not return a config')
  }
  return { ...base, tokens: derive(tokens) }
}

/**
 * `render()` rebuilds the entire rail, which throws keyboard focus to `<body>` on every commit —
 * a merchant tabbing through the controls lands back at the top of the document each time they
 * change a field. Rather than move to targeted updates (a diffing layer for fifteen controls is
 * the kind of machinery this repo exists to avoid), remember the focused control by id and put
 * focus back on its replacement, caret included.
 */
function captureFocus(): { id: string; start: number | null; end: number | null } | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || active.id === '' || !rail.contains(active)) return null
  if (active instanceof HTMLInputElement && active.type === 'text') {
    return { id: active.id, start: active.selectionStart, end: active.selectionEnd }
  }
  return { id: active.id, start: null, end: null }
}

function restoreFocus(
  saved: { id: string; start: number | null; end: number | null } | null,
): void {
  if (saved === null) return
  const node = document.getElementById(saved.id)
  if (!(node instanceof HTMLElement)) return
  node.focus()
  if (node instanceof HTMLInputElement && node.type === 'text' && saved.start !== null) {
    node.setSelectionRange(saved.start, saved.end)
  }
}

function render(): void {
  if (editor === null) return
  const saved = captureFocus()
  const tokens = editor.tokens
  rail.replaceChildren()
  rail.append(foundCard())
  const warning = accentWarning(tokens)
  if (warning !== null && acknowledgedPair !== pairKey(tokens)) rail.append(warning)
  rail.append(brandGroup(tokens), typeGroup(tokens), shapeGroup(tokens), launcherGroup(tokens))
  rail.append(nlGroup())
  rail.append(readabilityPanel(readabilityReport(tokens)))
  rail.append(snippetGroup(tokens))

  // The bar carries the page's one commit action, so it is reachable from anywhere in a rail
  // that scrolls past a screenful. Undo and reset keep their place beside it as ghosts, and their
  // long forms move to the accessible name: three full labels in a 27rem column is a wrapped bar.
  const actions = el('div', 'rail-actions')
  if (!saveBlocked(tokens)) {
    const save = el(
      'button',
      'btn btn-primary',
      published === null
        ? 'Save & copy snippet'
        : dirtySincePublish
          ? 'Save changes & copy'
          : 'Copy snippet',
    )
    save.type = 'button'
    save.addEventListener('click', () => void publish(save))
    actions.append(save)
  }
  const undo = el('button', 'btn btn-ghost', 'Undo')
  undo.type = 'button'
  undo.disabled = !editor.canUndo
  if (editor.canUndo) undo.setAttribute('aria-label', `Undo ${editor.undoLabel}`)
  undo.addEventListener('click', () => editor?.undo())
  const reset = el('button', 'btn btn-ghost', 'Reset')
  reset.type = 'button'
  reset.disabled = editor.isDetected
  reset.setAttribute('aria-label', 'Reset to what we found')
  reset.addEventListener('click', () => editor?.resetToDetected())
  actions.append(undo, reset)
  rail.append(actions)
  restoreFocus(saved)
}

// ------------------------------------------------------------------------------- 375px check --

const widthToggle = need('width-toggle', HTMLButtonElement)
widthToggle.addEventListener('click', () => {
  const phone = stageFrame.dataset.width === 'phone'
  stageFrame.dataset.width = phone ? 'full' : 'phone'
  widthToggle.setAttribute('aria-pressed', String(!phone))
  widthToggle.textContent = phone ? '375px' : 'Full width'
})

// ------------------------------------------------------------------------------------ resume --

// Replayed through the existing handlers rather than a second entry path into `openReview`, so a
// hand-edited `?store=` still meets the field's own validation and the merchant can see what is
// being read. Extraction is deterministic for a given URL, so this lands on the same draft.
/** Replay a `?store=` value through the existing handlers rather than a second entry path into
 *  `openReview`, so a hand-edited URL still meets the field's own validation and the merchant can
 *  see what is being read. Extraction is deterministic for a given URL, so this lands on the same
 *  draft it did the first time — which is what makes Back and Forward cheap. */
function showStore(store: string): void {
  if (store === 'manual') need('skip-extract', HTMLButtonElement).click()
  else {
    urlInput.value = store
    extractForm.requestSubmit()
  }
}

/** Back out of the editor to screen one. Everything reset here is scoped to the store being
 *  configured, and would otherwise describe the PREVIOUS store on the next one: a snippet for a
 *  shop key that is no longer the one on screen, a font the merchant pasted for a different
 *  brand, and an accent warning they acknowledged for a colour they have since left. */
function showPaste(): void {
  reviewScreen.hidden = true
  pasteScreen.hidden = false
  editor = null
  published = null
  liveKey = null
  fontSrc = ''
  fontHref = null
  dirtySincePublish = false
  acknowledgedPair = null
  lastEdits = []
  unrecognised = false
  // The preview iframe is deliberately LEFT where it is. `hidden` does not stop an iframe, so
  // pointing it at `about:blank` here is tempting — but assigning `iframe.src` writes an entry
  // into the parent's joint session history, which silently destroyed the Forward entry: Back
  // worked, Forward did nothing, and `popstate` never fired again. A storefront idling behind a
  // hidden screen costs nothing; `openReview` re-points it on the way back in.
  urlInput.focus()
}

// Screen one and screen two are two history entries [openReview], so Back and Forward are just a
// question of which entry the browser moved to.
// An empty `?store=` counts as absent, not as a store called "": it fails the field's own
// validation, so replaying it would submit a form that cannot pass and leave the merchant on a
// screen that never changes.
window.addEventListener('popstate', () => {
  const store = new URLSearchParams(window.location.search).get('store')
  if (store) showStore(store)
  else showPaste()
})

const resume = new URLSearchParams(window.location.search).get('store')
if (resume) showStore(resume)
