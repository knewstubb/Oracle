# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: oracle-smoke.spec.ts >> Deck Detail >> cards tab picklist mode loads
- Location: tests/e2e/oracle-smoke.spec.ts:194:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/resolved|No unresolved/).first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByText(/resolved|No unresolved/).first()

```

# Page snapshot

```yaml
- generic [ref=e1]:
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
      - generic [ref=e48]:
        - generic [ref=e49]:
          - img "Wilhelt, the Rotcleaver avatar" [ref=e52]
          - generic [ref=e53]:
            - heading "A Rot to Process" [level=1] [ref=e55]
            - paragraph [ref=e56]: 100 cards · 0 proxies · $538.71
        - generic [ref=e57]:
          - button "Post-game debrief" [ref=e58]:
            - img
            - text: Post-game debrief
          - button "Copy decklist to clipboard" [ref=e59]:
            - img
            - generic [ref=e60]: Export
          - generic [ref=e61]:
            - switch "Allocate cards against collection" [checked] [ref=e62]
            - checkbox [checked] [ref=e63]
            - generic [ref=e64]: Allocate
          - radiogroup "Deck status" [ref=e65]:
            - radio "Set status to Brewing" [ref=e66]: Brewing
            - radio "Set status to In Rotation" [checked] [ref=e67]: In Rotation
            - radio "Set status to Graveyard" [ref=e68]: Graveyard
          - button "Delete deck" [ref=e69]:
            - img
            - generic [ref=e70]: Delete deck
      - generic [ref=e71]:
        - tablist [ref=e74]:
          - tab "Cards" [ref=e75]
          - tab "Analysis" [ref=e76]
          - tab "Combos" [ref=e77]
          - tab "Upgrade" [ref=e78]
          - tab "Strategy" [ref=e79]
          - tab "Goldfish" [ref=e80]
          - tab "Picklist" [active] [selected] [ref=e81]
        - tabpanel "Picklist" [ref=e82]:
          - generic [ref=e83]:
            - generic [ref=e85]:
              - generic [ref=e86]: 100/100 Cards filled
              - generic [ref=e87]:
                - generic [ref=e88]: 100 Original
                - generic [ref=e90]: 0 Proxy
                - generic [ref=e92]: 0 In storage
                - generic [ref=e94]: 0 In decks
                - generic [ref=e96]: 0 Unowned
            - generic [ref=e101]:
              - img
              - searchbox "Search picklist cards" [ref=e102]
            - generic [ref=e103]:
              - heading "In storage" [level=2] [ref=e104]
              - heading "In decks" [level=2] [ref=e105]
              - heading "Unowned" [level=2] [ref=e106]
            - generic [ref=e107]:
              - generic [ref=e110]: No cards in storage
              - generic [ref=e113]: No cards in decks
              - generic [ref=e116]: Nothing unowned
      - generic [ref=e118]:
        - button "ok Ramp 10" [ref=e119] [cursor=pointer]:
          - img [ref=e120]
          - generic [ref=e122]: Ramp
          - generic [ref=e123]: "10"
        - button "crit Draw 7" [ref=e124] [cursor=pointer]:
          - img [ref=e125]
          - generic [ref=e127]: Draw
          - generic [ref=e128]: "7"
        - button "ok Removal 8" [ref=e129] [cursor=pointer]:
          - img [ref=e130]
          - generic [ref=e132]: Removal
          - generic [ref=e133]: "8"
        - button "crit Interaction 0" [ref=e134] [cursor=pointer]:
          - img [ref=e135]
          - generic [ref=e137]: Interaction
          - generic [ref=e138]: "0"
        - button "crit Finisher 0" [ref=e139] [cursor=pointer]:
          - img [ref=e140]
          - generic [ref=e142]: Finisher
          - generic [ref=e143]: "0"
        - button "crit Board Wipe 0" [ref=e144] [cursor=pointer]:
          - img [ref=e145]
          - generic [ref=e147]: Board Wipe
          - generic [ref=e148]: "0"
        - button "ok Recursion 4" [ref=e149] [cursor=pointer]:
          - img [ref=e150]
          - generic [ref=e152]: Recursion
          - generic [ref=e153]: "4"
        - button "crit Tutor 0" [ref=e154] [cursor=pointer]:
          - img [ref=e155]
          - generic [ref=e157]: Tutor
          - generic [ref=e158]: "0"
        - button "warn Protection 5" [ref=e159] [cursor=pointer]:
          - img [ref=e160]
          - generic [ref=e162]: Protection
          - generic [ref=e163]: "5"
        - generic [ref=e164]:
          - img [ref=e165]
          - text: Finisher is low (0 cards, target 4–6). Consider adding 4–6 more finisher effects.
  - region "Notifications alt+T"
  - alert [ref=e167]
