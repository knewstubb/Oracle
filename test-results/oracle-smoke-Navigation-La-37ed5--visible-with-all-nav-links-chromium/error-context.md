# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: oracle-smoke.spec.ts >> Navigation & Layout >> sidebar is visible with all nav links
- Location: tests/e2e/oracle-smoke.spec.ts:29:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Decks')
Expected: visible
Error: strict mode violation: getByText('Decks') resolved to 2 elements:
    1) <span class="truncate">Decks</span> aka getByRole('link', { name: 'Decks' })
    2) <h1 class="text-[length:var(--fs-3xl)] font-[number:var(--font-medium)] tracking-tight text-[var(--text-primary)]">Decks</h1> aka getByRole('heading', { name: 'Decks' })

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Decks')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - complementary [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]: The Oracle
      - button "Collapse sidebar" [ref=e6]:
        - img
    - navigation "Main navigation" [ref=e7]:
      - link "Decks" [ref=e8] [cursor=pointer]:
        - /url: /
        - generic [ref=e9]:
          - generic [ref=e10]: grid_view
          - generic [ref=e11]: Decks
      - link "Card Management" [ref=e12] [cursor=pointer]:
        - /url: /allocation
        - generic [ref=e13]:
          - generic [ref=e14]: modeling
          - generic [ref=e15]: Card Management
      - link "Collection" [ref=e16] [cursor=pointer]:
        - /url: /collection
        - generic [ref=e17]:
          - generic [ref=e18]: newsstand
          - generic [ref=e19]: Collection
      - link "Binders" [ref=e20] [cursor=pointer]:
        - /url: /storage
        - generic [ref=e21]:
          - generic [ref=e22]: shelves
          - generic [ref=e23]: Binders
      - link "Scan" [ref=e24] [cursor=pointer]:
        - /url: /scan
        - generic [ref=e25]:
          - generic [ref=e26]: photo_camera
          - generic [ref=e27]: Scan
      - link "Brew Deck" [ref=e28] [cursor=pointer]:
        - /url: /new-deck
        - generic [ref=e29]:
          - generic [ref=e30]: science
          - generic [ref=e31]: Brew Deck
      - link "Settings" [ref=e32] [cursor=pointer]:
        - /url: /settings
        - generic [ref=e33]:
          - generic [ref=e34]: settings
          - generic [ref=e35]: Settings
    - button "Log out" [ref=e38]:
      - img [ref=e39]
      - generic [ref=e42]: Log out
  - main [ref=e43]:
    - generic [ref=e46]:
      - generic [ref=e47]:
        - heading "Decks" [level=1] [ref=e49]
        - generic [ref=e50]:
          - button "Import Deck" [ref=e51]:
            - img
            - text: Import Deck
          - button "New Deck" [ref=e52]:
            - img
            - text: New Deck
      - generic [ref=e53]:
        - group "Filter decks by status" [ref=e54]:
          - button "Brewing" [ref=e55]
          - button "In Rotation" [ref=e56]
          - button "Graveyard" [ref=e57]
        - list "Loading decks" [ref=e58]:
          - listitem [ref=e59]
          - listitem [ref=e66]
          - listitem [ref=e73]
          - listitem [ref=e80]
          - listitem [ref=e87]
          - listitem [ref=e94]
          - listitem [ref=e101]
          - listitem [ref=e108]
  - region "Notifications alt+T"
  - alert [ref=e115]
