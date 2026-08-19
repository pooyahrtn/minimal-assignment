import { expect, test } from '@playwright/test'

/**
 * T13 DoD box 6: `bun run test:e2e` must "stay green **and stay offline** — the golden transcripts
 * assert deterministic output and must not start calling a paid API on every run."
 *
 * Nothing enforced that. The suite drives the real widget against the real platform on :4003, so
 * the moment a shell has `ANTHROPIC_API_KEY` and `MAXIMAL_LLM=1` exported — which T13's own QA
 * section instructs — every spec that sends a message bills a paid API, silently and greenly.
 * `playwright.config.ts` pins `MAXIMAL_LLM=0` for a platform it starts itself, but
 * `reuseExistingServer: true` means a hand-started warm server is reused and that env block never
 * applies. A default is not a guarantee; this is the guarantee.
 */
test('the platform answers /v1/chat offline, so this suite cannot bill a paid API', async ({
  request,
}) => {
  const response = await request.post('http://localhost:4003/v1/chat', {
    data: { shop: 'kracht', text: 'protein shake, lactose free, under 30 euro' },
    failOnStatusCode: false,
  })
  expect(
    response.status(),
    'POST /v1/chat answered 200, so the platform on :4003 has a live model and this suite is ' +
      'spending money on every message it types. Restart it without MAXIMAL_LLM=1 (or export ' +
      'MAXIMAL_LLM=0) and run again.',
  ).toBe(503)
})
