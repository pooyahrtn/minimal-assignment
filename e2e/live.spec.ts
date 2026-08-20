import { expect, test } from '@playwright/test'

/**
 * REWRITTEN, not deleted, from `offline.spec.ts` — its premise inverted exactly.
 *
 * The old spec existed to PREVENT accidental billing: T13's DoD box 6 asked that `bun run test:e2e`
 * "stay green **and stay offline**", and nothing enforced it, so the spec pinned `POST /v1/chat`
 * to a 503 and failed the run if a live model was reachable.
 *
 * The regex intake parser is deleted and the model is the only intake path, so the premise is now
 * backwards: a platform answering 503 is a widget that cannot read a single sentence, and every
 * other spec in this suite would fail behind a mute failure that says nothing about WHY. Same
 * shape, opposite assertion — this is the guarantee that the suite is testing the real thing
 * rather than a green run against a switched-off endpoint.
 *
 * It also stays the one spec that names the cost out loud: this suite spends money now.
 * [DECISIONS-LOG: T13's "Degrade, never break" overridden by ENGINEERING §2.9]
 */
test('the platform answers /v1/chat live, so this suite is testing the real intake path', async ({
  request,
}) => {
  const response = await request.post('http://localhost:4003/v1/chat', {
    data: { shop: 'kracht', text: 'protein shake, lactose free, under 30 euro' },
    failOnStatusCode: false,
  })
  expect(
    response.status(),
    'POST /v1/chat did not answer 200, so the platform on :4003 has no reachable model and the ' +
      'widget cannot read anything a shopper types. Restart it with MAXIMAL_LLM=1 and a valid ' +
      'ANTHROPIC_API_KEY in .env.local, then run again. ' +
      `x-mx-chat: ${response.headers()['x-mx-chat'] ?? '(absent)'}`,
  ).toBe(200)

  // Not just a 200: the body has to be a reading the widget can actually consume, or the endpoint
  // is "up" and the panel is still broken. `chips` is the contract; `dropped` rides with it.
  const body: unknown = await response.json()
  expect(body).toMatchObject({ chips: expect.any(Array), dropped: expect.any(Array) })
})
