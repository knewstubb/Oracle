import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const authFile = path.join(__dirname, 'tests/e2e/.auth/session.json')
const hasAuth = fs.existsSync(authFile)

/**
 * Playwright configuration for The Oracle E2E tests.
 *
 * Running locally:
 *   1. Start the dev server: npm run dev
 *   2. Install browsers: npx playwright install chromium
 *   3. Save auth session: npm run test:e2e:setup
 *      (log in manually in the browser, then it auto-saves)
 *   4. Run tests: npm run test:e2e
 *
 * Running against production/preview:
 *   BASE_URL=https://oracle-alpha-two.vercel.app npm run test:e2e
 *
 * CI (GitHub Actions):
 *   Uses PLAYWRIGHT_AUTH_SESSION secret (base64-encoded session.json)
 *   and BASE_URL from Vercel deployment.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['html'], ['line']],
  timeout: 60_000,

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'on-first-retry' : 'off',
  },

  projects: [
    // Auth setup — run FIRST, once, with --headed (local only)
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      timeout: 180_000,
    },
    // Main tests — use saved auth if available
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: hasAuth ? authFile : undefined,
      },
      testIgnore: /auth\.setup\.ts/,
    },
    // Mobile viewport tests
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 14'],
        storageState: hasAuth ? authFile : undefined,
      },
      testIgnore: /auth\.setup\.ts/,
      testMatch: /mobile\.spec\.ts/,
    },
  ],
})
