import { afterAll, describe, expect, test } from 'bun:test'
import { extractMerchantTokens } from './extract'

// A real local server, not a mock of `fetch` — exercises the actual HTTP + regex path the live
// extractor runs, without depending on the internet or a real webshop staying up.
const HTML_OK = `<!doctype html><html><head>
  <link rel="stylesheet" href="/style.css">
  <link rel="icon" href="/favicon.png">
  <style>:root{--brand-accent:#123ABC;--surface-bg:#F5F5F5;} .card{border-radius:8px}</style>
</head><body>hello</body></html>`

const CSS_OK = `body{font-family:"Acme Sans",sans-serif} .btn{border-radius:8px} .pill{border-radius:999px}`

const server = Bun.serve({
  port: 0,
  routes: {
    '/ok': () => new Response(HTML_OK, { headers: { 'content-type': 'text/html' } }),
    '/style.css': () => new Response(CSS_OK, { headers: { 'content-type': 'text/css' } }),
    '/favicon.png': () => new Response('', { headers: { 'content-type': 'image/png' } }),
    '/forbidden': () => new Response('nope', { status: 403 }),
    '/api': () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
    // Same family, declared the two ways that matter: `/ok` self-hosts "Acme Sans" and `/google`
    // buys it from Google. The href is the only thing that may differ between them.
    '/google': () =>
      new Response(
        `<!doctype html><html><head><style>
          @import url(https://fonts.googleapis.com/css2?family=Acme+Sans:wght@400;600&display=swap);
          body{font-family:"Acme Sans",sans-serif}
        </style></head><body>hello</body></html>`,
        { headers: { 'content-type': 'text/html' } },
      ),
    '/no-signal': () =>
      new Response('<!doctype html><html><body>plain</body></html>', {
        headers: { 'content-type': 'text/html' },
      }),
  },
  fetch: () => new Response('not found', { status: 404 }),
})

afterAll(() => {
  server.stop(true)
})

describe('extractMerchantTokens: never throws, always returns a usable draft', () => {
  test('reads accent/surface from named CSS custom properties, radius from the modal border-radius, a logo from <link rel=icon>', async () => {
    const draft = await extractMerchantTokens(`${server.url}ok`)
    expect(draft.ok).toBe(true)
    expect(draft.tokens.accent).toBe('#123ABC')
    expect(draft.tokens.surface).toBe('#F5F5F5')
    expect(draft.tokens.radius).toBe('md') // 8px, the more common of the two declared radii
    expect(draft.tokens.fontDisplay.family).toBe('Acme Sans')
    // Nothing on the page says this face comes from Google, so no stylesheet is minted for it —
    // a guessed `?family=Acme+Sans` would 404 on every page view. The family alone is the answer:
    // the host page already resolves it.
    expect(draft.tokens.fontDisplay.href).toBe('')
    expect(draft.tokens.fontBody.href).toBe('')
    expect(draft.logo).toBe(`${server.url}favicon.png`)
  })

  test('a family the page itself loads from Google Fonts DOES get a stylesheet minted', async () => {
    const draft = await extractMerchantTokens(`${server.url}google`)
    expect(draft.tokens.fontDisplay.family).toBe('Acme Sans')
    expect(draft.tokens.fontDisplay.href).toBe(
      'https://fonts.googleapis.com/css2?family=Acme+Sans:wght@400;600&display=swap',
    )
  })

  test('403 degrades to a usable default draft with an honest note, never a throw', async () => {
    const draft = await extractMerchantTokens(`${server.url}forbidden`)
    expect(draft.ok).toBe(false)
    expect(draft.tokens.accent).toBeTruthy()
    expect(draft.note).toContain('403')
  })

  test('a non-HTML response (a JSON API) degrades to a default draft, never a parse crash', async () => {
    const draft = await extractMerchantTokens(`${server.url}api`)
    expect(draft.ok).toBe(false)
    expect(draft.note.toLowerCase()).toContain('webpage')
  })

  test('an unreachable host degrades to a default draft rather than rejecting', async () => {
    const draft = await extractMerchantTokens('http://127.0.0.1:1')
    expect(draft.ok).toBe(false)
    expect(draft.tokens).toBeTruthy()
  })

  test('a malformed URL degrades to a default draft rather than throwing', async () => {
    const draft = await extractMerchantTokens('not a url')
    expect(draft.ok).toBe(false)
  })

  test('HTML with no brand signal at all still returns the neutral default tokens', async () => {
    const draft = await extractMerchantTokens(`${server.url}no-signal`)
    expect(draft.ok).toBe(true)
    expect(draft.tokens.accent).toBe('#2554C7')
    expect(draft.tokens.surface).toBe('#FFFFFF')
    expect(draft.logo).toBeNull()
  })

  test('the two seeded demo storefronts resolve without a network round-trip', async () => {
    const velde = await extractMerchantTokens('http://localhost:4001')
    const kracht = await extractMerchantTokens('http://localhost:4002')
    expect(velde.ok).toBe(true)
    expect(kracht.ok).toBe(true)
    expect(velde.note).toContain('Seeded')
    expect(kracht.note).toContain('Seeded')
  })
})
