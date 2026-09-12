import { expect, test } from '@playwright/test'

const LOAD_TIMEOUT = 30_000

/**
 * Shared-backend smoke coverage.
 *
 * This is the complete allowlist for E2E_MODE=shared-readonly. It uses only
 * navigation and rendering assertions against the dedicated fixture deck; it
 * must not add collection, deck, allocation, import, reset, cron, or API write
 * operations. See tests/e2e/README.md for the temporary-risk boundary.
 */
const previewProtectionBypass = process.env.E2E_VERCEL_PROTECTION_BYPASS?.trim()
const FIXTURE_DECK_NAME = 'E2E Read-only Snapshot Fixture'

test.describe('Shared read-only smoke', () => {
  test.beforeEach(async ({ context }) => {
    // Carry Vercel's automation bypass when the Preview is protection-guarded.
    if (previewProtectionBypass) {
      await context.setExtraHTTPHeaders({
        'x-vercel-protection-bypass': previewProtectionBypass,
        'x-vercel-set-bypass-cookie': 'true',
      })
    }
  })

  test('renders the dedicated fixture deck and commander context', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Decks', level: 1 })).toBeVisible({
      timeout: LOAD_TIMEOUT,
    })

    const fixtureLink = page.getByRole('link', { name: new RegExp(FIXTURE_DECK_NAME, 'i') }).first()
    await expect(fixtureLink).toBeVisible({ timeout: LOAD_TIMEOUT })
    await fixtureLink.click()

    await expect(page).toHaveURL(/\/decks\/-?\d+/)
    await expect(page.getByRole('heading', { name: FIXTURE_DECK_NAME }).first()).toBeVisible({
      timeout: LOAD_TIMEOUT,
    })
    await expect(page.getByRole('tab', { name: 'Cards' })).toBeVisible({ timeout: LOAD_TIMEOUT })
    await expect(page.getByRole('tab', { name: 'Analysis' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Application error')
  })
})