```

# Test source

```ts
  1   | /**
  2   |  * The Oracle — Comprehensive E2E Test Suite
  3   |  *
  4   |  * Covers all user-facing functionality across the application.
  5   |  * Tests run against a live dev server with real Supabase data.
  6   |  *
  7   |  * Prerequisites:
  8   |  *   1. Start the dev server:  npm run dev
  9   |  *   2. Install browsers:      npx playwright install chromium
  10  |  *   3. Ensure you're logged in (auth session active)
  11  |  *   4. At least one deck imported and one storage location configured
  12  |  *
  13  |  * Run:
  14  |  *   npx playwright test
  15  |  *   npx playwright test --headed    (watch it run)
  16  |  *   npx playwright test --ui        (interactive UI mode)
  17  |  */
  18  | 
  19  | import { test, expect, type Page } from '@playwright/test'
  20  | 
  21  | const LOAD_TIMEOUT = 30_000
  22  | const ACTION_TIMEOUT = 15_000
  23  | 
  24  | // ═══════════════════════════════════════════════════════════════════════════════
  25  | // 1. NAVIGATION & LAYOUT
  26  | // ═══════════════════════════════════════════════════════════════════════════════
  27  | 
  28  | test.describe('Navigation & Layout', () => {
  29  |   test('sidebar is visible with all nav links', async ({ page }) => {
  30  |     await page.goto('/')
  31  |     const sidebar = page.locator('nav, aside, [data-slot="sidebar"]').first()
  32  |     await expect(sidebar).toBeVisible({ timeout: LOAD_TIMEOUT })
  33  | 
  34  |     // Check key nav items exist
> 35  |     await expect(page.getByText('Decks')).toBeVisible()
      |                                           ^ Error: expect(locator).toBeVisible() failed
  36  |     await expect(page.getByText('Collection')).toBeVisible()
  37  |     await expect(page.getByText('Storage')).toBeVisible()
  38  |   })
  39  | 
  40  |   test('can navigate to all main pages', async ({ page }) => {
  41  |     await page.goto('/')
  42  |     await expect(page).toHaveURL(/\/$/)
  43  | 
  44  |     // Navigate to Collection
  45  |     await page.getByText('Collection').click()
  46  |     await page.waitForURL('**/collection')
  47  |     await expect(page).toHaveURL(/\/collection/)
  48  | 
  49  |     // Navigate to Storage
  50  |     await page.getByText('Storage').click()
  51  |     await page.waitForURL('**/storage')
  52  |     await expect(page).toHaveURL(/\/storage/)
  53  | 
  54  |     // Navigate to Settings
  55  |     await page.getByText('Settings').click()
  56  |     await page.waitForURL('**/settings')
  57  |     await expect(page).toHaveURL(/\/settings/)
  58  | 
  59  |     // Navigate back to Decks
  60  |     await page.getByText('Decks').click()
  61  |     await page.waitForURL(/^\/$|\/decks/)
  62  |   })
  63  | })
  64  | 
  65  | // ═══════════════════════════════════════════════════════════════════════════════
  66  | // 2. DECKS GRID (HOME PAGE)
  67  | // ═══════════════════════════════════════════════════════════════════════════════
  68  | 
  69  | test.describe('Decks Grid', () => {
  70  |   test('deck tiles render with commander art', async ({ page }) => {
  71  |     await page.goto('/')
  72  |     const deckList = page.getByRole('list', { name: /deck list/i })
  73  |     await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })
  74  | 
  75  |     const tiles = deckList.getByRole('listitem')
  76  |     const count = await tiles.count()
  77  |     expect(count).toBeGreaterThan(0)
  78  | 
  79  |     // Each tile should have an image (commander art)
  80  |     const firstTile = tiles.first()
  81  |     await expect(firstTile.locator('img').first()).toBeVisible()
  82  |   })
  83  | 
  84  |   test('deck tiles show status badges (Brewing/Built/Archived)', async ({ page }) => {
  85  |     await page.goto('/')
  86  |     const deckList = page.getByRole('list', { name: /deck list/i })
  87  |     await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })
  88  | 
  89  |     // At least one badge should be visible
  90  |     const badges = page.locator('text=/Brewing|Built|Archived/')
  91  |     await expect(badges.first()).toBeVisible({ timeout: ACTION_TIMEOUT })
  92  |   })
  93  | 
  94  |   test('clicking a deck tile navigates to deck detail', async ({ page }) => {
  95  |     await page.goto('/')
  96  |     const deckList = page.getByRole('list', { name: /deck list/i })
  97  |     await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })
  98  | 
  99  |     const firstTile = deckList.getByRole('listitem').first()
  100 |     const link = firstTile.locator('a').first()
  101 |     await link.click()
  102 | 
  103 |     await page.waitForURL('**/decks/**')
  104 |     expect(page.url()).toMatch(/\/decks\/\d+/)
  105 |   })
  106 | 
  107 |   test('brew sessions render in the grid', async ({ page }) => {
  108 |     await page.goto('/')
  109 |     // Wait for page to fully load
  110 |     await page.waitForTimeout(2000)
  111 |     // Brew sessions show as tiles (may or may not exist)
  112 |     // Just verify the page loaded without errors
  113 |     await expect(page.locator('body')).not.toContainText('Application error')
  114 |   })
  115 | })
  116 | 
  117 | // ═══════════════════════════════════════════════════════════════════════════════
  118 | // 3. DECK DETAIL PAGE
  119 | // ═══════════════════════════════════════════════════════════════════════════════
  120 | 
  121 | test.describe('Deck Detail', () => {
  122 |   let deckUrl: string
  123 | 
  124 |   test.beforeEach(async ({ page }) => {
  125 |     await page.goto('/')
  126 |     const deckList = page.getByRole('list', { name: /deck list/i })
  127 |     await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })
  128 |     const link = deckList.getByRole('listitem').first().locator('a').first()
  129 |     const href = await link.getAttribute('href')
  130 |     deckUrl = href!
  131 |   })
  132 | 
  133 |   test('persistent header shows deck name and card count', async ({ page }) => {
  134 |     await page.goto(deckUrl)
  135 |     await expect(page.locator('h1').first()).toBeVisible({ timeout: LOAD_TIMEOUT })
```