/**
 * Auth Setup — Saves an authenticated session for E2E tests.
 *
 * Usage:
 *   npm run test:e2e:setup
 *
 * Reads credentials from .env.test.local (TEST_USER_EMAIL, TEST_USER_PASSWORD)
 * and logs in automatically. Falls back to manual login if env vars aren't set.
 *
 * The saved session is reused by all other tests — no login needed per-test.
 */

import { test as setup } from '@playwright/test'
import path from 'path'
import dotenv from 'dotenv'

// Load test credentials from .env.test.local
dotenv.config({ path: path.join(__dirname, '../../.env.test.local') })

const authFile = path.join(__dirname, '.auth', 'session.json')

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD

  // Navigate to login
  await page.goto('/login')
  await page.waitForTimeout(2000)

  // Fill in credentials
  const emailInput = page.getByRole('textbox', { name: /email/i })
    .or(page.locator('input[type="email"]'))
    .or(page.locator('input[name="email"]'))
  const passwordInput = page.locator('input[type="password"]')

  if (email && password) {
    // Auto-login with env vars
    await emailInput.fill(email)
    await passwordInput.fill(password)

    // Submit
    const submitBtn = page.getByRole('button', { name: /sign in|log in|submit/i }).first()
    await submitBtn.click()
  } else {
    // Manual fallback — wait for user to log in
    console.log('\n⚠️  No TEST_USER_EMAIL/TEST_USER_PASSWORD in .env.test.local')
    console.log('    Log in manually in the browser window...\n')
  }

  // Wait until we're redirected to home (auth succeeded)
  await page.waitForURL('**/', { timeout: 30_000 })
  await page.waitForTimeout(2000)

  // Save the authenticated state
  await page.context().storageState({ path: authFile })
  console.log(`\n✅ Session saved to ${authFile}\n`)
})
