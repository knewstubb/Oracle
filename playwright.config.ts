import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const authFile = path.join(__dirname, 'tests/e2e/.auth/session.json')
const hasAuth = fs.existsSync(authFile)

/**
 * Playwright configuration for The Oracle E2E tests.
 *
 * Setup:
 *   1. Start the dev server: npm run dev
 *   2. Install browsers: npx playwright install chromium
 *   3. Save auth session: npx playwright test tests/e2e/auth.setup.ts --project=setup --headed
 *      (log in manually in the browser, then it auto-saves)
 *   4. Run tests: npx playwright test --project=chromium --headed
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['html'], ['line']],
  timeout: 60_000,

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Auth setup — run FIRST, once, with --headed
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      timeout: 180_000, // 3 minutes to log in manually
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
  ],
})
