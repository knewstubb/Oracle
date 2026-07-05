import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for The Oracle E2E smoke tests.
 *
 * Usage:
 *   npx playwright test tests/e2e/oracle-smoke.spec.ts
 *
 * Prerequisites:
 *   1. The Oracle dev server running: npm run dev
 *   2. Archidekt account synced (at least one deck present)
 *   3. Playwright browsers installed: npx playwright install chromium
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  timeout: 120_000,

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
