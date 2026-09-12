import { test as setup, expect } from '@playwright/test'
import fs from 'fs/promises'
import path from 'path'
import dotenv from 'dotenv'

// Load test credentials from .env.test.local
dotenv.config({ path: path.join(__dirname, '../../.env.test.local') })

const authFile = path.join(__dirname, '.auth', 'session.json')
const manualPreviewAccess = process.env.E2E_MANUAL_PREVIEW_ACCESS === 'true'
const previewProtectionBypass = process.env.E2E_VERCEL_PROTECTION_BYPASS?.trim()

function expectedLoginOrigin(): string {
  const baseURL = process.env.E2E_BASE_URL
  if (!baseURL) {
    throw new Error('E2E auth setup disabled: E2E_BASE_URL is required.')
  }

  return new URL(baseURL).origin
}

function previewLoginURL(expectedOrigin: string): string {
  const loginURL = new URL('/login', expectedOrigin)
  if (previewProtectionBypass) {
    // Ask Vercel to set a bypass cookie for the whole browsing context so that
    // the app's own client-side navigation stays past deployment protection.
    loginURL.searchParams.set('x-vercel-protection-bypass', previewProtectionBypass)
    loginURL.searchParams.set('x-vercel-set-bypass-cookie', 'true')
  }
  return loginURL.toString()
}

setup('authenticate', async ({ page, context }) => {
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD
  const expectedOrigin = expectedLoginOrigin()

  // Send the automation bypass on every request in this context as well, since
  // Vercel accepts the bypass secret as a header for protected deployments.
  if (previewProtectionBypass) {
    await context.setExtraHTTPHeaders({
      'x-vercel-protection-bypass': previewProtectionBypass,
      'x-vercel-set-bypass-cookie': 'true',
    })
  }

  // Navigate to the app's own login screen. A protected Preview can intercept
  // this request before Oracle is reached. The explicit manual flag keeps the
  // headed browser open so a human can complete that separate Vercel challenge.
  await page.goto(previewLoginURL(expectedOrigin))

  const isOracleLogin = () => {
    const current = new URL(page.url())
    return current.origin === expectedOrigin && current.pathname === '/login'
  }

  if (!isOracleLogin()) {
    if (!manualPreviewAccess) {
      throw new Error(
        'E2E auth setup blocked before the Oracle login page. Re-run locally with E2E_MANUAL_PREVIEW_ACCESS=true and complete Preview access in the headed browser, or configure approved non-interactive Preview access.',
      )
    }

    console.log('\nComplete Preview access in the headed browser window. Waiting up to five minutes for the Oracle login page...\n')
    await page.waitForURL(
      url => url.origin === expectedOrigin && url.pathname === '/login',
      { timeout: 300_000 },
    )
  }

  const emailInput = page.getByRole('textbox', { name: /email/i })
    .or(page.locator('input[type="email"]'))
    .or(page.locator('input[name="email"]'))
  const passwordInput = page.locator('input[type="password"]')
  await expect(emailInput).toBeVisible({ timeout: 10_000 })
  await expect(passwordInput).toBeVisible({ timeout: 10_000 })

  if (email && password) {
    // Auto-login with the dedicated test identity only after Oracle's own form
    // is visible; credentials are never entered into the Preview access layer.
    await emailInput.fill(email)
    await passwordInput.fill(password)

    const submitBtn = page.getByRole('button', { name: /sign in|log in|submit/i }).first()
    await submitBtn.click()
  } else {
    // Manual fallback — wait for user to log in.
    console.log('\n⚠️  No TEST_USER_EMAIL/TEST_USER_PASSWORD in .env.test.local')
    console.log('    Log in manually in the browser window...\n')
  }

  // Wait until we're redirected to the app root (auth succeeded).
  await page.waitForURL('**/', { timeout: 30_000 })
  await page.waitForTimeout(2_000)

  // The directory is intentionally ignored, so it may not exist in a fresh clone.
  await fs.mkdir(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })
  console.log(`\n✅ Session saved to ${authFile}\n`)
})
