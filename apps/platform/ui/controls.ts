import type {
  Density,
  Elevation,
  LabelCase,
  LauncherStyle,
  MerchantTokens,
  RadiusStep,
  ReadabilityReport,
  ReadabilityRow,
  Scale,
} from '@maximal/tokens'

/**
 * Every control the merchant can touch, and the two panels that tell them what the engine did
 * with it. Rendering is plain DOM: this is one screen with fifteen controls, and a framework
 * would be a dependency to explain rather than a problem solved.
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className !== undefined) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function group(title: string, note?: string): HTMLElement {
  const section = el('section', 'group')
  const head = el('div', 'group-head')
  head.append(el('h2', 'group-title', title))
  if (note !== undefined) head.append(el('span', 'group-note', note))
  section.append(head)
  return section
}

/**
 * A colour picker AND a hex field over the same value. Box 1 says a merchant must reach a snippet
 * without typing a hex code; box 2 says a merchant who has one must be able to override
 * everything. Those are two people, not two features.
 */
export function colourField(
  label: string,
  value: string,
  onChange: (hex: string) => void,
  onPreview: (hex: string) => void,
): HTMLElement {
  const field = el('div', 'field')
  const id = `colour-${label.toLowerCase().replace(/\W+/g, '-')}`
  const labelNode = el('label', 'field-label', label)
  labelNode.htmlFor = id

  const row = el('div', 'colour-row')
  const swatch = el('input', 'swatch')
  swatch.type = 'color'
  swatch.id = id
  swatch.value = value

  const hex = el('input', 'input')
  hex.type = 'text'
  // An id, because `captureFocus` in main.ts keys focus restoration off it — the rail is rebuilt
  // on every commit, and a control with no id cannot be found again afterwards.
  hex.id = `${id}-hex`
  hex.value = value.toUpperCase()
  hex.spellcheck = false
  hex.setAttribute('aria-label', `${label} hex code`)

  // `input` fires on every pointer move inside the native picker — dozens of times in one drag.
  // Committing each one made undo unusable (one press per frame of the drag) and rebuilt the rail
  // mid-drag, destroying the very `<input type="color">` that owned the open picker. So the drag
  // paints the preview only, and `change` — one event, on close — is what enters history.
  swatch.addEventListener('input', () => {
    hex.value = swatch.value.toUpperCase()
    onPreview(swatch.value)
  })
  swatch.addEventListener('change', () => onChange(swatch.value))
  // `change`, not `input`: a merchant typing `#2C3E5C` passes through `#2`, `#2C`, `#2C3` — each
  // of which `derive()` would throw on, since `hexToRgb` rejects anything but 6 digits. Commit on
  // blur/Enter and normalise there.
  hex.addEventListener('change', () => {
    const cleaned = hex.value.trim().replace(/^#/, '')
    if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
      hex.value = swatch.value.toUpperCase()
      return
    }
    const normalised = `#${cleaned.toUpperCase()}`
    hex.value = normalised
    swatch.value = normalised.toLowerCase()
    onChange(normalised)
  })

  row.append(swatch, hex)
  field.append(labelNode, row)
  return field
}

export function segmented<T extends string>(
  label: string,
  options: readonly T[],
  current: T,
  onChange: (value: T) => void,
  display?: (value: T) => string,
): HTMLElement {
  const field = el('div', 'field')
  const fieldset = el('div', 'seg')
  fieldset.setAttribute('role', 'group')
  fieldset.setAttribute('aria-label', label)
  for (const option of options) {
    const button = el('button', undefined, display === undefined ? option : display(option))
    button.type = 'button'
    button.setAttribute('aria-pressed', String(option === current))
    button.addEventListener('click', () => onChange(option))
    fieldset.append(button)
  }
  field.append(el('span', 'field-label', label), fieldset)
  return field
}

export function textField(
  label: string,
  value: string,
  placeholder: string,
  onChange: (value: string) => void,
): HTMLElement {
  const field = el('div', 'field')
  const id = `text-${label.toLowerCase().replace(/\W+/g, '-')}`
  const labelNode = el('label', 'field-label', label)
  labelNode.htmlFor = id
  const input = el('input', 'input')
  input.type = 'text'
  input.id = id
  input.value = value
  input.placeholder = placeholder
  input.spellcheck = false
  input.addEventListener('change', () => onChange(input.value.trim()))
  field.append(labelNode, input)
  return field
}

// ------------------------------------------------------------------------- readability panel --

function swatchDot(hex: string): HTMLElement {
  const dot = el('span', 'chip-swatch')
  dot.style.background = hex
  dot.setAttribute('aria-hidden', 'true')
  return dot
}

/**
 * Token names in English. Stripping `--mx-` and swapping dashes for spaces was not enough — it
 * produced "text muted on surface sunken" and, worse, "text on accent on accent". This is the
 * highest-scoring surface after the agent and it was speaking in variable names.
 */
