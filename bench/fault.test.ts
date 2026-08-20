import { describe, expect, test } from 'bun:test'
import { AA_GUARANTEED_PAIRS, VELDE } from '@maximal/tokens'
import { chatEnabled } from '../apps/platform/chat'
import { makeAsserter } from './checks/budget'
import { judgeFuzz } from './checks/contrast'
import { judgeDivergence } from './checks/divergence'
import { judgeIdentical } from './checks/isolation'
import { scorecard } from './checks/scorecard'
import { transcriptCheck } from './checks/transcript'
import { grade } from './grade'
import { judgeOutsideViewport, judgeOverflow } from './overflow'
import type { Measurement } from './overflow'

/**
 * T9's DoD box: *"`bench/run.ts` grades a check on the failures it reports, not on `count > 0`.
 * Every check is verified to actually fail when fed a failing case."*
 *
 * `COMPLAINS #2` is the reason this file exists: every green report in this repo rested on the
 * belief that a check which sees a failure fails the run, and nobody had fed one a failing case.
 * A belief is not a gate.
 *
 * Two rules this file holds itself to, because "fault-injected" is a phrase that has already
 * certified less than it appeared to in this project:
 *
 * 1. **Inject at the layer that decides**, not one layer below it. Every case here drives either
 *    the real `check.run()` or the exact function `check.run()` calls to decide pass/fail — never
 *    a helper that merely resembles it.
 * 2. **Prove the clean case too.** A judge that returns a failure for everything would pass every
 *    test below and be useless, so each judge is also handed a passing input.
 */

describe('grade — the rule run.ts applies', () => {
  test('a clean check passes', () => {
    expect(grade({ count: 20, failures: [] })).toBe(true)
  })

  test('reported failures fail the check however many cases it collected', () => {
    expect(grade({ count: 2000, failures: ['one bad pair'] })).toBe(false)
  })

  test('collecting nothing is still a failure, not a pass [ENGINEERING §3.1]', () => {
    expect(grade({ count: 0, failures: [] })).toBe(false)
  })
})

describe('H1 contrast — judgeFuzz', () => {
  // Real token shapes, not hand-typed literals: a synthetic input that no longer type-checks
  // against what the engine emits is testing a shape the pipeline never produces
  // [ENGINEERING §3.13].
  const pair = AA_GUARANTEED_PAIRS[0]
  if (pair === undefined) throw new Error('AA_GUARANTEED_PAIRS is empty')

  const ok = {
    pairsChecked: 1400,
    worstContrast: { ratio: 7.1, pair, tokens: VELDE },
    infeasibleRingCount: 0,
    ringDefects: [],
  }

  test('a clean fuzz reports nothing', () => {
    expect(judgeFuzz(ok).failures).toEqual([])
  })

  test('a pair under 4.5:1 is reported', () => {
    const failures = judgeFuzz({
      ...ok,
      worstContrast: { ...ok.worstContrast, ratio: 4.49 },
    }).failures
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('4.490')
  })

  test('a focus ring the engine got wrong is reported', () => {
    const failures = judgeFuzz({
      ...ok,
      ringDefects: [
        {
          infeasible: false,
          defect: true,
          engineRatio: 1.9,
          ceiling: 3.4,
          tokens: VELDE,
        },
      ],
    }).failures
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('focus ring')
  })

  test('nothing measured at all throws rather than reporting a partial answer', () => {
    expect(() => judgeFuzz({ ...ok, worstContrast: null })).toThrow(/nothing was checked/)
  })
})

describe('H2 brand-divergence — judgeDivergence', () => {
  const ok = { overflow: [], missing: [], differing: ['a', 'b', 'c', 'd', 'e'], measured: 0.14 }

  test('a clean render reports nothing', () => {
    expect(judgeDivergence(ok)).toEqual([])
  })

  test('horizontal overflow at 375px is reported', () => {
    const failures = judgeDivergence({
      ...ok,
      overflow: [{ element: '.card-title', scrollWidth: 482, clientWidth: 375 }],
    })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('.card-title 482>375')
  })

  test('a structural selector that rendered under no brand is reported, not skipped', () => {
    const failures = judgeDivergence({ ...ok, missing: ['.nomatch'] })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('.nomatch')
  })

  test('fewer than four differing properties is reported', () => {
    const failures = judgeDivergence({ ...ok, differing: ['a', 'b', 'c'] })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('Colour alone is not a second brand')
  })

  test('a distance under the pinned floor is reported', () => {
    const failures = judgeDivergence({ ...ok, measured: 0.02 })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('Never lower the floor')
  })

  test('every failure is reported at once, not just the first', () => {
    expect(
      judgeDivergence({ overflow: [], missing: ['.card'], differing: [], measured: 0 }),
    ).toHaveLength(3)
  })
})

