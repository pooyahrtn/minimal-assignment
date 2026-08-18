import type { FontChoice, LabelCase, Launcher } from './merchant'

/**
 * Every custom property the widget may reference, and nothing else. PRINCIPLES §7 derived list
 * plus the ramps that `scale`/`density`/`radius`/`elevation` resolve into.
 *
 * The union is the enforcement: `Record<CssVarName, string>` makes a missing variable a type
 * error and an invented one a type error too. [ENGINEERING §1.2]
 */
export type CssVarName =
  | '--mx-accent'
  | '--mx-text-on-accent'
  | '--mx-surface'
  | '--mx-surface-raised'
  | '--mx-surface-sunken'
  | '--mx-border'
  | '--mx-text-primary'
  | '--mx-text-muted'
  | '--mx-focus-ring'
  | '--mx-overlay-scrim'
  | '--mx-space-1'
  | '--mx-space-2'
  | '--mx-space-3'
  | '--mx-space-4'
  | '--mx-space-5'
  | '--mx-radius-sm'
  | '--mx-radius-md'
  | '--mx-radius-lg'
  | '--mx-shadow-1'
  | '--mx-shadow-2'
  | '--mx-font-display'
  | '--mx-font-body'
  | '--mx-text-xs'
  | '--mx-text-sm'
  | '--mx-text-md'
  | '--mx-text-lg'
  | '--mx-label-transform'
  | '--mx-label-tracking'
  | '--mx-line-height'

export type CssVars = Record<CssVarName, string>

/**
 * What the config API sends and the widget renders from. Derivation happens on our side, so a
 * clamp fix reaches every already-embedded script without a merchant touching their HTML.
 * [ENGINEERING §2.1]
 */
export type DerivedTokens = {
  /** Written flat onto the shadow host. */
  css: CssVars
  /** Non-CSS behaviour renderers branch on. */
  labelCase: LabelCase
  launcher: Launcher
  fonts: { display: FontChoice; body: FontChoice }
}
