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
      // T13's live intake turn is opt-in, and this pins it off for a platform THIS config starts.
      // It is not sufficient on its own — `reuseExistingServer` below means a server someone
      // already started by hand is reused and this block never applies — which is why
      // `offline.spec.ts` asserts the endpoint is actually off rather than trusting this line.
      env: { ...process.env, MAXIMAL_LLM: '0' },
      url: 'http://localhost:4003/v1/config/velde',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
