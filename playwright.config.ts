import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const authFile = path.join(__dirname, 'tests/e2e/.auth/session.json')
const hasAuth = fs.existsSync(authFile)

const unsafeE2EHosts = new Set([
  'oracle-alpha-two.vercel.app',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
])

function requireIsolatedBaseURL(): string {
  if (process.env.E2E_ISOLATED !== 'true') {
    throw new Error(
      'E2E disabled: set E2E_ISOLATED=true only after verifying a dedicated Supabase-backed test environment.',
    )
  }

  const configuredURL = process.env.E2E_BASE_URL?.trim()
  if (!configuredURL) {
    throw new Error('E2E disabled: E2E_BASE_URL is required for the isolated test environment.')
  }

  let target: URL
  try {
    target = new URL(configuredURL)
  } catch {
    throw new Error('E2E disabled: E2E_BASE_URL must be a valid absolute URL.')
  }

  const hostname = target.hostname.toLowerCase()
  const isLoopback = unsafeE2EHosts.has(hostname) || hostname.endsWith('.localhost')

  if (target.protocol !== 'https:' || isLoopback) {
    throw new Error(`E2E disabled: refusing unsafe target ${target.origin}.`)
  }

  return target.toString().replace(/\/$/, '')
}

const isolatedBaseURL = requireIsolatedBaseURL()

/**
 * Playwright configuration for The Oracle E2E tests.
 *
 * Every invocation requires an explicitly attested isolated frontend backed by
 * a dedicated Supabase project. Production and localhost are always denied.
 * See tests/e2e/README.md for the provisioning and execution contract.
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
    baseURL: isolatedBaseURL,
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
