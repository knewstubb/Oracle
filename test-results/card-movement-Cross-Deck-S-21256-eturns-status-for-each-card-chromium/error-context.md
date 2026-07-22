# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: card-movement.spec.ts >> Cross-Deck Status Propagation >> API: card-statuses endpoint returns status for each card
- Location: tests/e2e/card-movement.spec.ts:332:7

# Error details

```
Error: expect(received).toHaveProperty(path)

Expected path: "ownership_status"
Received path: []

Received value: {"cardName": "Accursed Marauder", "deckCardsId": 8891, "isProxy": false, "physicalCopyId": 77288, "status": "original"}
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
        - list "Deck list" [ref=e58]:
          - listitem [ref=e59]:
            - link "A Rot to Process — Wilhelt, the Rotcleaver" [ref=e60] [cursor=pointer]:
              - /url: /decks/19277239
              - img "Wilhelt, the Rotcleaver card art" [ref=e63]
              - generic [ref=e64]:
                - heading "A Rot to Process" [level=3] [ref=e65]
                - paragraph [ref=e66]: Wilhelt, the Rotcleaver
                - generic [ref=e67]:
                  - 'generic "Status: In Rotation" [ref=e68]': In Rotation
                  - 'generic "Claim completeness: 82 of 82 cards claimed" [ref=e69]'
                  - generic [ref=e70]: 100/100 Cards
              - img "Blue, Black" [ref=e71]
          - listitem [ref=e74]:
            - link "Auntie-Social — Auntie Ool, Cursewretch" [ref=e75] [cursor=pointer]:
              - /url: /decks/19928852
              - img "Auntie Ool, Cursewretch card art" [ref=e78]
              - generic [ref=e79]:
                - heading "Auntie-Social" [level=3] [ref=e80]
                - paragraph [ref=e81]: Auntie Ool, Cursewretch
                - generic [ref=e82]:
                  - 'generic "Status: In Rotation" [ref=e83]': In Rotation
                  - 'generic "Claim completeness: 80 of 80 cards claimed" [ref=e84]'
                  - generic [ref=e85]: 100/100 Cards
              - img "Black, Red, Green" [ref=e86]
          - listitem [ref=e90]:
            - link "Crave the Grave — Muldrotha, the Gravetide" [ref=e91] [cursor=pointer]:
              - /url: /decks/687659933
              - img "Muldrotha, the Gravetide card art" [ref=e94]
              - generic [ref=e95]:
                - heading "Crave the Grave" [level=3] [ref=e96]
                - paragraph [ref=e97]: Muldrotha, the Gravetide
                - generic [ref=e98]:
                  - 'generic "Status: Brewing" [ref=e99]': Brewing
                  - generic [ref=e100]: 1/100 Cards
              - img "Blue, Black, Green" [ref=e101]
          - listitem [ref=e105]:
            - 'link "Endless Punishment - Duskmourn: House of Horror Commander — Valgavoth, Harrower of Souls" [ref=e106] [cursor=pointer]':
              - /url: /decks/9189744
              - img "Valgavoth, Harrower of Souls card art" [ref=e109]
              - generic [ref=e110]:
                - 'heading "Endless Punishment - Duskmourn: House of Horror Commander" [level=3] [ref=e111]'
                - paragraph [ref=e112]: Valgavoth, Harrower of Souls
                - generic [ref=e113]:
                  - 'generic "Status: Brewing" [ref=e114]': Brewing
                  - generic [ref=e115]: 100/100 Cards
              - img "Black, Red" [ref=e116]
          - listitem [ref=e119]:
            - link "Oh My Zombies — Teval, the Balanced Scale" [ref=e120] [cursor=pointer]:
              - /url: /decks/12499283
              - img "Teval, the Balanced Scale card art" [ref=e123]
              - generic [ref=e124]:
                - heading "Oh My Zombies" [level=3] [ref=e125]
                - paragraph [ref=e126]: Teval, the Balanced Scale
                - generic [ref=e127]:
                  - 'generic "Status: Brewing" [ref=e128]': Brewing
                  - generic [ref=e129]: 100/100 Cards
              - img "Blue, Black, Green" [ref=e130]
          - listitem [ref=e134]:
            - link "Peace Offering - Bloomburrow Commander — Ms. Bumbleflower" [ref=e135] [cursor=pointer]:
              - /url: /decks/8460469
              - img "Ms. Bumbleflower card art" [ref=e138]
              - generic [ref=e139]:
                - heading "Peace Offering - Bloomburrow Commander" [level=3] [ref=e140]
                - paragraph [ref=e141]: Ms. Bumbleflower
                - generic [ref=e142]:
                  - 'generic "Status: Brewing" [ref=e143]': Brewing
                  - generic [ref=e144]: 100/100 Cards
              - img "White, Blue, Green" [ref=e145]
          - listitem [ref=e149]:
            - link "Sqrl — The Unbeatable Squirrel Girl" [ref=e150] [cursor=pointer]:
              - /url: /decks/23711671
              - img "The Unbeatable Squirrel Girl card art" [ref=e153]
              - generic "Deck needs cards — not all slots are filled" [ref=e154]:
                - img [ref=e155]
              - generic [ref=e157]:
                - heading "Sqrl" [level=3] [ref=e158]
                - paragraph [ref=e159]: The Unbeatable Squirrel Girl
                - generic [ref=e160]:
                  - 'generic "Status: In Rotation" [ref=e161]': In Rotation
                  - 'generic "Claim completeness: 68 of 72 cards claimed" [ref=e162]'
                  - generic [ref=e163]: 100/100 Cards
              - img "Green" [ref=e164]
          - listitem [ref=e166]:
            - link "The Fairmaker — Ruric Thar, the Unbowed" [ref=e167] [cursor=pointer]:
              - /url: /decks/19354337
              - img "Ruric Thar, the Unbowed card art" [ref=e170]
              - generic "Deck needs cards — not all slots are filled" [ref=e171]:
                - img [ref=e172]
              - generic [ref=e174]:
                - heading "The Fairmaker" [level=3] [ref=e175]
                - paragraph [ref=e176]: Ruric Thar, the Unbowed
                - generic [ref=e177]:
                  - 'generic "Status: In Rotation" [ref=e178]': In Rotation
                  - 'generic "Claim completeness: 64 of 84 cards claimed" [ref=e179]'
                  - generic [ref=e180]: 100/100 Cards
              - img "Red, Green" [ref=e181]
          - listitem [ref=e184]:
            - link "Upgrades Unleashed - Neon Dynasty Commander — Chishiro, the Shattered Blade" [ref=e185] [cursor=pointer]:
              - /url: /decks/2360208
              - img "Chishiro, the Shattered Blade card art" [ref=e188]
              - generic [ref=e189]:
                - heading "Upgrades Unleashed - Neon Dynasty Commander" [level=3] [ref=e190]
                - paragraph [ref=e191]: Chishiro, the Shattered Blade
                - generic [ref=e192]:
                  - 'generic "Status: Brewing" [ref=e193]': Brewing
                  - generic [ref=e194]: 100/100 Cards
              - img "Red, Green" [ref=e195]
          - listitem [ref=e198]:
            - link "World Breaker — Hearthhull, the Worldseed" [ref=e199] [cursor=pointer]:
              - /url: /decks/23289174
              - img "Hearthhull, the Worldseed card art" [ref=e202]
              - generic [ref=e203]:
                - heading "World Breaker" [level=3] [ref=e204]
                - paragraph [ref=e205]: Hearthhull, the Worldseed
                - generic [ref=e206]:
                  - 'generic "Status: Brewing" [ref=e207]': Brewing
                  - generic [ref=e208]: 97/100 Cards
              - img "Black, Red, Green" [ref=e209]
          - listitem [ref=e213]:
            - link "Yedora the Explorer — Yedora, Grave Gardener" [ref=e214] [cursor=pointer]:
              - /url: /decks/21109505
              - img "Yedora, Grave Gardener card art" [ref=e217]
              - generic "Deck needs cards — not all slots are filled" [ref=e218]:
                - img [ref=e219]
              - generic [ref=e221]:
                - heading "Yedora the Explorer" [level=3] [ref=e222]
                - paragraph [ref=e223]: Yedora, Grave Gardener
                - generic [ref=e224]:
                  - 'generic "Status: In Rotation" [ref=e225]': In Rotation
                  - 'generic "Claim completeness: 64 of 69 cards claimed" [ref=e226]'
                  - generic [ref=e227]: 102/100 Cards
              - img "Green" [ref=e228]
        - generic [ref=e230]:
          - generic [ref=e231]: 5 decks in rotation
          - button "3 decks need cards" [ref=e232]:
            - img [ref=e233]
            - text: 3 decks need cards
  - region "Notifications alt+T"
  - alert [ref=e235]
```

