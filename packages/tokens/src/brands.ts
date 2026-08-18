import type { MerchantTokens, Voice } from './merchant'

/**
 * The two demo brands as literal merchant input — no derivation, no CSS.
 * Values come from PRINCIPLES §4. They exist so T1/T3/T5 can render both brands before the
 * config API exists, and so a third brand (T11) is provably one object and nothing else.
 *
 * Both are archetypes of Minimal's real client mix (ETQ Amsterdam, XXL Nutrition), not copies:
 * we model the category and its conventions, never a real brand's identity.
 */

/**
 * Amsterdam minimal apparel. The accent is a deep ink-blue rather than the black a real
 * minimal-lux store would ship: a near-black accent measures 16.5:1 here and derives to roughly
 * `textPrimary`, which makes the config page's accent control look inert on brand A and computes
 * a 1.0:1 focus ring on its own CTA. Ink-blue keeps the restrained read and leaves the control
 * visibly doing something. The clamp's real binding case (a pale accent near 4.5:1) ships in
 * T11's third brand, which is why T11 is required rather than stretch.
 */
export const VELDE: MerchantTokens = {
  accent: '#2C3E5C',
  surface: '#FBFAF8',
  fontDisplay: {
    family: 'Inter Tight',
    weight: 500,
    href: 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500&display=swap',
  },
  fontBody: {
    family: 'Inter',
    weight: 400,
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap',
  },
  scale: 'generous',
  radius: '0',
  elevation: 'hairline',
  labelCase: 'upper-tracked',
  density: 'comfortable',
  launcher: { style: 'text-anchor', position: 'bottom-right' },
}

/** No personification: a mark, not a face. A minimal-lux store would never name its assistant. */
export const VELDE_VOICE: Voice = {
  name: 'VELDE',
  avatar: null,
  greeting: 'Tell me what you need it for. I will narrow it down.',
  tone: 'clipped',
}

/** Dutch-market sports nutrition. Loud ground, acid signal, weight instead of tracking. */
export const KRACHT: MerchantTokens = {
  accent: '#C6F441',
  surface: '#121212',
  fontDisplay: {
    family: 'Archivo',
    weight: 800,
    href: 'https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&display=swap',
  },
  fontBody: {
    family: 'Inter Tight',
    weight: 500,
    href: 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500&display=swap',
  },
  scale: 'compact',
  radius: 'md',
  elevation: 'soft',
  labelCase: 'sentence',
  density: 'compact',
  launcher: { style: 'pill', position: 'bottom-right' },
}

/** A sports nutrition store personifies: a coach, not an interface. */
export const KRACHT_VOICE: Voice = {
  name: 'Joep',
  avatar: { kind: 'illustration', src: '/brand/kracht/joep.svg' },
  greeting: "What are you training for? Tell me what you need and I'll filter as we go.",
  tone: 'warm',
}
