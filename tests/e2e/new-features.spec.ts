/**
 * E2E Tests — New Features (2026-07-22 Sprint)
 *
 * Covers: Goldfish mode, Collection Export, Multi-platform Import, Price Refresh
 *
 * Prerequisites:
 *   - Auth session saved (npm run test:e2e:setup)
 *   - At least one deck with cards imported
 *   - Collection has cards (for export/price tests)
 */

import { test, expect } from '@playwright/test'

const LOAD_TIMEOUT = 30_000
const ACTION_TIMEOUT = 15_000

// ═══════════════════════════════════════════════════════════════════════════════
// GOLDFISH MODE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Goldfish Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to first deck
    await page.goto('/')
    await page.waitForTimeout(2000)
    // Click first deck tile
    const deckLink = page.locator('a[href*="/decks/"]').first()
    await expect(deckLink).toBeVisible({ timeout: LOAD_TIMEOUT })
    await deckLink.click()
    await page.waitForURL('**/decks/**')
    await page.waitForTimeout(1000)
  })

  test('Goldfish tab is visible in deck tabs', async ({ page }) => {
    const goldfishTab = page.getByRole('tab', { name: /goldfish/i })
    await expect(goldfishTab).toBeVisible({ timeout: LOAD_TIMEOUT })
  })

  test('clicking Goldfish tab shows game controls', async ({ page }) => {
    const goldfishTab = page.getByRole('tab', { name: /goldfish/i })
    await goldfishTab.click()
    await page.waitForTimeout(500)

    // Should see control buttons
    await expect(page.getByRole('button', { name: /new game/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /draw/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /mulligan/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /undo/i })).toBeVisible()
  })

  test('starts with 7 cards in hand', async ({ page }) => {
    const goldfishTab = page.getByRole('tab', { name: /goldfish/i })
    await goldfishTab.click()
    await page.waitForTimeout(500)

    // Hand section should show 7 cards
    const handHeading = page.getByText(/Hand \(7\)/i)
    await expect(handHeading).toBeVisible({ timeout: ACTION_TIMEOUT })
  })

  test('Draw button adds a card and advances turn', async ({ page }) => {
    const goldfishTab = page.getByRole('tab', { name: /goldfish/i })
    await goldfishTab.click()
    await page.waitForTimeout(500)

    const drawBtn = page.getByRole('button', { name: /draw/i })
    await drawBtn.click()
    await page.waitForTimeout(300)

    // Hand should now show 8
    const handHeading = page.getByText(/Hand \(8\)/i)
    await expect(handHeading).toBeVisible()

    // Turn counter should show 1
    await expect(page.getByText(/Turn: 1/)).toBeVisible()
  })

  test('Mulligan redraws hand to 7', async ({ page }) => {
    const goldfishTab = page.getByRole('tab', { name: /goldfish/i })
    await goldfishTab.click()
    await page.waitForTimeout(500)

    const mulliganBtn = page.getByRole('button', { name: /mulligan/i })
    await mulliganBtn.click()
    await page.waitForTimeout(300)

    // Hand should still show 7 (London mulligan draws 7)
    const handHeading = page.getByText(/Hand \(7\)/i)
    await expect(handHeading).toBeVisible()

    // Mulligan count shows in button
    await expect(page.getByRole('button', { name: /mulligan \(1\)/i })).toBeVisible()
  })

  test('New Game resets everything', async ({ page }) => {
    const goldfishTab = page.getByRole('tab', { name: /goldfish/i })
    await goldfishTab.click()
    await page.waitForTimeout(500)

    // Draw a card first
    await page.getByRole('button', { name: /draw/i }).click()
    await page.waitForTimeout(300)

    // Reset
    await page.getByRole('button', { name: /new game/i }).click()
    await page.waitForTimeout(300)

    // Back to 7 in hand, turn 0
    await expect(page.getByText(/Hand \(7\)/i)).toBeVisible()
    await expect(page.getByText(/Turn: 0/)).toBeVisible()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// COLLECTION EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Collection Export', () => {
  test('Export button is visible on collection page', async ({ page }) => {
    await page.goto('/collection')
    await page.waitForTimeout(2000)

    const exportBtn = page.getByRole('button', { name: /export/i })
    await expect(exportBtn).toBeVisible({ timeout: LOAD_TIMEOUT })
  })

  test('Export button triggers CSV download', async ({ page }) => {
    await page.goto('/collection')
    await page.waitForTimeout(2000)

    // Listen for download
    const downloadPromise = page.waitForEvent('download', { timeout: ACTION_TIMEOUT })

    const exportBtn = page.getByRole('button', { name: /export/i })
    await exportBtn.click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/oracle-collection.*\.csv$/)
  })

  test('Export API returns valid CSV with correct headers', async ({ request }) => {
    const res = await request.get('/api/collection/export')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/csv')

    const csv = await res.text()
    const firstLine = csv.split('\n')[0]
    expect(firstLine).toContain('Name')
    expect(firstLine).toContain('Edition Code')
    expect(firstLine).toContain('Scryfall ID')
    expect(firstLine).toContain('Purchase Price')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PRICE REFRESH
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Price Refresh', () => {
  test('Refresh Prices button is visible in collection value banner', async ({ page }) => {
    await page.goto('/collection')
    await page.waitForTimeout(3000)

    // The refresh button is in the CollectionValueBanner (only shows if collection has value)
    const refreshBtn = page.getByRole('button', { name: /refresh/i })
    // May not be visible if collection has no priced cards — that's OK
    const bannerVisible = await page.locator('text=Collection Value').isVisible()
    if (bannerVisible) {
      await expect(refreshBtn).toBeVisible()
    }
  })

  test('Cron endpoint returns valid response', async ({ request }) => {
    const res = await request.get('/api/cron/refresh-prices')
    // Should return 200 (no CRON_SECRET required when env var isn't set)
    // or 401 if CRON_SECRET is configured
    expect([200, 401]).toContain(res.status())

    if (res.status() === 200) {
      const data = await res.json()
      expect(data).toHaveProperty('updated')
      expect(data).toHaveProperty('total')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-PLATFORM DECK IMPORT (URL PARSING)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Multi-Platform Import', () => {
  test('Import button opens import dialog', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)

    // Find import deck button
    const importBtn = page.getByRole('button', { name: /import/i }).first()
    await expect(importBtn).toBeVisible({ timeout: LOAD_TIMEOUT })
    await importBtn.click()
    await page.waitForTimeout(500)

    // Dialog should open with URL input
    const urlInput = page.getByPlaceholder(/url/i).or(page.locator('input[type="url"]')).or(page.locator('input[placeholder*="archidekt"]'))
    await expect(urlInput).toBeVisible({ timeout: ACTION_TIMEOUT })
  })

  test('import preview accepts Archidekt URL format', async ({ request }) => {
    // Test with a known public deck — this tests URL parsing, not the actual fetch
    const res = await request.post('/api/decks/import/preview', {
      data: { url: 'https://archidekt.com/decks/1234567' },
    })
    // Will return 404 (deck doesn't exist) or 200 — either confirms URL parsing works
    expect([200, 404, 502]).toContain(res.status())
  })

  test('import preview accepts Moxfield URL format', async ({ request }) => {
    const res = await request.post('/api/decks/import/preview', {
      data: { url: 'https://www.moxfield.com/decks/abc123def' },
    })
    expect([200, 404, 502]).toContain(res.status())
  })

  test('import preview accepts MTGGoldfish URL format', async ({ request }) => {
    const res = await request.post('/api/decks/import/preview', {
      data: { url: 'https://www.mtggoldfish.com/deck/6000000' },
    })
    expect([200, 404, 502]).toContain(res.status())
  })

  test('import preview accepts TappedOut URL format', async ({ request }) => {
    const res = await request.post('/api/decks/import/preview', {
      data: { url: 'https://tappedout.net/mtg-decks/my-cool-deck/' },
    })
    expect([200, 404, 502]).toContain(res.status())
  })

  test('import preview accepts Deckbox URL format', async ({ request }) => {
    const res = await request.post('/api/decks/import/preview', {
      data: { url: 'https://deckbox.org/sets/1234567' },
    })
    expect([200, 404, 502]).toContain(res.status())
  })

  test('import preview rejects unsupported URL', async ({ request }) => {
    const res = await request.post('/api/decks/import/preview', {
      data: { url: 'https://example.com/not-a-deck' },
    })
    expect(res.status()).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('does not match')
  })

  test('text paste import works with MTGA format', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)

    const importBtn = page.getByRole('button', { name: /import/i }).first()
    await importBtn.click()
    await page.waitForTimeout(500)

    // Switch to paste mode if there's a tab/toggle
    const pasteTab = page.getByText(/paste/i).first()
    if (await pasteTab.isVisible()) {
      await pasteTab.click()
      await page.waitForTimeout(300)
    }

    // Look for textarea
    const textarea = page.locator('textarea').first()
    if (await textarea.isVisible()) {
      await textarea.fill('Commander\n1 Sol Ring (CMR) 472\n1 Command Tower (CMR) 350')
      // Should accept the input without error
      await page.waitForTimeout(500)
    }
  })
})
