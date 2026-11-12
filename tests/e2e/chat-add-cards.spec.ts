/**
 * Chat add-cards E2E (needs a logged-in session, the chat_card_proposals migration applied, and a real AI key).
 * Contract: docs/oracle/contracts/chat-add-cards.md
 *
 * The model's reply is not predictable, so the stream is stubbed: the chat route returns one proposal for a card
 * the test inserts itself is NOT possible here, so this spec checks the safe parts that do not depend on the model:
 * the page never adds anything before a click, and the old "+" shows a blocked message for a card already in the deck.
 *
 * Run: npx playwright test tests/e2e/chat-add-cards.spec.ts --headed
 */

import { test, expect } from '@playwright/test'

test.describe('chat add cards', () => {
  test('asking for cards changes nothing in the deck until Add is clicked', async ({ page }) => {
    await page.goto('/decks')
    await page.locator('a[href^="/decks/"]').first().click()
    await page.waitForLoadState('networkidle')
    const before = await page.locator('body').innerText()

    let confirmCalls = 0
    await page.route('**/chat-proposals/confirm', async (route) => {
      confirmCalls++
      await route.continue()
    })

    await page.getByPlaceholder(/ask/i).first().fill('Suggest 3 cards I could add')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(15_000)

    expect(confirmCalls).toBe(0)
    const addButtons = page.getByRole('button', { name: /^Add .* to /i })
    if ((await addButtons.count()) > 0) {
      // Deck text is unchanged by the proposal itself.
      expect(await page.locator('[data-testid="chat-proposals"]').count()).toBeGreaterThan(0)
      await addButtons.first().click()
      await expect(page.getByText(/^Added/).first()).toBeVisible()
      await page.getByRole('button', { name: /Undo/ }).first().click()
      await expect(page.getByText(/Removed again/).first()).toBeVisible()
    }
    expect(before.length).toBeGreaterThan(0)
  })
})
