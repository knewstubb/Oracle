import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import fs from 'fs'

type E2EMode = 'isolated' | 'shared-readonly'

const authFile = path.join(__dirname, 'tests/e2e/.auth/session.json')
const hasAuth = fs.existsSync(authFile)

const unsafeE2EHosts = new Set([
  'oracle-alpha-two.vercel.app',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
])

function resolveE2EMode(): E2EMode {
  const configuredMode = process.env.E2E_MODE?.trim()

  if (configuredMode === 'shared-readonly') {
    if (process.env.E2E_ISOLATED === 'true') {
      throw new Error(
        'E2E disabled: shared-readonly mode must not claim E2E_ISOLATED=true.',
      )
    }
    return 'shared-readonly'
  }

  // Preserve the existing isolated contract for current callers. E2E_MODE=isolated
  // makes that intent explicit, while the legacy E2E_ISOLATED=true form remains safe.
  if (configuredMode === undefined || configuredMode === '' || configuredMode === 'isolated') {
    if (process.env.E2E_ISOLATED !== 'true') {
      throw new Error(
        'E2E disabled: set E2E_ISOLATED=true only after verifying a dedicated Supabase-backed test environment.',
      )
    }
    return 'isolated'
  }

  throw new Error(
    `E2E disabled: unsupported E2E_MODE=${configuredMode}. Use isolated or shared-readonly.`,
  )
}

function requireSafeBaseURL(mode: E2EMode): string {
  const configuredURL = process.env.E2E_BASE_URL?.trim()
  if (!configuredURL) {
    throw new Error(`E2E disabled: E2E_BASE_URL is required for ${mode} mode.`)
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

const e2eMode = resolveE2EMode()
const baseURL = requireSafeBaseURL(e2eMode)

/**
 * Playwright configuration for The Oracle E2E tests.
 *
 * Isolated mode preserves the full mutable suite's dedicated-backend contract.
 * Shared-readonly mode is an explicit, temporary exception for one dedicated
 * identity against a separate frontend sharing the Oracle backend. It exposes
 * only the reviewed smoke spec and never claims isolation.
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
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'on-first-retry' : 'off',
  },

  projects: e2eMode === 'shared-readonly'
    ? [
        // This project is intentionally separate from the smoke command. It
        // exists only to refresh the dedicated test identity's browser state.
        {
          name: 'shared-readonly-auth',
          testMatch: /auth\.setup\.ts/,
          timeout: 180_000,
        },
        {
          name: 'shared-readonly',
          testMatch: /shared-readonly-smoke\.spec\.ts/,
          use: {
            ...devices['Desktop Chrome'],
            storageState: hasAuth ? authFile : undefined,
          },
        },
      ]
    : [
        // Auth setup — run first, once, with --headed (local only).
        {
          name: 'setup',
          testMatch: /auth\.setup\.ts/,
          timeout: 180_000,
        },
        // The full suite remains available only to a dedicated isolated backend.
        {
          name: 'chromium',
          use: {
            ...devices['Desktop Chrome'],
            storageState: hasAuth ? authFile : undefined,
          },
          testIgnore: [/auth\.setup\.ts/, /shared-readonly-smoke\.spec\.ts/],
        },
        // Mobile viewport tests
        {
          name: 'mobile',
          use: {
            ...devices['iPhone 14'],
            storageState: hasAuth ? authFile : undefined,
          },
          testIgnore: [/auth\.setup\.ts/, /shared-readonly-smoke\.spec\.ts/],
          testMatch: /mobile\.spec\.ts/,
        },
      ],
})
