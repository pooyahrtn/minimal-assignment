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

/**
 * The neutral brand `/v1/config/:shopKey` answers with when it does not know the key — a typo in
 * `data-shop`, a merchant who has not finished onboarding, a stale embed. It lives here, with the
 * other brand literals, because ENGINEERING §1.2 puts every colour in `packages/tokens` and
 * nowhere else.
 *
 * Deliberately nobody's brand rather than somebody else's: `config.ts`'s standing rule is that a
 * widget wearing another merchant's identity is worse than no widget, and a neutral greyscale
 * ground with a blue accent belongs to no one in this repo. Middle-of-the-road on every axis
 * (`regular`/`sm`/`soft`/`sentence`/`comfortable`) so nothing about it reads as a design choice
 * made on the merchant's behalf.
 */
export const DEFAULT_BRAND: MerchantTokens = {
  accent: '#3A5BC7',
  surface: '#FFFFFF',
  fontDisplay: {
    family: 'Inter',
    weight: 600,
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap',
  },
  fontBody: {
    family: 'Inter',
    weight: 400,
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap',
  },
  scale: 'regular',
  radius: 'sm',
  elevation: 'soft',
  labelCase: 'sentence',
  density: 'comfortable',
  launcher: { style: 'pill', position: 'bottom-right' },
}

/** No name and no face: the default has no persona to borrow. */
export const DEFAULT_VOICE: Voice = {
  name: 'Shop assistant',
  avatar: null,
  greeting: 'Tell me what you are looking for and I will help you narrow it down.',
  tone: 'neutral',
}

/**
 * The third brand (T11), and the only place in this repo where the AA clamp is *visible*.
 *
 * VELDE's accent measures 10.3:1 against its surface and KRACHT's 14.7:1, so on both of them the
 * clamp runs and changes nothing a reviewer can see. The instinct — and what TASKS.md T11 asked
 * for — was a pale-yellow *accent*, but that proves nothing either: `derive()` emits `accent`
 * verbatim (`derive.ts`) and `textOnAccent` is a black/white contrast flip, so a pale accent on a
 * white surface still derives the same `#6a6a6a` muted grey every white-surface brand gets. The
 * clamp searches text against `surface`/`surfaceRaised`/`surfaceSunken` ONLY. So the hostile axis
 * has to be the **surface**, and that is what this brand is.
 *
 * Measured, and the reason this brand exists:
 *   accent #E8D44D on surface #F7F0B8 is 1.30:1 raw — illegible, an unusable input
 *   textMuted derives to #646147, an olive tinted by the surface's own hue, at 5.42:1
 *   worst AA-guaranteed pair lands at 4.501:1 — the tightest of the three brands
 *
 * That olive is the demo: it is obviously a computed colour, not one anybody picked. Nothing here
 * is a manual override — every value below is merchant input, and legibility is the engine's.
 *
 * Deliberately hostile on every other axis too (pill radius, generous scale, no personification),
 * because the brief's bar is "many configurations, not just the one you designed it against".
 */
export const HELDER: MerchantTokens = {
  accent: '#E8D44D',
  surface: '#F7F0B8',
  fontDisplay: {
    family: 'Fraunces',
    weight: 700,
    href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&display=swap',
  },
  fontBody: {
    family: 'DM Sans',
    weight: 400,
    href: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&display=swap',
  },
  scale: 'generous',
  radius: 'pill',
  elevation: 'soft',
  labelCase: 'sentence',
  density: 'comfortable',
  launcher: { style: 'bubble', position: 'bottom-left' },
}

/** No persona: the shop's own name, no face. Nothing here to soften the palette. */
export const HELDER_VOICE: Voice = {
  name: 'Helder',
  avatar: null,
  greeting: 'Say what the occasion is. I will work backwards from it.',
  tone: 'plain',
}

/**
 * Maximal's own chrome on the T7 config page. Deliberately not `DEFAULT_BRAND` — that brand is
 * the characterless answer for an *unknown* merchant, and this page is not that: it is our own
 * product, confident and specific, run through `derive()` like every other brand in this file so
 * the page about the token engine is itself built by the token engine (T7 DoD box 6; ENGINEERING
 * §1.2's "no hardcoded colour outside `packages/tokens`" applies here too).
 */
export const MAXIMAL: MerchantTokens = {
  accent: '#4B3BEF',
  surface: '#FCFCFD',
  fontDisplay: {
    family: 'Inter',
    weight: 600,
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
  fontBody: {
    family: 'Inter',
    weight: 400,
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
  scale: 'regular',
  radius: 'md',
  elevation: 'soft',
  labelCase: 'upper-tracked',
  density: 'comfortable',
  launcher: { style: 'pill', position: 'bottom-right' },
}
