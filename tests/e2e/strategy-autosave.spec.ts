/**
 * Strategy window autosave (isolated mode only: it saves real text to a deck).
 * Run: E2E_ISOLATED=true E2E_BASE_URL=https://<isolated-deployment> npx playwright test tests/e2e/strategy-autosave.spec.ts --project=chromium
 */
import { test, expect, type Page } from '@playwright/test'

const LOAD_TIMEOUT = 30_000

async function openStrategyWindow(page: Page) {
  await page.goto('/decks/21109505')
  const block = page.getByTestId('strategy-block')
  await expect(block).toBeVisible({ timeout: LOAD_TIMEOUT })
  await block.click()
  await expect(page.getByRole('dialog', { name: 'Strategy' })).toBeVisible()
}

test.describe('Strategy window autosave', () => {
  test('typing saves after a pause and says Saved', async ({ page }) => {
    await openStrategyWindow(page)
    await page.getByLabel('Playgroup (optional)').fill(`Autosave ${Date.now()}`)
    await expect(page.getByTestId('save-status')).toHaveText(/Saved at/, { timeout: 10_000 })
    await expect(page.getByRole('button', { name: /^save$/i })).toHaveCount(0)
  })

  test('closing in the middle of typing keeps the text', async ({ page }) => {
    await openStrategyWindow(page)
    const text = `Closed mid-typing ${Date.now()}`
    await page.getByLabel('Playgroup (optional)').fill(text)
    await page.getByRole('button', { name: 'Close' }).last().click()
    await expect(page.getByRole('dialog', { name: 'Strategy' })).toBeHidden()
    await page.getByTestId('strategy-block').click()
    await expect(page.getByLabel('Playgroup (optional)')).toHaveValue(text)
  })

  test('offline shows the message and the text stays', async ({ page, context }) => {
    await openStrategyWindow(page)
    await context.setOffline(true)
    await page.getByLabel('Playgroup (optional)').fill('typed while offline')
    await expect(page.getByTestId('save-status')).toHaveText(/Offline\. Will save when you're back/)
    await expect(page.getByLabel('Playgroup (optional)')).toHaveValue('typed while offline')
    await context.setOffline(false)
    await expect(page.getByTestId('save-status')).toHaveText(/Saved at/, { timeout: 10_000 })
  })
})
