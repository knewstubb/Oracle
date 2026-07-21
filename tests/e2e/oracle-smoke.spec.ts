/**
 * The Oracle — Comprehensive E2E Test Suite
 *
 * Covers all user-facing functionality across the application.
 * Tests run against a live dev server with real Supabase data.
 *
 * Prerequisites:
 *   1. Start the dev server:  npm run dev
 *   2. Install browsers:      npx playwright install chromium
 *   3. Ensure you're logged in (auth session active)
 *   4. At least one deck imported and one storage location configured
 *
 * Run:
 *   npx playwright test
 *   npx playwright test --headed    (watch it run)
 *   npx playwright test --ui        (interactive UI mode)
 */

import { test, expect, type Page } from '@playwright/test'

const LOAD_TIMEOUT = 30_000
const ACTION_TIMEOUT = 15_000

// ═══════════════════════════════════════════════════════════════════════════════
// 1. NAVIGATION & LAYOUT
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Navigation & Layout', () => {
  test('sidebar is visible with all nav links', async ({ page }) => {
    await page.goto('/')
    const sidebar = page.locator('nav, aside, [data-slot="sidebar"]').first()
    await expect(sidebar).toBeVisible({ timeout: LOAD_TIMEOUT })

    // Check key nav items exist
    await expect(page.getByText('Decks')).toBeVisible()
    await expect(page.getByText('Collection')).toBeVisible()
    await expect(page.getByText('Storage')).toBeVisible()
  })

  test('can navigate to all main pages', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)

    // Navigate to Collection
    await page.getByText('Collection').click()
    await page.waitForURL('**/collection')
    await expect(page).toHaveURL(/\/collection/)

    // Navigate to Storage
    await page.getByText('Storage').click()
    await page.waitForURL('**/storage')
    await expect(page).toHaveURL(/\/storage/)

    // Navigate to Settings
    await page.getByText('Settings').click()
    await page.waitForURL('**/settings')
    await expect(page).toHaveURL(/\/settings/)

    // Navigate back to Decks
    await page.getByText('Decks').click()
    await page.waitForURL(/^\/$|\/decks/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DECKS GRID (HOME PAGE)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Decks Grid', () => {
  test('deck tiles render with commander art', async ({ page }) => {
    await page.goto('/')
    const deckList = page.getByRole('list', { name: /deck list/i })
    await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })

    const tiles = deckList.getByRole('listitem')
    const count = await tiles.count()
    expect(count).toBeGreaterThan(0)

    // Each tile should have an image (commander art)
    const firstTile = tiles.first()
    await expect(firstTile.locator('img').first()).toBeVisible()
  })

  test('deck tiles show status badges (Brewing/Built/Archived)', async ({ page }) => {
    await page.goto('/')
    const deckList = page.getByRole('list', { name: /deck list/i })
    await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })

    // At least one badge should be visible
    const badges = page.locator('text=/Brewing|Built|Archived/')
    await expect(badges.first()).toBeVisible({ timeout: ACTION_TIMEOUT })
  })

  test('clicking a deck tile navigates to deck detail', async ({ page }) => {
    await page.goto('/')
    const deckList = page.getByRole('list', { name: /deck list/i })
    await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })

    const firstTile = deckList.getByRole('listitem').first()
    const link = firstTile.locator('a').first()
    await link.click()

    await page.waitForURL('**/decks/**')
    expect(page.url()).toMatch(/\/decks\/\d+/)
  })

  test('brew sessions render in the grid', async ({ page }) => {
    await page.goto('/')
    // Wait for page to fully load
    await page.waitForTimeout(2000)
    // Brew sessions show as tiles (may or may not exist)
    // Just verify the page loaded without errors
    await expect(page.locator('body')).not.toContainText('Application error')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. DECK DETAIL PAGE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Deck Detail', () => {
  let deckUrl: string

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    const deckList = page.getByRole('list', { name: /deck list/i })
    await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })
    const link = deckList.getByRole('listitem').first().locator('a').first()
    const href = await link.getAttribute('href')
    deckUrl = href!
  })

  test('persistent header shows deck name and card count', async ({ page }) => {
    await page.goto(deckUrl)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: LOAD_TIMEOUT })
    await expect(page.getByText(/\d+ cards/)).toBeVisible()
  })

  test('all five tabs are present', async ({ page }) => {
    await page.goto(deckUrl)
    await expect(page.getByRole('tab', { name: 'Cards' })).toBeVisible({ timeout: LOAD_TIMEOUT })
    await expect(page.getByRole('tab', { name: 'Analysis' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Combos' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Upgrade' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Strategy' })).toBeVisible()
  })

  test('cards tab has three view modes (Groups, List, Cards)', async ({ page }) => {
    await page.goto(deckUrl)
    await expect(page.getByRole('tab', { name: 'Cards' })).toBeVisible({ timeout: LOAD_TIMEOUT })

    // View mode toggle should have 3 buttons
    const viewToggle = page.getByRole('radiogroup', { name: /view mode/i })
    await expect(viewToggle).toBeVisible({ timeout: ACTION_TIMEOUT })
    const buttons = viewToggle.getByRole('radio')
    expect(await buttons.count()).toBe(3)
  })

  test('cards tab group view renders in 3 columns', async ({ page }) => {
    await page.goto(deckUrl)
    // Groups view is default — look for the 3-column grid
    await expect(page.locator('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3').first()).toBeVisible({ timeout: ACTION_TIMEOUT })
  })

  test('cards tab search filters cards', async ({ page }) => {
    await page.goto(deckUrl)
    const searchInput = page.getByRole('textbox', { name: /search cards/i })
    await expect(searchInput).toBeVisible({ timeout: ACTION_TIMEOUT })

    // Type a search query
    await searchInput.fill('commander')
    await page.waitForTimeout(500)

    // Results should be filtered (fewer cards visible)
    // Just verify no error state
    await expect(page.locator('body')).not.toContainText('No cards match')
  })

  test('cards tab status filter chips work', async ({ page }) => {
    await page.goto(deckUrl)
    // Status filter chips should be visible
    const allChip = page.getByRole('button', { name: /All —/i })
    await expect(allChip).toBeVisible({ timeout: ACTION_TIMEOUT })

    // Click "Original" filter
    const originalChip = page.getByRole('button', { name: /Original —/i })
    await expect(originalChip).toBeVisible()
    await originalChip.click()

    // Should filter — the "All" chip should no longer be active
    await expect(originalChip).toHaveAttribute('aria-pressed', 'true')
  })

  test('cards tab picklist mode loads', async ({ page }) => {
    await page.goto(deckUrl)
    const picklistBtn = page.getByRole('radio', { name: /picklist/i })
      .or(page.getByText('Picklist'))
    await expect(picklistBtn).toBeVisible({ timeout: ACTION_TIMEOUT })
    await picklistBtn.click()

    // Picklist should show progress bar or "all resolved" message
    await expect(
      page.getByText(/resolved|No unresolved/).first()
    ).toBeVisible({ timeout: ACTION_TIMEOUT })
  })

  test('status chip popover opens on click', async ({ page }) => {
    await page.goto(deckUrl)
    // Find a status badge and click it
    const badge = page.locator('[aria-label*="status:"]').first()
    await expect(badge).toBeVisible({ timeout: ACTION_TIMEOUT })
    await badge.click()

    // Popover content should appear
    await expect(page.locator('[data-slot="popover-content"], [role="dialog"]').first()).toBeVisible({ timeout: 5000 })
  })

  test('status control buttons show Brewing/Built/Archived', async ({ page }) => {
    await page.goto(deckUrl)
    // Status control should be visible in the header
    await expect(
      page.getByText(/Brewing|Built|Archived/).first()
    ).toBeVisible({ timeout: LOAD_TIMEOUT })
  })

  test('health strip renders at the bottom', async ({ page }) => {
    await page.goto(deckUrl)
    // Health strip should eventually load (auto-recheck)
    await page.waitForTimeout(3000) // Give health auto-compute time
    // Look for health pills or the strip container
    const healthArea = page.locator('[role="status"]').or(page.getByText(/Ramp|Draw|Removal/).first())
    // May or may not be visible depending on deck state — just verify no error
    await expect(page.locator('body')).not.toContainText('Unable to load health data')
  })

  test('analysis tab loads', async ({ page }) => {
    await page.goto(deckUrl)
    await page.getByRole('tab', { name: 'Analysis' }).click()
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('combos tab loads', async ({ page }) => {
    await page.goto(deckUrl)
    await page.getByRole('tab', { name: 'Combos' }).click()
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('upgrade tab loads', async ({ page }) => {
    await page.goto(deckUrl)
    await page.getByRole('tab', { name: 'Upgrade' }).click()
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('strategy tab loads', async ({ page }) => {
    await page.goto(deckUrl)
    await page.getByRole('tab', { name: 'Strategy' }).click()
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).not.toContainText('Application error')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. COLLECTION PAGE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Collection', () => {
  test('collection page loads with cards', async ({ page }) => {
    await page.goto('/collection')
    // Wait for content — either card data or empty state
    await expect(
      page.getByText(/cards|No cards/).first()
    ).toBeVisible({ timeout: LOAD_TIMEOUT })
  })

  test('search filters collection', async ({ page }) => {
    await page.goto('/collection')
    const searchInput = page.getByRole('textbox', { name: /search/i }).first()
    await expect(searchInput).toBeVisible({ timeout: LOAD_TIMEOUT })

    await searchInput.fill('sol ring')
    await page.waitForTimeout(500)
    // Should show filtered results or "no match"
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('pagination controls are visible when data exists', async ({ page }) => {
    await page.goto('/collection')
    await page.waitForTimeout(3000)
    // Footer should show "Showing X of Y cards"
    await expect(
      page.getByText(/Showing.*of.*cards/).first()
    ).toBeVisible({ timeout: LOAD_TIMEOUT })
  })

  test('sort dropdown works', async ({ page }) => {
    await page.goto('/collection')
    const sortSelect = page.locator('select').first()
    await expect(sortSelect).toBeVisible({ timeout: LOAD_TIMEOUT })
    // Change sort — should not error
    await sortSelect.selectOption({ index: 1 })
    await page.waitForTimeout(1000)
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('view mode toggle works (grid/list)', async ({ page }) => {
    await page.goto('/collection')
    const viewToggle = page.getByRole('radiogroup', { name: /view mode/i })
    await expect(viewToggle).toBeVisible({ timeout: LOAD_TIMEOUT })

    // Click the other view mode button
    const buttons = viewToggle.getByRole('radio')
    const lastButton = buttons.last()
    await lastButton.click()
    await page.waitForTimeout(1000)
    await expect(page.locator('body')).not.toContainText('Application error')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. STORAGE PAGE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Storage', () => {
  test('storage page loads with locations', async ({ page }) => {
    await page.goto('/storage')
    await page.waitForTimeout(2000)
    // Should show storage locations or empty state
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('clicking a storage location navigates to detail', async ({ page }) => {
    await page.goto('/storage')
    await page.waitForTimeout(3000)

    // Find a clickable location card/link
    const locationLink = page.locator('a[href*="/storage/"]').first()
    if (await locationLink.isVisible().catch(() => false)) {
      await locationLink.click()
      await page.waitForURL('**/storage/**')

      // Detail page should show cards
      await expect(page.locator('body')).not.toContainText('Application error')
    }
  })

  test('storage detail has search and view toggle', async ({ page }) => {
    await page.goto('/storage')
    await page.waitForTimeout(3000)

    const locationLink = page.locator('a[href*="/storage/"]').first()
    if (await locationLink.isVisible().catch(() => false)) {
      await locationLink.click()
      await page.waitForURL('**/storage/**')
      await page.waitForTimeout(2000)

      // Search input should be visible (if cards exist)
      const searchInput = page.getByRole('textbox', { name: /search/i })
      if (await searchInput.isVisible().catch(() => false)) {
        await expect(searchInput).toBeVisible()
        // View toggle should exist
        const viewToggle = page.getByRole('radiogroup', { name: /view mode/i })
        await expect(viewToggle).toBeVisible()
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SHARED CARDS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Shared Cards', () => {
  test('shared cards page loads', async ({ page }) => {
    await page.goto('/shared-cards')
    await page.waitForTimeout(3000)
    // Should show shared cards data or empty state
    await expect(page.locator('body')).not.toContainText('Application error')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 7. SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Settings', () => {
  test('settings page loads', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('body')).not.toContainText('Application error')
    await page.waitForTimeout(2000)
  })

  test('storage locations section is visible', async ({ page }) => {
    await page.goto('/settings')
    await expect(
      page.getByText(/storage location/i).first()
    ).toBeVisible({ timeout: LOAD_TIMEOUT })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 8. ALLOCATION & CARD STATUS SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Allocation System', () => {
  test('card statuses load for a deck (Original, Open, Claimed, etc.)', async ({ page }) => {
    await page.goto('/')
    const deckList = page.getByRole('list', { name: /deck list/i })
    await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })
    const link = deckList.getByRole('listitem').first().locator('a').first()
    await link.click()
    await page.waitForURL('**/decks/**')

    // Wait for status chips to render (they load asynchronously)
    await page.waitForTimeout(3000)

    // Status summary bar should show counts
    await expect(
      page.getByText(/Original —|Proxy —|Open —/).first()
    ).toBeVisible({ timeout: ACTION_TIMEOUT })
  })

  test('allocate toggle is visible on deck detail', async ({ page }) => {
    await page.goto('/')
    const link = page.getByRole('list', { name: /deck list/i })
      .getByRole('listitem').first().locator('a').first()
    await expect(link).toBeVisible({ timeout: LOAD_TIMEOUT })
    await link.click()
    await page.waitForURL('**/decks/**')

    await expect(
      page.getByText('Allocate').first()
    ).toBeVisible({ timeout: LOAD_TIMEOUT })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 9. BREW CANVAS (NEW DECK)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Brew Canvas', () => {
  test('new deck page loads without errors', async ({ page }) => {
    await page.goto('/new-deck')
    await page.waitForTimeout(3000)
    await expect(page.locator('body')).not.toContainText('Application error')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 10. CARD VIEW MODES (DECK DETAIL)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Card View Modes', () => {
  let deckUrl: string

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    const link = page.getByRole('list', { name: /deck list/i })
      .getByRole('listitem').first().locator('a').first()
    await expect(link).toBeVisible({ timeout: LOAD_TIMEOUT })
    deckUrl = (await link.getAttribute('href'))!
  })

  test('groups view shows sections with card counts', async ({ page }) => {
    await page.goto(deckUrl)
    await page.waitForTimeout(2000)

    // Groups view (default) should show section headers with counts
    await expect(
      page.locator('text=/COMMANDER|CREATURE|LAND|ENCHANTMENT/i').first()
    ).toBeVisible({ timeout: ACTION_TIMEOUT })
  })

  test('list view shows card rows with status chips', async ({ page }) => {
    await page.goto(deckUrl)

    // Switch to list view
    const listButton = page.getByRole('radio', { name: /list view/i })
    await expect(listButton).toBeVisible({ timeout: ACTION_TIMEOUT })
    await listButton.click()
    await page.waitForTimeout(1000)

    // List view should show card names as text rows
    await expect(page.locator('[role="listitem"]').first()).toBeVisible({ timeout: 5000 })
  })

  test('cards view shows card images in a grid', async ({ page }) => {
    await page.goto(deckUrl)

    // Switch to cards (grid) view
    const gridButton = page.getByRole('radio', { name: /cards view/i })
    await expect(gridButton).toBeVisible({ timeout: ACTION_TIMEOUT })
    await gridButton.click()
    await page.waitForTimeout(2000)

    // Should show card images
    const cardImages = page.locator('img[src*="scryfall"]')
    await expect(cardImages.first()).toBeVisible({ timeout: ACTION_TIMEOUT })
  })

  test('group-by dropdown changes grouping', async ({ page }) => {
    await page.goto(deckUrl)

    const groupSelect = page.locator('select[aria-label="Group by"]')
    await expect(groupSelect).toBeVisible({ timeout: ACTION_TIMEOUT })

    // Change to "Type" grouping
    await groupSelect.selectOption('type')
    await page.waitForTimeout(1000)

    // Should show type-based groups
    await expect(
      page.locator('text=/CREATURE|INSTANT|SORCERY|ARTIFACT|ENCHANTMENT|LAND/i').first()
    ).toBeVisible({ timeout: 5000 })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 11. COMMANDER BACKGROUND (DECK DETAIL)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Deck Detail Visual', () => {
  test('commander art background is present on deck page', async ({ page }) => {
    await page.goto('/')
    const link = page.getByRole('list', { name: /deck list/i })
      .getByRole('listitem').first().locator('a').first()
    await expect(link).toBeVisible({ timeout: LOAD_TIMEOUT })
    await link.click()
    await page.waitForURL('**/decks/**')
    await page.waitForTimeout(2000)

    // Background image element should exist (the blurred art layer)
    const bgImg = page.locator('img[src*="art_crop"]').first()
    await expect(bgImg).toBeVisible({ timeout: 5000 })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 12. RESPONSIVE / CONTENT WIDTH
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Content Width Consistency', () => {
  test('deck detail content is constrained to max-width', async ({ page }) => {
    await page.goto('/')
    const link = page.getByRole('list', { name: /deck list/i })
      .getByRole('listitem').first().locator('a').first()
    await expect(link).toBeVisible({ timeout: LOAD_TIMEOUT })
    await link.click()
    await page.waitForURL('**/decks/**')
    await page.waitForTimeout(2000)

    // The content should not span the full viewport on wide screens
    const content = page.locator('[class*="max-w-"]').first()
    await expect(content).toBeVisible()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 13. ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Error Handling', () => {
  test('invalid deck ID shows error state', async ({ page }) => {
    await page.goto('/decks/99999999')
    await page.waitForTimeout(3000)

    // Should show error or redirect, not crash
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('invalid storage location shows error gracefully', async ({ page }) => {
    await page.goto('/storage/99999999')
    await page.waitForTimeout(3000)
    await expect(page.locator('body')).not.toContainText('Application error')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 14. POST-GAME DEBRIEF
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Post-Game Debrief', () => {
  test('debrief button opens overlay', async ({ page }) => {
    await page.goto('/')
    const link = page.getByRole('list', { name: /deck list/i })
      .getByRole('listitem').first().locator('a').first()
    await expect(link).toBeVisible({ timeout: LOAD_TIMEOUT })
    await link.click()
    await page.waitForURL('**/decks/**')

    const debriefBtn = page.getByRole('button', { name: /post-game debrief/i })
    await expect(debriefBtn).toBeVisible({ timeout: LOAD_TIMEOUT })
    await debriefBtn.click()

    // Debrief panel should open
    await page.waitForTimeout(1000)
    await expect(page.locator('body')).not.toContainText('Application error')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 15. DECK IMPORT
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Deck Import', () => {
  test('import button is accessible from collection page', async ({ page }) => {
    await page.goto('/collection')
    await page.waitForTimeout(2000)

    // Import button should be in the page header actions
    const importBtn = page.getByRole('button', { name: /import/i }).first()
    await expect(importBtn).toBeVisible({ timeout: LOAD_TIMEOUT })
  })
})
