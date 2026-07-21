/**
 * Auth Setup — Run this ONCE to save an authenticated session.
 *
 * Usage:
 *   npx playwright test tests/e2e/auth.setup.ts --headed
 *
 * This opens a browser, navigates to /login, and waits for you to
 * log in manually. Once you're on the home page (authenticated),
 * it saves the session to tests/e2e/.auth/session.json.
 *
 * All other tests then reuse this saved session — no login needed.
 */

import { test as setup } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '.auth', 'session.json')

setup('authenticate', async ({ page }) => {
  // Navigate to login
  await page.goto('/login')
  await page.waitForTimeout(2000)

  // Fill in credentials
  const emailInput = page.getByRole('textbox', { name: /email/i }).or(page.locator('input[type="email"]')).or(page.locator('input[name="email"]'))
  const passwordInput = page.locator('input[type="password"]')

  await emailInput.fill('knewstubb@gmail.com')
  await passwordInput.fill('12345')

  // Submit
  const submitBtn = page.getByRole('button', { name: /sign in|log in|submit/i }).first()
  await submitBtn.click()

  // Wait until we're redirected to home (auth succeeded)
  await page.waitForURL('**/', { timeout: 30_000 })
  await page.waitForTimeout(2000)

  // Save the authenticated state
  await page.context().storageState({ path: authFile })
  console.log(`\n✅ Session saved to ${authFile}\n`)
})