describe('H6 budget — the asserter', () => {
  test('a false assertion throws, and the count still records the attempt', () => {
    const asserter = makeAsserter()
    expect(() => asserter.assert(false, 'gzipped agent.js is over the cap')).toThrow(/over the cap/)
    expect(asserter.count).toBe(1)
  })

  test('a true assertion does not throw', () => {
    const asserter = makeAsserter()
    asserter.assert(true, 'fine')
    expect(asserter.count).toBe(1)
  })
})

describe('H3 transcript — the real check, fed a failing case', () => {
  /**
   * No synthetic seam here: this drives `transcriptCheck.run()` itself. `--expect=non-empty`
   * against KRACHT's real catalog cannot be satisfied — its own opening message is the graded
   * obstacle (`empty`), and the VELDE jacket opening reads no clothing attribute against a
   * supplements vocabulary, leaving only its €250 ceiling, which every one of the 36 products
   * clears. `non-empty` additionally demands 2-4 matches, and 36 is not in that band.
   *
   * THE INJECTION MOVED, and the reason is a real behaviour change rather than a gate being
   * loosened to go green. This used to be `--expect=empty` against VELDE, unsatisfiable because
   * the regex parser read the KRACHT sentence against a clothing catalog as nothing at all. The
   * model reads it as a €30 ceiling PLUS three `unsupported` disclosures ("protein shake",
   * "no sweeteners", "lactose-free") — strictly better behaviour, and it makes that pairing
   * `empty` with a real rescue, so the old expectation became satisfiable. A new genuinely
   * unsatisfiable input keeps the injection honest; weakening the assertion would not have.
   *
   * THESE TWO CALL A PAID API. H3 drives the real intake endpoint now [see the header of
   * `bench/checks/transcript.ts`], so these are the two slowest tests in the repo and the only
   * ones that need a network. The explicit timeout is the whole accommodation: bun's default is
   * 5s and one model turn alone is budgeted at 8s. `transcript.ts` memoises a reading per
   * (catalog, message) for the life of the process, so the second test below re-uses the first's
   * turns rather than buying them again.
   */
  const LIVE_TIMEOUT_MS = 90_000

  /**
   * `chatEnabled()` is the same kill switch `chat.ts` itself fails closed on, and now decides
   * whether these two run at all: `transcript.ts` no longer forces `MAXIMAL_LLM=1` under `bun
   * test` [see the comment on that force], so a plain `bun run test` has no model wired in. The
   * choice here is to skip loudly rather than either inventing a synthetic seam below `run()`
   * (the comment above explains why this file deliberately has none for H3) or letting the run
   * fail on a paid call nobody opted into. A skip that does not say why or how to get the real
   * answer is indistinguishable from a check nobody wrote, so the reason and the exact live
   * command ride in the test name, where `bun test`'s own output prints them.
   */
  const live = chatEnabled()
  const skipNote = live
    ? ''
    : " [skipped: no live model — MAXIMAL_LLM is not '1' with a real ANTHROPIC_API_KEY; run `MAXIMAL_LLM=1 bun run bench/run.ts transcript` to exercise this]"

  test.skipIf(!live)(
    `an unsatisfiable --expect fails the check${skipNote}`,
    async () => {
      await expect(
        transcriptCheck.run(['packages/agent/src/brain/catalog.kracht.json', '--expect=non-empty']),
      ).rejects.toThrow(/--expect=non-empty was not achieved/)
    },
    LIVE_TIMEOUT_MS,
  )

  test.skipIf(!live)(
    `the same catalog without that expectation passes, so the failure above is the expectation${skipNote}`,
    async () => {
      const result = await transcriptCheck.run(['packages/agent/src/brain/catalog.kracht.json'])
      expect(grade({ count: result.count, failures: result.failures ?? [] })).toBe(true)
    },
    LIVE_TIMEOUT_MS,
  )
})