# Test source

```ts
  255 |         const proxyBtn = popover.getByRole('button', { name: /proxy|add proxy/i }).first()
  256 |         // Unowned cards should offer Add Proxy
  257 |         if (await proxyBtn.isVisible()) {
  258 |           // Verify button is clickable (don't actually click to avoid test side effects)
  259 |           await expect(proxyBtn).toBeEnabled()
  260 |         }
  261 |       }
  262 |     }
  263 |   })
  264 | })
  265 | 
  266 | // ═══════════════════════════════════════════════════════════════════════════════
  267 | // MARK MISSING — Remove a card from play
  268 | // ═══════════════════════════════════════════════════════════════════════════════
  269 | 
  270 | test.describe('Mark Missing', () => {
  271 |   test('Original card popover has actions (including potential Mark Missing in kebab)', async ({ page }) => {
  272 |     await page.goto('/')
  273 |     await page.waitForTimeout(2000)
  274 | 
  275 |     const deckLink = page.locator('a[href*="/decks/"]').first()
  276 |     await deckLink.click()
  277 |     await page.waitForURL('**/decks/**')
  278 |     await page.waitForTimeout(SETTLE_TIMEOUT)
  279 | 
  280 |     const originalChip = page.locator('[aria-label*="status: original"]').first()
  281 |     if (await originalChip.isVisible()) {
  282 |       await originalChip.click()
  283 |       await page.waitForTimeout(800)
  284 | 
  285 |       const popover = page.locator('[data-slot="popover-content"]').first()
  286 |       await expect(popover).toBeVisible({ timeout: ACTION_TIMEOUT })
  287 | 
  288 |       // Original cards should show copy info and actions
  289 |       const popoverText = await popover.textContent()
  290 |       expect((popoverText ?? '').length).toBeGreaterThan(5)
  291 |     }
  292 |   })
  293 | })
  294 | 
  295 | // ═══════════════════════════════════════════════════════════════════════════════
  296 | // CROSS-DECK VERIFICATION — The critical test
  297 | // ═══════════════════════════════════════════════════════════════════════════════
  298 | 
  299 | test.describe('Cross-Deck Status Propagation', () => {
  300 |   test('card statuses are consistent across the Picklist view', async ({ page }) => {
  301 |     await page.goto('/')
  302 |     await page.waitForTimeout(2000)
  303 | 
  304 |     const deckLink = page.locator('a[href*="/decks/"]').first()
  305 |     await deckLink.click()
  306 |     await page.waitForURL('**/decks/**')
  307 |     await page.waitForTimeout(SETTLE_TIMEOUT)
  308 | 
  309 |     // Switch to Picklist tab
  310 |     const picklistTab = page.getByRole('tab', { name: /picklist/i })
  311 |     if (await picklistTab.isVisible()) {
  312 |       await picklistTab.click()
  313 |       await page.waitForTimeout(2000)
  314 | 
  315 |       // Picklist should load with sections (Original, Available, Claimed, etc.)
  316 |       const picklistContent = page.locator('[class*="picklist"], [data-testid="picklist"]').first()
  317 |         .or(page.locator('text=/Original|Available|Claimed|Unowned/').first())
  318 |       await expect(picklistContent).toBeVisible({ timeout: LOAD_TIMEOUT })
  319 |     }
  320 |   })
  321 | 
  322 |   test('Card Management page shows shared cards across decks', async ({ page }) => {
  323 |     await page.goto('/allocation')
  324 |     await page.waitForTimeout(SETTLE_TIMEOUT)
  325 | 
  326 |     // The Card Management / Allocation page shows cards that are in multiple decks
  327 |     // It should load and display cards with their allocations
  328 |     const pageContent = page.locator('text=/Card Management|Allocation|Shared/i').first()
  329 |     await expect(pageContent).toBeVisible({ timeout: LOAD_TIMEOUT })
  330 |   })
  331 | 
  332 |   test('API: card-statuses endpoint returns status for each card', async ({ page, request }) => {
  333 |     await page.goto('/')
  334 |     await page.waitForTimeout(2000)
  335 | 
  336 |     // Get a deck ID from the page
  337 |     const deckLink = page.locator('a[href*="/decks/"]').first()
  338 |     const href = await deckLink.getAttribute('href')
  339 |     if (!href) return
  340 | 
  341 |     const deckId = href.split('/decks/')[1]
  342 | 
  343 |     // Call the card-statuses API directly
  344 |     const res = await request.get(`/api/decks/${deckId}/card-statuses`)
  345 |     expect(res.status()).toBe(200)
  346 | 
  347 |     const data = await res.json()
  348 |     // Should return an array or object with card status info
  349 |     expect(data).toBeTruthy()
  350 |     if (Array.isArray(data.cards ?? data)) {
  351 |       const items = data.cards ?? data
  352 |       if (items.length > 0) {
  353 |         const first = items[0]
  354 |         // Each card should have an ownership_status field
> 355 |         expect(first).toHaveProperty('ownership_status')
      |                       ^ Error: expect(received).toHaveProperty(path)
  356 |       }
  357 |     }
  358 |   })
  359 | 
  360 |   test('API: reassign-to-deck endpoint accepts and processes request', async ({ request }) => {
  361 |     // Test the reassign API contract (without actually moving cards)
  362 |     // Send an invalid request to verify the endpoint exists and validates
  363 |     const res = await request.post('/api/allocation/reassign-to-deck', {
  364 |       data: { physicalCopyId: -1, targetDeckId: -1 },
  365 |     })
  366 |     // Should return 400/404/403 (validation error), not 500 or 404 (route not found)
  367 |     expect([400, 403, 404, 422, 500]).toContain(res.status())
  368 |     // If it returns a JSON error, that confirms the endpoint exists and runs
  369 |     const data = await res.json().catch(() => null)
  370 |     if (data) {
  371 |       expect(data).toHaveProperty('error')
  372 |     }
  373 |   })
  374 | 
  375 |   test('API: assign-free-copy endpoint accepts and processes request', async ({ request }) => {
  376 |     const res = await request.post('/api/allocation/assign-free-copy', {
  377 |       data: { deckCardId: -1, physicalCopyId: -1 },
  378 |     })
  379 |     expect([400, 403, 404, 422, 500]).toContain(res.status())
  380 |   })
  381 | })
  382 | 
```