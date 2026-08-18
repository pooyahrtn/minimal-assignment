import { KRACHT, KRACHT_VOICE, VELDE, VELDE_VOICE } from '@maximal/tokens'
import type { ConfigResponse } from './types'

/**
 * The built-in config the widget paints when `/v1/config/:shopKey` cannot be reached — the whole
 * envelope, not just tokens, because the header needs a persona and the persona is `Voice`.
 * TASKS T3 sanctions rendering against a literal token object so the shell does not wait on T6.
 *
 * MERCHANT-set values are imported from `packages/tokens/src/brands.ts` rather than retyped.
 * DERIVED values are hand-written literals BY HAND ON PURPOSE: derivation lives on our side of
 * the wire [ENGINEERING §2.1], so the embed script must never carry `derive()` — it is a binary we
 * cannot recall, and it counts against the H6 size cap. A build-time script will regenerate the
 * literals below from `derive()` once T1 lands; until then they are checked against PRINCIPLES §7
 * by hand and the contrast numbers are in the comments.
 *
 * Two literals, not a loop: a reviewer can read both brands side by side and see that the shapes,
 * rhythm and shadow model differ, not only the hue.
 */

/**
 * VELDE — generous scale, comfortable density, square, hairline, upper-tracked.
 * focusRing #6E8CB8 measures 3.34:1 on the surface and 3.09:1 on the accent fill, clearing the
 * 3:1 non-text floor (WCAG 1.4.11) on BOTH grounds, which is the pair PRINCIPLES §7 names.
 */
const VELDE_CONFIG: ConfigResponse = {
  tokens: {
    css: {
      '--mx-accent': VELDE.accent,
      '--mx-text-on-accent': '#FFFFFF',
      '--mx-surface': VELDE.surface,
      '--mx-surface-raised': '#FFFFFF',
      '--mx-surface-sunken': '#F2F0EC',
      '--mx-border': '#DCD8D1',
      '--mx-text-primary': '#14161A',
      '--mx-text-muted': '#6B6862',
      '--mx-focus-ring': '#6E8CB8',
      '--mx-overlay-scrim': 'rgba(20, 22, 26, 0.4)',
      '--mx-space-1': '6px',
      '--mx-space-2': '12px',
      '--mx-space-3': '20px',
      '--mx-space-4': '28px',
      '--mx-space-5': '40px',
      '--mx-radius-sm': '0px',
      '--mx-radius-md': '0px',
      '--mx-radius-lg': '0px',
      '--mx-shadow-1': '0 0 0 1px #DCD8D1',
      '--mx-shadow-2': '0 0 0 1px #C9C4BB',
      '--mx-font-display': '"Inter Tight", ui-sans-serif, system-ui, sans-serif',
      '--mx-font-body': '"Inter", ui-sans-serif, system-ui, sans-serif',
      '--mx-text-xs': '12px',
      '--mx-text-sm': '14px',
      '--mx-text-md': '16px',
      '--mx-text-lg': '22px',
      '--mx-label-transform': 'uppercase',
      '--mx-label-tracking': '0.08em',
      '--mx-line-height': '1.6',
    },
    labelCase: VELDE.labelCase,
    launcher: VELDE.launcher,
    fonts: { display: VELDE.fontDisplay, body: VELDE.fontBody },
  },
  voice: VELDE_VOICE,
  strings: {
    'launcher.label': 'Help me choose',
    'panel.close': 'Close',
    'chips.legend': 'Looking for',
    'chips.restore': 'Put {label} back',
    'composer.placeholder': 'What is it for?',
    'composer.send': 'Send',
  },
  /**
   * Empty on purpose. T3 renders no product block — the five renderers that need one throw until
   * T5 — and a second hand-written catalog beside the brain's fixture would be a second source of
   * truth for the same thing. The real one arrives from `/v1/config` in T6.
   */
  catalog: [],
}

/**
 * KRACHT — compact scale and density, rounded, soft shadows, sentence case, dark ground.
 * focusRing #6F8A2E measures 4.76:1 on the surface and 3.10:1 on the acid accent fill.
 */
const KRACHT_CONFIG: ConfigResponse = {
  tokens: {
    css: {
      '--mx-accent': KRACHT.accent,
      '--mx-text-on-accent': '#121212',
      '--mx-surface': KRACHT.surface,
      '--mx-surface-raised': '#1C1C1C',
      '--mx-surface-sunken': '#0A0A0A',
      '--mx-border': '#2E2E2E',
      '--mx-text-primary': '#F5F5F5',
      '--mx-text-muted': '#A0A09B',
      '--mx-focus-ring': '#6F8A2E',
      '--mx-overlay-scrim': 'rgba(0, 0, 0, 0.6)',
      '--mx-space-1': '4px',
      '--mx-space-2': '8px',
      '--mx-space-3': '12px',
      '--mx-space-4': '18px',
      '--mx-space-5': '24px',
      '--mx-radius-sm': '6px',
      '--mx-radius-md': '10px',
      '--mx-radius-lg': '14px',
      '--mx-shadow-1': '0 1px 2px rgba(0, 0, 0, 0.4)',
      '--mx-shadow-2': '0 8px 24px rgba(0, 0, 0, 0.55)',
      '--mx-font-display': '"Archivo", ui-sans-serif, system-ui, sans-serif',
      '--mx-font-body': '"Inter Tight", ui-sans-serif, system-ui, sans-serif',
      '--mx-text-xs': '11px',
      '--mx-text-sm': '13px',
      '--mx-text-md': '15px',
      '--mx-text-lg': '19px',
      '--mx-label-transform': 'none',
      '--mx-label-tracking': '0em',
      '--mx-line-height': '1.4',
    },
    labelCase: KRACHT.labelCase,
    launcher: KRACHT.launcher,
    fonts: { display: KRACHT.fontDisplay, body: KRACHT.fontBody },
  },
  voice: KRACHT_VOICE,
  strings: {
    'launcher.label': 'Ask Joep',
    'panel.close': 'Close',
    'chips.legend': 'Your filters',
    'chips.restore': 'Put {label} back',
    'composer.placeholder': 'Tell me what you need',
    'composer.send': 'Send',
  },
  catalog: [],
}

/** Keyed by `data-shop`. An unknown key has no brand, so the loader fails loudly instead. */
export const FALLBACK: Record<string, ConfigResponse> = {
  velde: VELDE_CONFIG,
  kracht: KRACHT_CONFIG,
}

/**
 * The custom properties the shadow stylesheet actually references, taken from a literal that the
 * `Record<CssVarName, string>` type already forces to be complete. The runtime guard checks a
 * fetched payload against this list, so "the API dropped a variable" is caught at the boundary
 * rather than as a blank panel.
 */
export const CSS_VAR_NAMES: string[] = Object.keys(VELDE_CONFIG.tokens.css)
