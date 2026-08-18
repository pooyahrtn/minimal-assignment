/**
 * The entire merchant-controlled surface. PRINCIPLES §7 — this table is a closed contract:
 * a token that is not here is a conversation, not a local value. Everything else is derived.
 */

export type Scale = 'compact' | 'regular' | 'generous'
export type RadiusStep = '0' | 'sm' | 'md' | 'lg' | 'pill'
export type Elevation = 'hairline' | 'soft'
export type LabelCase = 'sentence' | 'upper-tracked'
export type Density = 'compact' | 'comfortable'
export type LauncherStyle = 'bubble' | 'pill' | 'text-anchor'
export type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

/** `href` is the stylesheet injected into the HOST head — @font-face does not resolve inside a shadow root. */
export type FontChoice = {
  family: string
  weight: number
  href: string
}

export type Launcher = {
  style: LauncherStyle
  position: Corner
}

export type MerchantTokens = {
  accent: string
  surface: string
  fontDisplay: FontChoice
  fontBody: FontChoice
  scale: Scale
  radius: RadiusStep
  elevation: Elevation
  labelCase: LabelCase
  density: Density
  launcher: Launcher
}

/**
 * Personification is a token too: KRACHT has a coach with a face and a name, VELDE has a mark.
 * `tone` is an open string and `avatar` is nullable on purpose — the brief's bar is "many
 * configurations, not just the one you designed it against", and a two-value union is that
 * failure encoded in a type. A brand with no avatar must be authorable in one object, live.
 */
export type Voice = {
  name: string
  avatar: { kind: 'illustration' | 'glyph'; src: string } | null
  greeting: string
  tone: string
}
