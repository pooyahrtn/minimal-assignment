import { expect, test } from 'bun:test'
import { handleRequest } from './server'

/**
 * The T14 outage: `api/platform.ts` documented "the named-method form selects the Web handler
 * signature", but production kept handing `handleRequest` a bare-path `request.url` anyway —
 * whichever runtime or invocation shape does it, `new URL(request.url)` threw before any route
 * matched. `handleRequest` now reconstructs an absolute URL itself from the host headers rather
 * than trusting the caller, so this is the one check that fails if that regresses.
 */
function bareRequest(path: string, headers: Record<string, string> = {}): Request {
  const request = new Request(`https://example.test${path}`, { headers })
  // A real `Request.url` is always absolute — this is the one way to reproduce the bare-path
  // shape a misbehaving runtime hands the router, short of forging a non-Request object.
  Object.defineProperty(request, 'url', { value: path, configurable: true })
  return request
}

test('a bare-path request.url routes instead of throwing, given a host header', async () => {
  const request = bareRequest('/v1/nonsense', { host: 'maximal.releashed.io' })
  const response = await handleRequest(request)
  expect(response.status).toBe(404)
})

test('x-forwarded-host wins over host when both are present', async () => {
  const request = bareRequest('/v1/agent.js', {
    host: 'maximal-platform.vercel.app',
    'x-forwarded-host': 'maximal.releashed.io',
    'x-forwarded-proto': 'https',
  })
  const response = await handleRequest(request)
  expect(response.status).toBe(200)
})

test('a bare-path request.url with no host header at all is a 400, not a crash', async () => {
  const response = await handleRequest(bareRequest('/v1/extract'))
  expect(response.status).toBe(400)
})

test('an absolute request.url (the normal Fetch API shape) still works unchanged', async () => {
  const response = await handleRequest(new Request('https://maximal.releashed.io/v1/nonsense'))
  expect(response.status).toBe(404)
})
