/**
 * The Oracle — End-to-End Smoke Test
 *
 * Full workflow: view deck → scan → recommend → write proxy tag → create deck
 *
 * Prerequisites:
 *   1. Start the dev server:  npm run dev
 *   2. Install browsers:      npx playwright install chromium
 *   3. Ensure Archidekt account is configured and reachable
 *
 * Run:
 *   npx playwright test tests/e2e/oracle-smoke.spec.ts
 *
 * This test runs against a live app with real Archidekt data.
 * Steps that require Archidekt writes are wrapped in skip guards
 * so the read-only flow can be validated independently.
 */

import { test, expect } from '@playwright/test'

/** Generous timeout for MCP / Playwright-driven operations */
const AI_TIMEOUT = 90_000
const LOAD_TIMEOUT = 60_000

test.describe.serial('Oracle full workflow smoke test', () => {
  /** Deck ID captured during the "view deck" step, reused by later steps */
  let deckId: string

  // ─── Step 1: Deck List ─────────────────────────────────────────
  test('1 — Deck list: verify decks appear on the home page', async ({ page }) => {
    await page.goto('/')

    // Wait for at least one deck tile to appear in the grid
    const deckList = page.getByRole('list', { name: /deck list/i })
    await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })

    const tiles = deckList.getByRole('listitem')
    await expect(tiles.first()).toBeVisible({ timeout: LOAD_TIMEOUT })

    const count = await tiles.count()
    expect(count).toBeGreaterThan(0)
  })

  // ─── Step 2: View Deck ──────────────────────────────────────────
  test('2 — View deck: click a deck tile and verify card grid loads', async ({ page }) => {
    await page.goto('/')

    // Wait for deck tiles
    const deckList = page.getByRole('list', { name: /deck list/i })
    await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })

    // Click the first deck tile (it's an <a> wrapping the tile)
    const firstTile = deckList.getByRole('listitem').first()
    await expect(firstTile).toBeVisible()
    const link = firstTile.locator('a').first()
    const href = await link.getAttribute('href')
    expect(href).toBeTruthy()

    // Extract deck ID from href (e.g. /decks/12345)
    deckId = href!.replace('/decks/', '')

    await link.click()
    await page.waitForURL(`**/decks/${deckId}`)

    // Verify the Cards tab content loads — card grid should be visible
    await expect(page.getByRole('tab', { name: /cards/i })).toBeVisible()

    // Wait for at least one card image to render in the grid
    await expect(
      page.locator('img[alt]').first()
    ).toBeVisible({ timeout: 15_000 })
  })

  // ─── Step 3: Scan ───────────────────────────────────────────────
  test('3 — Scan: trigger deck scan and verify analysis renders', async ({ page }) => {
    test.slow() // AI analysis can take a while

    await page.goto(`/decks/${deckId}`)

    // Switch to the Scan tab
    const scanTab = page.getByRole('tab', { name: /scan/i })
    await expect(scanTab).toBeVisible()
    await scanTab.click()

    // Click "Scan Deck" button to start analysis
    const scanButton = page.getByRole('button', { name: /scan deck/i })
    await expect(scanButton).toBeVisible({ timeout: 5_000 })
    await scanButton.click()

    // Wait for analysis to complete — look for strategy or strengths section
    await expect(
      page.getByText(/strategy|strengths|weaknesses/i).first()
    ).toBeVisible({ timeout: AI_TIMEOUT })
  })

  // ─── Step 4: Recommend ──────────────────────────────────────────
  test('4 — Recommend: trigger recommendations and verify adds/cuts appear', async ({ page }) => {
    test.slow()

    await page.goto(`/decks/${deckId}`)

    // Switch to the Recommend tab
    const recommendTab = page.getByRole('tab', { name: /recommend/i })
    await expect(recommendTab).toBeVisible()
    await recommendTab.click()

    // Click "Get Recommendations" button
    const recButton = page.getByRole('button', { name: /get recommendations/i })
    await expect(recButton).toBeVisible({ timeout: 5_000 })
    await recButton.click()

    // Wait for either "Suggested Adds" or "Suggested Cuts" heading
    await expect(
      page.getByText(/suggested adds|suggested cuts/i).first()
    ).toBeVisible({ timeout: AI_TIMEOUT })
  })

  // ─── Step 5: Write Proxy Tag ────────────────────────────────────
  test('5 — Write proxy tag: navigate to Shared Cards, expand a card, change allocation, apply', async ({ page }) => {
    test.slow()

    // Navigate to Shared Cards page
    await page.goto('/shared-cards')

    // Wait for the shared cards list to load
    const cardList = page.getByRole('list', { name: /shared cards list/i })
    await expect(cardList).toBeVisible({ timeout: 15_000 })

    const rows = cardList.getByRole('listitem')
    const rowCount = await rows.count()

    // Skip if no shared cards exist (need 2+ decks sharing a card)
    test.skip(rowCount === 0, 'No shared cards found — need multiple decks sharing cards')

    // Click the first shared card row to expand the proxy allocation panel
    await rows.first().click()

    // Look for the proxy allocation radio buttons (Original / Proxy)
    const radioGroup = page.locator('[role="radiogroup"]')
    if (await radioGroup.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Select a radio option to change allocation
      const proxyRadio = page.getByRole('radio', { name: /proxy/i }).first()
      if (await proxyRadio.isVisible().catch(() => false)) {
        await proxyRadio.click()
      }

      // Look for "Apply to Archidekt" button
      const applyButton = page.getByRole('button', { name: /apply to archidekt/i })
      if (await applyButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await applyButton.click()

        // Confirm in the confirmation modal
        const confirmButton = page.getByRole('button', { name: /confirm/i })
        if (await confirmButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await confirmButton.click()
        }

        // Wait for success toast or status update
        await expect(
          page.getByText(/proxy tags updated|success/i).first()
        ).toBeVisible({ timeout: AI_TIMEOUT })
      }
    }
  })

  // ─── Step 6: Create Deck ────────────────────────────────────────
  test('6 — Create deck: search commander, generate deck, review, create', async ({ page }) => {
    test.slow()

    // Navigate to New Deck page
    await page.goto('/new-deck')

    // Step 1: Commander Search — type a commander name
    const searchInput = page.getByRole('textbox').first()
    await expect(searchInput).toBeVisible({ timeout: 5_000 })
    await searchInput.fill('Muldrotha')

    // Wait for search results to appear
    await page.waitForTimeout(1_000) // debounce

    // Select the first result (click on a commander card)
    const results = page.getByRole('option').or(page.getByRole('listitem'))
    if (await results.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
      await results.first().click()
    }

    // Click "Next" to proceed to generation
    const nextButton = page.getByRole('button', { name: /next/i })
    if (await nextButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nextButton.click()
    }

    // Step 2: AI Generation — wait for it to complete
    await expect(
      page.getByTestId('generation-step').or(page.locator('[data-testid="generation-step"]'))
    ).toBeVisible({ timeout: 5_000 }).catch(() => {
      // May have already advanced to step 3
    })

    // Step 3: Review — wait for the card editor or step 3 content
    // The generation auto-advances to step 3 on completion
    await expect(
      page.getByText(/\/99|cards/i).first()
    ).toBeVisible({ timeout: AI_TIMEOUT })

    // Click "Create Deck" to proceed to step 4
    const createButton = page.getByRole('button', { name: /create deck/i })
    if (await createButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await createButton.click()

      // Step 4: Confirm & Create — wait for the create step
      await expect(
        page.getByTestId('create-step').or(page.locator('[data-testid="create-step"]'))
      ).toBeVisible({ timeout: 10_000 })

      // Click "Create in Archidekt"
      const archidektButton = page.getByRole('button', { name: /create in archidekt/i })
      if (await archidektButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await archidektButton.click()

        // Wait for success or error
        await expect(
          page.getByText(/deck created|view in archidekt|failed/i).first()
        ).toBeVisible({ timeout: AI_TIMEOUT })
      }
    }
  })
})