const TOKEN_NAMES: Record<string, string> = {
  '--mx-text-primary': 'Body text',
  '--mx-text-muted': 'Secondary text',
  '--mx-text-on-accent': 'Text on your accent',
  '--mx-accent': 'your accent',
  '--mx-surface': 'the panel',
  '--mx-surface-raised': 'raised areas',
  '--mx-surface-sunken': 'inset areas',
  '--mx-focus-ring': 'Keyboard focus ring',
}

function pretty(name: string): string {
  return TOKEN_NAMES[name] ?? name.replace(/^--mx-/, '').replace(/-/g, ' ')
}

function readRow(row: ReadabilityRow): HTMLElement {
  const line = el('div', 'read-row')
  const pair = el('div', 'read-pair')
  pair.append(
    swatchDot(row.fgHex),
    swatchDot(row.bgHex),
    el(
      'span',
      undefined,
      row.fg === '--mx-text-on-accent' ? pretty(row.fg) : `${pretty(row.fg)} on ${pretty(row.bg)}`,
    ),
  )
  const ratio = el('span', 'ratio', `${row.ratio.toFixed(2)}:1`)
  ratio.dataset.meets = String(row.meets)
  ratio.title = row.meets
    ? `Clears the ${row.floor}:1 floor.`
    : `Below the ${row.floor}:1 floor — the engine could not reach it.`
  line.append(pair, ratio)
  return line
}

/**
 * What the engine changed, and what it could not. T7's DoD asked for a before/after of every
 * clamped pair; measured, that degenerates — `textPrimary` moves in 0 of the 4 real brands,
 * `textOnAccent` never moves at all (it is a black/white flip, not a search), and `textMuted`
 * moves in 2000/2000 random configurations. A panel that prints the same three-moved,
 * four-unchanged result for every input is a constant, not a differentiator, so this reports the
 * shipped ratios instead, plus the two things the original framing misses entirely: the one
 * genuine movement, and any pair where the clamp *failed* and fell back to best-effort. Silent
 * non-correction is the risk a movement report cannot see. [DECISIONS-LOG, T7]
 */
export function readabilityPanel(report: ReadabilityReport): HTMLElement {
  const section = group('Readability', 'measured, not promised')

  if (report.shortfalls.length > 0) {
    const warn = el('div', 'warn')
    warn.append(el('strong', undefined, 'We could not reach the contrast floor here.'))
    warn.append(
      el(
        'p',
        undefined,
        'These pairs are shipping below the guarantee because no colour in range clears it against your surface. Nudging your surface lighter or darker is the fix.',
      ),
    )
    section.append(warn)
  }

  const move = report.mutedMove
  const moved = el('div', 'field')
  moved.append(el('span', 'field-label', 'Secondary text, and where it landed'))
  moved.append(
    el(
      'p',
      'group-note',
      'Secondary text starts at your surface\u2019s own tone \u2014 invisible by definition \u2014 and we move it the smallest distance that clears 4.5:1. What that distance is depends entirely on your colour, which is why this lands somewhere different for every brand instead of on a generic grey.',
    ),
  )
  const beforeAfter = el('div', 'before-after')
  beforeAfter.append(
    swatchDot(move.fromHex),
    el('span', undefined, `${move.fromHex.toUpperCase()} (${move.fromRatio.toFixed(2)}:1)`),
    el('span', 'arrow', '→'),
    swatchDot(move.toHex),
    el('span', undefined, `${move.toHex.toUpperCase()} (${move.toRatio.toFixed(2)}:1)`),
  )
  moved.append(beforeAfter)
  section.append(moved)

  const list = el('div', 'field')
  list.append(el('span', 'field-label', 'Every guaranteed pair'))
  for (const row of report.guaranteed) list.append(readRow(row))
  for (const row of report.focusRing) list.append(readRow(row))
  section.append(list)

  return section
}

// ------------------------------------------------------------------------------- the options --

export const RADIUS_STEPS: readonly RadiusStep[] = ['0', 'sm', 'md', 'lg', 'pill']
export const SCALES: readonly Scale[] = ['compact', 'regular', 'generous']
export const DENSITIES: readonly Density[] = ['compact', 'comfortable']
export const ELEVATIONS: readonly Elevation[] = ['hairline', 'soft']
export const LABEL_CASES: readonly LabelCase[] = ['sentence', 'upper-tracked']
export const LAUNCHER_STYLES: readonly LauncherStyle[] = ['bubble', 'pill', 'text-anchor']

export function labelCaseName(value: LabelCase): string {
  return value === 'sentence' ? 'Sentence' : 'UPPER'
}

export function radiusName(value: RadiusStep): string {
  return value === '0' ? 'Square' : value
}

export type { MerchantTokens }
