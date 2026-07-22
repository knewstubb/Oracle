# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: oracle-smoke.spec.ts >> Settings >> storage locations section is visible
- Location: tests/e2e/oracle-smoke.spec.ts:395:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/storage location/i).first()
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByText(/storage location/i).first()

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
    - generic [ref=e45]:
      - heading "Settings" [level=1] [ref=e48]
      - generic [ref=e50]:
        - heading "Developer Tools" [level=2] [ref=e51]
        - paragraph [ref=e52]: These actions are destructive and cannot be undone.
        - generic [ref=e53]:
          - button "Clear All Data" [ref=e54]:
            - img
            - text: Clear All Data
          - paragraph [ref=e55]: Deletes all decks, cards, physical copies, and brew sessions for your account. Use this to start a fresh onboarding test.
        - generic [ref=e56]:
          - link "Component Library" [ref=e57] [cursor=pointer]:
            - /url: /settings/components
            - img [ref=e58]
            - text: Component Library
          - paragraph [ref=e64]: Browse all UI components, design tokens, colors, and typography.
  - region "Notifications alt+T"
  - alert [ref=e65]
```

# Test source

```ts
  299 |     await page.goto('/collection')
  300 |     const sortSelect = page.locator('select').first()
  301 |     await expect(sortSelect).toBeVisible({ timeout: LOAD_TIMEOUT })
  302 |     // Change sort — should not error
  303 |     await sortSelect.selectOption({ index: 1 })
  304 |     await page.waitForTimeout(1000)
  305 |     await expect(page.locator('body')).not.toContainText('Application error')
  306 |   })
  307 | 
  308 |   test('view mode toggle works (grid/list)', async ({ page }) => {
  309 |     await page.goto('/collection')
  310 |     const viewToggle = page.getByRole('radiogroup', { name: /view mode/i })
  311 |     await expect(viewToggle).toBeVisible({ timeout: LOAD_TIMEOUT })
  312 | 
  313 |     // Click the other view mode button
  314 |     const buttons = viewToggle.getByRole('radio')
  315 |     const lastButton = buttons.last()
  316 |     await lastButton.click()
  317 |     await page.waitForTimeout(1000)
  318 |     await expect(page.locator('body')).not.toContainText('Application error')
  319 |   })
  320 | })
  321 | 
  322 | // ═══════════════════════════════════════════════════════════════════════════════
  323 | // 5. STORAGE PAGE
  324 | // ═══════════════════════════════════════════════════════════════════════════════
  325 | 
  326 | test.describe('Storage', () => {
  327 |   test('storage page loads with locations', async ({ page }) => {
  328 |     await page.goto('/storage')
  329 |     await page.waitForTimeout(2000)
  330 |     // Should show storage locations or empty state
  331 |     await expect(page.locator('body')).not.toContainText('Application error')
  332 |   })
  333 | 
  334 |   test('clicking a storage location navigates to detail', async ({ page }) => {
  335 |     await page.goto('/storage')
  336 |     await page.waitForTimeout(3000)
  337 | 
  338 |     // Find a clickable location card/link
  339 |     const locationLink = page.locator('a[href*="/storage/"]').first()
  340 |     if (await locationLink.isVisible().catch(() => false)) {
  341 |       await locationLink.click()
  342 |       await page.waitForURL('**/storage/**')
  343 | 
  344 |       // Detail page should show cards
  345 |       await expect(page.locator('body')).not.toContainText('Application error')
  346 |     }
  347 |   })
  348 | 
  349 |   test('storage detail has search and view toggle', async ({ page }) => {
  350 |     await page.goto('/storage')
  351 |     await page.waitForTimeout(3000)
  352 | 
  353 |     const locationLink = page.locator('a[href*="/storage/"]').first()
  354 |     if (await locationLink.isVisible().catch(() => false)) {
  355 |       await locationLink.click()
  356 |       await page.waitForURL('**/storage/**')
  357 |       await page.waitForTimeout(2000)
  358 | 
  359 |       // Search input should be visible (if cards exist)
  360 |       const searchInput = page.getByRole('textbox', { name: /search/i })
  361 |       if (await searchInput.isVisible().catch(() => false)) {
  362 |         await expect(searchInput).toBeVisible()
  363 |         // View toggle should exist
  364 |         const viewToggle = page.getByRole('radiogroup', { name: /view mode/i })
  365 |         await expect(viewToggle).toBeVisible()
  366 |       }
  367 |     }
  368 |   })
  369 | })
  370 | 
  371 | // ═══════════════════════════════════════════════════════════════════════════════
  372 | // 6. SHARED CARDS PAGE
  373 | // ═══════════════════════════════════════════════════════════════════════════════
  374 | 
  375 | test.describe('Shared Cards', () => {
  376 |   test('shared cards page loads', async ({ page }) => {
  377 |     await page.goto('/shared-cards')
  378 |     await page.waitForTimeout(3000)
  379 |     // Should show shared cards data or empty state
  380 |     await expect(page.locator('body')).not.toContainText('Application error')
  381 |   })
  382 | })
  383 | 
  384 | // ═══════════════════════════════════════════════════════════════════════════════
  385 | // 7. SETTINGS PAGE
  386 | // ═══════════════════════════════════════════════════════════════════════════════
  387 | 
  388 | test.describe('Settings', () => {
  389 |   test('settings page loads', async ({ page }) => {
  390 |     await page.goto('/settings')
  391 |     await expect(page.locator('body')).not.toContainText('Application error')
  392 |     await page.waitForTimeout(2000)
  393 |   })
  394 | 
  395 |   test('storage locations section is visible', async ({ page }) => {
  396 |     await page.goto('/settings')
  397 |     await expect(
  398 |       page.getByText(/storage location/i).first()
> 399 |     ).toBeVisible({ timeout: LOAD_TIMEOUT })
      |       ^ Error: expect(locator).toBeVisible() failed
  400 |   })
  401 | })
  402 | 
  403 | // ═══════════════════════════════════════════════════════════════════════════════
  404 | // 8. ALLOCATION & CARD STATUS SYSTEM
  405 | // ═══════════════════════════════════════════════════════════════════════════════
  406 | 
  407 | test.describe('Allocation System', () => {
  408 |   test('card statuses load for a deck (Original, Open, Claimed, etc.)', async ({ page }) => {
  409 |     await page.goto('/')
  410 |     const deckList = page.getByRole('list', { name: /deck list/i })
  411 |     await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })
  412 |     const link = deckList.getByRole('listitem').first().locator('a').first()
  413 |     await link.click()
  414 |     await page.waitForURL('**/decks/**')
  415 | 
  416 |     // Wait for status chips to render (they load asynchronously)
  417 |     await page.waitForTimeout(3000)
  418 | 
  419 |     // Status summary bar should show counts
  420 |     await expect(
  421 |       page.getByText(/Original —|Proxy —|Open —/).first()
  422 |     ).toBeVisible({ timeout: ACTION_TIMEOUT })
  423 |   })
  424 | 
  425 |   test('allocate toggle is visible on deck detail', async ({ page }) => {
  426 |     await page.goto('/')
  427 |     const link = page.getByRole('list', { name: /deck list/i })
  428 |       .getByRole('listitem').first().locator('a').first()
  429 |     await expect(link).toBeVisible({ timeout: LOAD_TIMEOUT })
  430 |     await link.click()
  431 |     await page.waitForURL('**/decks/**')
  432 | 
  433 |     await expect(
  434 |       page.getByText('Allocate').first()
  435 |     ).toBeVisible({ timeout: LOAD_TIMEOUT })
  436 |   })
  437 | })
  438 | 
  439 | // ═══════════════════════════════════════════════════════════════════════════════
  440 | // 9. BREW CANVAS (NEW DECK)
  441 | // ═══════════════════════════════════════════════════════════════════════════════
  442 | 
  443 | test.describe('Brew Canvas', () => {
  444 |   test('new deck page loads without errors', async ({ page }) => {
  445 |     await page.goto('/new-deck')
  446 |     await page.waitForTimeout(3000)
  447 |     await expect(page.locator('body')).not.toContainText('Application error')
  448 |   })
  449 | })
  450 | 
  451 | // ═══════════════════════════════════════════════════════════════════════════════
  452 | // 10. CARD VIEW MODES (DECK DETAIL)
  453 | // ═══════════════════════════════════════════════════════════════════════════════
  454 | 
  455 | test.describe('Card View Modes', () => {
  456 |   let deckUrl: string
  457 | 
  458 |   test.beforeEach(async ({ page }) => {
  459 |     await page.goto('/')
  460 |     const link = page.getByRole('list', { name: /deck list/i })
  461 |       .getByRole('listitem').first().locator('a').first()
  462 |     await expect(link).toBeVisible({ timeout: LOAD_TIMEOUT })
  463 |     deckUrl = (await link.getAttribute('href'))!
  464 |   })
  465 | 
  466 |   test('groups view shows sections with card counts', async ({ page }) => {
  467 |     await page.goto(deckUrl)
  468 |     await page.waitForTimeout(2000)
  469 | 
  470 |     // Groups view (default) should show section headers with counts
  471 |     await expect(
  472 |       page.locator('text=/COMMANDER|CREATURE|LAND|ENCHANTMENT/i').first()
  473 |     ).toBeVisible({ timeout: ACTION_TIMEOUT })
  474 |   })
  475 | 
  476 |   test('list view shows card rows with status chips', async ({ page }) => {
  477 |     await page.goto(deckUrl)
  478 | 
  479 |     // Switch to list view
  480 |     const listButton = page.getByRole('radio', { name: /list view/i })
  481 |     await expect(listButton).toBeVisible({ timeout: ACTION_TIMEOUT })
  482 |     await listButton.click()
  483 |     await page.waitForTimeout(1000)
  484 | 
  485 |     // List view should show card names as text rows
  486 |     await expect(page.locator('[role="listitem"]').first()).toBeVisible({ timeout: 5000 })
  487 |   })
  488 | 
  489 |   test('cards view shows card images in a grid', async ({ page }) => {
  490 |     await page.goto(deckUrl)
  491 | 
  492 |     // Switch to cards (grid) view
  493 |     const gridButton = page.getByRole('radio', { name: /cards view/i })
  494 |     await expect(gridButton).toBeVisible({ timeout: ACTION_TIMEOUT })
  495 |     await gridButton.click()
  496 |     await page.waitForTimeout(2000)
  497 | 
  498 |     // Should show card images
  499 |     const cardImages = page.locator('img[src*="scryfall"]')
```