describe('SOFT scorecard — the real check, fed malformed input', () => {
  const write = async (name: string, body: unknown): Promise<string> => {
    const path = `${import.meta.dir}/../node_modules/.cache/mx-fault-scorecard-${name}.json`
    await Bun.write(path, JSON.stringify(body))
    return path
  }

  test('a missing file is rejected', async () => {
    await expect(scorecard.run(['/nonexistent/scorecard.json'])).rejects.toThrow(/is missing/)
  })

  test('a scorecard with no judgement for an expected task is rejected', async () => {
    const path = await write('empty', { rows: [] })
    await expect(scorecard.run([path])).rejects.toThrow(/no judgement for task/)
  })

  /**
   * Built from the REAL scorecard plus one ghost row, because the missing-task branch fires first
   * and would otherwise mask this one — the first draft of this test asserted `/unexpected task/`
   * and was passing on the *missing*-task error instead. An injection that lands in a different
   * branch than the one it names proves nothing about the branch it names.
   */
  test('a scorecard judging a task nobody expects is rejected', async () => {
    const real = await Bun.file(`${import.meta.dir}/scorecard.json`).json()
    const path = await write('ghost', {
      ...real,
      rows: [...real.rows, { task: 'T99', title: 'ghost', axes: {}, worst_finding: 'none' }],
    })
    await expect(scorecard.run([path])).rejects.toThrow(/unexpected task/)
  })

  test('the real scorecard passes, so the three rejections above are about the input', async () => {
    const result = await scorecard.run([])
    expect(result.count).toBeGreaterThan(0)
  })
})

describe('H4 viewport-375 — the shared overflow judgement', () => {
  const clean: Measurement = {
    element: 'msg',
    scrollWidth: 327,
    clientWidth: 327,
    scrollHeight: 70,
    clientHeight: 70,
    outerWidth: 327,
    isBlockRoot: true,
    exempt: false,
    listWidth: 327,
    outsideViewport: 0,
  }

  test('a clean measurement reports nothing on either predicate', () => {
    expect(judgeOverflow([clean])).toEqual([])
    expect(judgeOutsideViewport([clean])).toEqual([])
  })

  test('content overflowing its own box is caught even when the block root fits', () => {
    // The real defect this predicate exists for: a 40-character word clipped inside a card whose
    // wrapper is `overflow: hidden`, so every block root measured exactly panel-width.
    const clipped = { ...clean, element: 'nomatch-title', scrollWidth: 482, isBlockRoot: false }
    expect(judgeOverflow([clipped])).toHaveLength(1)
  })

  test('a block that widens the panel is caught even when nothing inside it overflows', () => {
    expect(judgeOverflow([{ ...clean, outerWidth: 420 }])).toHaveLength(1)
  })

  test('an element painted past the viewport edge is caught', () => {
    const stray = judgeOutsideViewport([{ ...clean, outsideViewport: 549 }])
    expect(stray).toHaveLength(1)
    expect(stray[0]).toContain('549px outside')
  })

  test('the compare table is exempt from both, because it is meant to scroll sideways', () => {
    const compare = { ...clean, exempt: true, scrollWidth: 1300, outsideViewport: 925 }
    expect(judgeOverflow([compare])).toEqual([])
    expect(judgeOutsideViewport([compare])).toEqual([])
  })
})

describe('H5 isolation — judgeIdentical', () => {
  const snapshot = { ':host|fontSize': '18px', '.msg|color': 'rgb(0, 0, 0)' }

  test('two identical shadow roots report nothing', () => {
    expect(judgeIdentical(snapshot, { ...snapshot }, 'clean', 'hostile')).toEqual([])
  })

  test('a property that leaked in from the host is named with both values', () => {
    const leaked = judgeIdentical(
      snapshot,
      { ...snapshot, ':host|fontSize': '40px' },
      'clean',
      'hostile',
    )
    expect(leaked).toHaveLength(1)
    expect(leaked[0]).toContain('clean="18px"')
    expect(leaked[0]).toContain('hostile="40px"')
  })

  test('a property present on one side only is a difference, not a skip', () => {
    expect(judgeIdentical(snapshot, {}, 'clean', 'hostile')).toHaveLength(2)
  })

  test('measuring nothing at all is a failure, never a silent pass [ENGINEERING §3.1]', () => {
    const nothing = judgeIdentical({}, {}, 'clean', 'hostile')
    expect(nothing).toHaveLength(1)
    expect(nothing[0]).toContain('nothing was measured')
  })
})
