# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: oracle-smoke.spec.ts >> Deck Import >> import button is accessible from collection page
- Location: tests/e2e/oracle-smoke.spec.ts:608:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /import/i }).first()
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByRole('button', { name: /import/i }).first()

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
  563 | 
  564 | test.describe('Error Handling', () => {
  565 |   test('invalid deck ID shows error state', async ({ page }) => {
  566 |     await page.goto('/decks/99999999')
  567 |     await page.waitForTimeout(3000)
  568 | 
  569 |     // Should show error or redirect, not crash
  570 |     await expect(page.locator('body')).not.toContainText('Application error')
  571 |   })
  572 | 
  573 |   test('invalid storage location shows error gracefully', async ({ page }) => {
  574 |     await page.goto('/storage/99999999')
  575 |     await page.waitForTimeout(3000)
  576 |     await expect(page.locator('body')).not.toContainText('Application error')
  577 |   })
  578 | })
  579 | 
  580 | // ═══════════════════════════════════════════════════════════════════════════════
  581 | // 14. POST-GAME DEBRIEF
  582 | // ═══════════════════════════════════════════════════════════════════════════════
  583 | 
  584 | test.describe('Post-Game Debrief', () => {
  585 |   test('debrief button opens overlay', async ({ page }) => {
  586 |     await page.goto('/')
  587 |     const link = page.getByRole('list', { name: /deck list/i })
  588 |       .getByRole('listitem').first().locator('a').first()
  589 |     await expect(link).toBeVisible({ timeout: LOAD_TIMEOUT })
  590 |     await link.click()
  591 |     await page.waitForURL('**/decks/**')
  592 | 
  593 |     const debriefBtn = page.getByRole('button', { name: /post-game debrief/i })
  594 |     await expect(debriefBtn).toBeVisible({ timeout: LOAD_TIMEOUT })
  595 |     await debriefBtn.click()
  596 | 
  597 |     // Debrief panel should open
  598 |     await page.waitForTimeout(1000)
  599 |     await expect(page.locator('body')).not.toContainText('Application error')
  600 |   })
  601 | })
  602 | 
  603 | // ═══════════════════════════════════════════════════════════════════════════════
  604 | // 15. DECK IMPORT
  605 | // ═══════════════════════════════════════════════════════════════════════════════
  606 | 
  607 | test.describe('Deck Import', () => {
  608 |   test('import button is accessible from collection page', async ({ page }) => {
  609 |     await page.goto('/collection')
  610 |     await page.waitForTimeout(2000)
  611 | 
  612 |     // Import button should be in the page header actions
  613 |     const importBtn = page.getByRole('button', { name: /import/i }).first()
> 614 |     await expect(importBtn).toBeVisible({ timeout: LOAD_TIMEOUT })
      |                             ^ Error: expect(locator).toBeVisible() failed
  615 |   })
  616 | })
  617 | 
```