```

# Test source

```ts
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
  136 |     await expect(page.getByText(/\d+ cards/)).toBeVisible()
  137 |   })
  138 | 
  139 |   test('all five tabs are present', async ({ page }) => {
  140 |     await page.goto(deckUrl)
  141 |     await expect(page.getByRole('tab', { name: 'Cards' })).toBeVisible({ timeout: LOAD_TIMEOUT })
  142 |     await expect(page.getByRole('tab', { name: 'Analysis' })).toBeVisible()
  143 |     await expect(page.getByRole('tab', { name: 'Combos' })).toBeVisible()
  144 |     await expect(page.getByRole('tab', { name: 'Upgrade' })).toBeVisible()
  145 |     await expect(page.getByRole('tab', { name: 'Strategy' })).toBeVisible()
  146 |   })
  147 | 
  148 |   test('cards tab has three view modes (Groups, List, Cards)', async ({ page }) => {
  149 |     await page.goto(deckUrl)
  150 |     await expect(page.getByRole('tab', { name: 'Cards' })).toBeVisible({ timeout: LOAD_TIMEOUT })
  151 | 
  152 |     // View mode toggle should have 3 buttons
  153 |     const viewToggle = page.getByRole('radiogroup', { name: /view mode/i })
  154 |     await expect(viewToggle).toBeVisible({ timeout: ACTION_TIMEOUT })
  155 |     const buttons = viewToggle.getByRole('radio')
  156 |     expect(await buttons.count()).toBe(3)
  157 |   })
  158 | 
  159 |   test('cards tab group view renders in 3 columns', async ({ page }) => {
  160 |     await page.goto(deckUrl)
  161 |     // Groups view is default — look for the 3-column grid
  162 |     await expect(page.locator('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3').first()).toBeVisible({ timeout: ACTION_TIMEOUT })
  163 |   })
  164 | 
  165 |   test('cards tab search filters cards', async ({ page }) => {
  166 |     await page.goto(deckUrl)
  167 |     const searchInput = page.getByRole('textbox', { name: /search cards/i })
  168 |     await expect(searchInput).toBeVisible({ timeout: ACTION_TIMEOUT })
  169 | 
  170 |     // Type a search query
  171 |     await searchInput.fill('commander')
  172 |     await page.waitForTimeout(500)
  173 | 
  174 |     // Results should be filtered (fewer cards visible)
  175 |     // Just verify no error state
  176 |     await expect(page.locator('body')).not.toContainText('No cards match')
  177 |   })
  178 | 
  179 |   test('cards tab status filter chips work', async ({ page }) => {
  180 |     await page.goto(deckUrl)
  181 |     // Status filter chips should be visible
  182 |     const allChip = page.getByRole('button', { name: /All —/i })
  183 |     await expect(allChip).toBeVisible({ timeout: ACTION_TIMEOUT })
  184 | 
  185 |     // Click "Original" filter
  186 |     const originalChip = page.getByRole('button', { name: /Original —/i })
  187 |     await expect(originalChip).toBeVisible()
  188 |     await originalChip.click()
  189 | 
  190 |     // Should filter — the "All" chip should no longer be active
  191 |     await expect(originalChip).toHaveAttribute('aria-pressed', 'true')
  192 |   })
  193 | 
  194 |   test('cards tab picklist mode loads', async ({ page }) => {
  195 |     await page.goto(deckUrl)
  196 |     const picklistBtn = page.getByRole('radio', { name: /picklist/i })
  197 |       .or(page.getByText('Picklist'))
  198 |     await expect(picklistBtn).toBeVisible({ timeout: ACTION_TIMEOUT })
  199 |     await picklistBtn.click()
  200 | 
  201 |     // Picklist should show progress bar or "all resolved" message
  202 |     await expect(
  203 |       page.getByText(/resolved|No unresolved/).first()
> 204 |     ).toBeVisible({ timeout: ACTION_TIMEOUT })
      |       ^ Error: expect(locator).toBeVisible() failed
  205 |   })
  206 | 
  207 |   test('status chip popover opens on click', async ({ page }) => {
  208 |     await page.goto(deckUrl)
  209 |     // Find a status badge and click it
  210 |     const badge = page.locator('[aria-label*="status:"]').first()
  211 |     await expect(badge).toBeVisible({ timeout: ACTION_TIMEOUT })
  212 |     await badge.click()
  213 | 
  214 |     // Popover content should appear
  215 |     await expect(page.locator('[data-slot="popover-content"], [role="dialog"]').first()).toBeVisible({ timeout: 5000 })
  216 |   })
  217 | 
  218 |   test('status control buttons show Brewing/Built/Archived', async ({ page }) => {
  219 |     await page.goto(deckUrl)
  220 |     // Status control should be visible in the header
  221 |     await expect(
  222 |       page.getByText(/Brewing|Built|Archived/).first()
  223 |     ).toBeVisible({ timeout: LOAD_TIMEOUT })
  224 |   })
  225 | 
  226 |   test('health strip renders at the bottom', async ({ page }) => {
  227 |     await page.goto(deckUrl)
  228 |     // Health strip should eventually load (auto-recheck)
  229 |     await page.waitForTimeout(3000) // Give health auto-compute time
  230 |     // Look for health pills or the strip container
  231 |     const healthArea = page.locator('[role="status"]').or(page.getByText(/Ramp|Draw|Removal/).first())
  232 |     // May or may not be visible depending on deck state — just verify no error
  233 |     await expect(page.locator('body')).not.toContainText('Unable to load health data')
  234 |   })
  235 | 
  236 |   test('analysis tab loads', async ({ page }) => {
  237 |     await page.goto(deckUrl)
  238 |     await page.getByRole('tab', { name: 'Analysis' }).click()
  239 |     await page.waitForTimeout(2000)
  240 |     await expect(page.locator('body')).not.toContainText('Application error')
  241 |   })
  242 | 
  243 |   test('combos tab loads', async ({ page }) => {
  244 |     await page.goto(deckUrl)
  245 |     await page.getByRole('tab', { name: 'Combos' }).click()
  246 |     await page.waitForTimeout(2000)
  247 |     await expect(page.locator('body')).not.toContainText('Application error')
  248 |   })
  249 | 
  250 |   test('upgrade tab loads', async ({ page }) => {
  251 |     await page.goto(deckUrl)
  252 |     await page.getByRole('tab', { name: 'Upgrade' }).click()
  253 |     await page.waitForTimeout(2000)
  254 |     await expect(page.locator('body')).not.toContainText('Application error')
  255 |   })
  256 | 
  257 |   test('strategy tab loads', async ({ page }) => {
  258 |     await page.goto(deckUrl)
  259 |     await page.getByRole('tab', { name: 'Strategy' }).click()
  260 |     await page.waitForTimeout(2000)
  261 |     await expect(page.locator('body')).not.toContainText('Application error')
  262 |   })
  263 | })
  264 | 
  265 | // ═══════════════════════════════════════════════════════════════════════════════
  266 | // 4. COLLECTION PAGE
  267 | // ═══════════════════════════════════════════════════════════════════════════════
  268 | 
  269 | test.describe('Collection', () => {
  270 |   test('collection page loads with cards', async ({ page }) => {
  271 |     await page.goto('/collection')
  272 |     // Wait for content — either card data or empty state
  273 |     await expect(
  274 |       page.getByText(/cards|No cards/).first()
  275 |     ).toBeVisible({ timeout: LOAD_TIMEOUT })
  276 |   })
  277 | 
  278 |   test('search filters collection', async ({ page }) => {
  279 |     await page.goto('/collection')
  280 |     const searchInput = page.getByRole('textbox', { name: /search/i }).first()
  281 |     await expect(searchInput).toBeVisible({ timeout: LOAD_TIMEOUT })
  282 | 
  283 |     await searchInput.fill('sol ring')
  284 |     await page.waitForTimeout(500)
  285 |     // Should show filtered results or "no match"
  286 |     await expect(page.locator('body')).not.toContainText('Application error')
  287 |   })
  288 | 
  289 |   test('pagination controls are visible when data exists', async ({ page }) => {
  290 |     await page.goto('/collection')
  291 |     await page.waitForTimeout(3000)
  292 |     // Footer should show "Showing X of Y cards"
  293 |     await expect(
  294 |       page.getByText(/Showing.*of.*cards/).first()
  295 |     ).toBeVisible({ timeout: LOAD_TIMEOUT })
  296 |   })
  297 | 
  298 |   test('sort dropdown works', async ({ page }) => {
  299 |     await page.goto('/collection')
  300 |     const sortSelect = page.locator('select').first()
  301 |     await expect(sortSelect).toBeVisible({ timeout: LOAD_TIMEOUT })
  302 |     // Change sort — should not error
  303 |     await sortSelect.selectOption({ index: 1 })
  304 |     await page.waitForTimeout(1000)
```