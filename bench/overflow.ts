import type { Page } from '@playwright/test'

/**
 * The one horizontal-overflow measurement in `bench/`. H2 wrote it; H4 uses the same one rather
 * than becoming a sixth hand-rolled copy of `scrollWidth > clientWidth` in this repo (the other
 * four live in `e2e/`, run in a different process, and are left alone).
 *
 * `.compare-scroll` and its subtree are exempt BY DESIGN: three product columns cannot fit at
 * 375px and a swipe beats clipping, so that one container is allowed to scroll horizontally.
 */

export type Measurement = {
  element: string
  scrollWidth: number
  clientWidth: number
  scrollHeight: number
  clientHeight: number
  outerWidth: number
  isBlockRoot: boolean
  exempt: boolean
  listWidth: number
  /** Distance the element's box sticks out past the viewport, 0 when it is fully inside. */
  outsideViewport: number
}

export type Overflow = { element: string; scrollWidth: number; clientWidth: number }

/** Browser side. Measures only — every judgement is made in Node, where it reads plainly. */
export async function measureList(page: Page): Promise<Measurement[]> {
  return page.evaluate(() => {
    const list = document.querySelector('mx-agent')?.shadowRoot?.querySelector('.messages')
    if (!(list instanceof HTMLElement)) return []
    const nodes = [list, ...Array.from(list.querySelectorAll('*'))]
    return nodes.flatMap((node) => {
      if (!(node instanceof HTMLElement)) return []
      const box = node.getBoundingClientRect()
      return [
        {
          element: node.className || node.tagName.toLowerCase(),
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
          outerWidth: Math.round(box.width),
          isBlockRoot: node.parentElement === list,
          exempt: node.closest('.compare-scroll') !== null,
          listWidth: list.clientWidth,
          outsideViewport: Math.round(
            Math.max(0, -box.left, box.right - document.documentElement.clientWidth),
          ),
        },
      ]
    })
  })
}

/**
 * Two different failures, and neither substitutes for the other.
 *
 * `scrollWidth > clientWidth` on EVERY descendant catches content overflowing its own box — the
 * case that let a 40-character word render as `CLOSEST WITHOUT “RIJKSMUSEUMSTRAATVERLICHTINGSPROJE`,
 * clipped at the card edge, while every block root sat at exactly panel width because the card
 * wrappers are `overflow: hidden`. Outer width against the list catches a block that widens the
 * panel instead of overflowing inside it.
 */
export function judgeOverflow(measurements: Measurement[]): Overflow[] {
  return measurements
    .filter((m) => !m.exempt)
    .filter(
      (m) =>
        m.scrollWidth > m.clientWidth + 0.5 || (m.isBlockRoot && m.outerWidth > m.listWidth + 0.5),
    )
    .map((m) => ({ element: m.element, scrollWidth: m.scrollWidth, clientWidth: m.clientWidth }))
}

/**
 * H4's second assertion: *"nothing rendered outside the viewport"*. Distinct from overflow — a box
 * can sit entirely within its parent's scroll width and still be painted off the left edge.
 * `.compare-scroll` is exempt here too, and for the same reason: its columns are *supposed* to sit
 * past the right edge until the shopper swipes.
 */
export function judgeOutsideViewport(measurements: Measurement[]): string[] {
  return measurements
    .filter((m) => !m.exempt && m.outsideViewport > 0.5)
    .map((m) => `${m.element} sticks ${m.outsideViewport}px outside the viewport`)
}
