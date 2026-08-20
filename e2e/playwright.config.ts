import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

// webServer commands are root package.json scripts, so run them from repo root regardless of
// where `playwright test -c e2e/playwright.config.ts` itself was invoked from. [ENGINEERING §3.2]
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { viewport: { width: 375, height: 812 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: 'bun run dev:velde',
      cwd: repoRoot,
      url: 'http://localhost:4001/',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'bun run dev:kracht',
      cwd: repoRoot,
      url: 'http://localhost:4002/',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    // Both storefronts' one embed line points here for /v1/agent.js and /v1/config/:shop — T12's
    // agent.spec.ts needs it running too, so the whole suite is still one command from a cold repo.
    {
      command: 'bun run dev:platform',
      cwd: repoRoot,
      // The intake model is the ONLY intake path now, so a suite that pinned it off would be
      // testing a widget that cannot answer anything. This turns it ON for a platform THIS config
      // starts, and `ANTHROPIC_API_KEY` comes from `.env.local`, which Bun loads for `dev:platform`.
      //
      // It is not sufficient on its own — `reuseExistingServer` below means a server someone
      // already started by hand is reused and this block never applies — which is why
      // `live.spec.ts` asserts the endpoint is actually answering rather than trusting this line.
      //
      // This suite now SPENDS MONEY on every message it types. That inverts the box T13 wrote
      // ("stay green and stay offline"); the override and its reason are in DECISIONS-LOG.md.
      env: { ...process.env, MAXIMAL_LLM: '1' },
      url: 'http://localhost:4003/v1/config/velde',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
