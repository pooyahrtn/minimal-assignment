import { expect, test } from 'bun:test'
import { handleRequest, withScheme } from './server'

/**
 * Two properties, and the second one is the reason this file exists.
 *
 * `withScheme` lets a merchant type `your-store.com`. On its own that is a small convenience, and
 * a check written only against it is a check that cannot fail: every dangerous input anyone thinks
 * to list — `javascript:`, `file:`, `localhost:4001` — carries a scheme, so `withScheme` leaves it
 * untouched and it fails exactly where it failed before. An adversarial review of the plan caught
 * that: the case list proved the direction that cannot regress.
 *
 * The direction that CAN regress is input `new URL` used to reject and now parses. Four addresses
 * fell through the private-host guard that way, and one of them was reachable on the DEPLOYED site
 * before any of this work — the field is `type=url`, so a merchant could always supply the scheme
 * themselves. `{"url":"https://0.0.0.0"}` returned a draft, meaning the platform had made the
 * outbound request. So the `refuses` block below fails against the guard as it shipped, which is
 * the only reason it is worth running [ENGINEERING §3.4].
 *
 * These assert through `handleRequest`, not through the guard directly: it exercises the real HTTP
 * boundary rather than a function the boundary might one day stop calling. Against the FIXED guard
 * every case answers 400 before any network call, so the suite is offline — but run it against the
 * guard as it shipped and the failing assertions make real outbound connections, which is what
 * failing means here.
 *
 * Of the assertions below, only the `refuses` block can fail against HEAD. The scheme-less arm of
 * each pair and the whole `still refuses` test pass on both sides: they are the regression net that
 * proves this fix did not widen anything, not the proof that it closed something.
 */

test('a scheme-less address is upgraded, and anything carrying a scheme is left alone', () => {
  expect(withScheme('your-store.com')).toBe('https://your-store.com')
  expect(withScheme('  velde.releashed.io  ')).toBe('https://velde.releashed.io')
  // A leading space parses today (`new URL(' https://x')` succeeds), so trimming FIRST is what
  // stops this fix from newly rejecting input the route already accepts.
  expect(withScheme(' https://velde.releashed.io')).toBe('https://velde.releashed.io')
  // Never http:. Upgrade-only means this can never mint a match against the loopback allowlist,
  // whose keys carry an explicit `http:`.
  expect(withScheme('example.com').startsWith('https://')).toBe(true)

  for (const carried of [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'mailto:a@b.com',
    'data:text/html,x',
    'localhost:4001',
    'my-store.com:8080',
    'HTTP://EXAMPLE.COM',
  ]) {
    expect(withScheme(carried)).toBe(carried)
  }
})

async function extractStatus(url: string): Promise<number> {
  const response = await handleRequest(
    new Request('http://localhost:4003/v1/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  )
  return response.status
}

test('the private-host guard refuses every address that used to reach the fetch', async () => {
  // The four that got through. `[::ffff:127.0.0.1]` is loopback wearing an IPv4-mapped spelling,
  // which `URL` re-writes to `[::ffff:7f00:1]` — a leading-hextet test never sees the `127`.
  for (const host of [
    '0.0.0.0',
    '[::]',
    '[::ffff:127.0.0.1]',
    '[fc00::1]',
    // The fifth, found by an adversarial review of the fix after the first four were written up:
    // the root-terminated form of `localhost`. `ping localhost.` answers from 127.0.0.1.
    'localhost.',
    'foo.localhost.',
    '127.0.0.1.',
  ]) {
    expect(await extractStatus(`https://${host}`)).toBe(400)
    // And by the new route in, too: the same address typed without a scheme at all.
    expect(await extractStatus(host)).toBe(400)
  }
})

test('the guard still refuses everything it refused before, by either route in', async () => {
  for (const host of [
    '127.0.0.1',
    'localhost',
    '10.0.0.5',
    '169.254.169.254',
    '[::1]',
    '[fe80::1]',
  ]) {
    expect(await extractStatus(`https://${host}`)).toBe(400)
    expect(await extractStatus(host)).toBe(400)
  }
  // Userinfo cannot smuggle a private host past it: `hostname` is what the guard reads.
  expect(await extractStatus('user@127.0.0.1')).toBe(400)
  // A scheme we do not fetch stays unfetchable now that it survives normalisation untouched.
  for (const scheme of ['javascript:alert(1)', 'file:///etc/passwd', 'mailto:a@b.com']) {
    expect(await extractStatus(scheme)).toBe(400)
  }
})
