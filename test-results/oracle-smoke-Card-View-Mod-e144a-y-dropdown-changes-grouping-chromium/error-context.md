# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: oracle-smoke.spec.ts >> Card View Modes >> group-by dropdown changes grouping
- Location: tests/e2e/oracle-smoke.spec.ts:503:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('list', { name: /deck list/i }).getByRole('listitem').first().locator('a').first()
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByRole('list', { name: /deck list/i }).getByRole('listitem').first().locator('a').first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - main [ref=e3]:
    - generic [ref=e6]:
      - generic [ref=e7]:
        - heading "The Oracle" [level=1] [ref=e8]
        - paragraph [ref=e9]: Sign in to access your collection and decks
      - generic [ref=e10]:
        - generic [ref=e11]:
          - text: Email
          - textbox "Email" [ref=e12]:
            - /placeholder: you@example.com
        - generic [ref=e13]:
          - text: Password
          - textbox "Password" [ref=e14]:
            - /placeholder: ••••••••
        - button "Sign in" [ref=e15]
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e21] [cursor=pointer]:
    - img [ref=e22]
  - alert [ref=e25]
```

# Test source

```ts
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
  399 |     ).toBeVisible({ timeout: LOAD_TIMEOUT })
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
> 462 |     await expect(link).toBeVisible({ timeout: LOAD_TIMEOUT })
      |                        ^ Error: expect(locator).toBeVisible() failed
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
  500 |     await expect(cardImages.first()).toBeVisible({ timeout: ACTION_TIMEOUT })
  501 |   })
  502 | 
  503 |   test('group-by dropdown changes grouping', async ({ page }) => {
  504 |     await page.goto(deckUrl)
  505 | 
  506 |     const groupSelect = page.locator('select[aria-label="Group by"]')
  507 |     await expect(groupSelect).toBeVisible({ timeout: ACTION_TIMEOUT })
  508 | 
  509 |     // Change to "Type" grouping
  510 |     await groupSelect.selectOption('type')
  511 |     await page.waitForTimeout(1000)
  512 | 
  513 |     // Should show type-based groups
  514 |     await expect(
  515 |       page.locator('text=/CREATURE|INSTANT|SORCERY|ARTIFACT|ENCHANTMENT|LAND/i').first()
  516 |     ).toBeVisible({ timeout: 5000 })
  517 |   })
  518 | })
  519 | 
  520 | // ═══════════════════════════════════════════════════════════════════════════════
  521 | // 11. COMMANDER BACKGROUND (DECK DETAIL)
  522 | // ═══════════════════════════════════════════════════════════════════════════════
  523 | 
  524 | test.describe('Deck Detail Visual', () => {
  525 |   test('commander art background is present on deck page', async ({ page }) => {
  526 |     await page.goto('/')
  527 |     const link = page.getByRole('list', { name: /deck list/i })
  528 |       .getByRole('listitem').first().locator('a').first()
  529 |     await expect(link).toBeVisible({ timeout: LOAD_TIMEOUT })
  530 |     await link.click()
  531 |     await page.waitForURL('**/decks/**')
  532 |     await page.waitForTimeout(2000)
  533 | 
  534 |     // Background image element should exist (the blurred art layer)
  535 |     const bgImg = page.locator('img[src*="art_crop"]').first()
  536 |     await expect(bgImg).toBeVisible({ timeout: 5000 })
  537 |   })
  538 | })
  539 | 
  540 | // ═══════════════════════════════════════════════════════════════════════════════
  541 | // 12. RESPONSIVE / CONTENT WIDTH
  542 | // ═══════════════════════════════════════════════════════════════════════════════
  543 | 
  544 | test.describe('Content Width Consistency', () => {
  545 |   test('deck detail content is constrained to max-width', async ({ page }) => {
  546 |     await page.goto('/')
  547 |     const link = page.getByRole('list', { name: /deck list/i })
  548 |       .getByRole('listitem').first().locator('a').first()
  549 |     await expect(link).toBeVisible({ timeout: LOAD_TIMEOUT })
  550 |     await link.click()
  551 |     await page.waitForURL('**/decks/**')
  552 |     await page.waitForTimeout(2000)
  553 | 
  554 |     // The content should not span the full viewport on wide screens
  555 |     const content = page.locator('[class*="max-w-"]').first()
  556 |     await expect(content).toBeVisible()
  557 |   })
  558 | })
  559 | 
  560 | // ═══════════════════════════════════════════════════════════════════════════════
  561 | // 13. ERROR HANDLING
  562 | // ═══════════════════════════════════════════════════════════════════════════════
```