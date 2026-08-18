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
  ],
})
