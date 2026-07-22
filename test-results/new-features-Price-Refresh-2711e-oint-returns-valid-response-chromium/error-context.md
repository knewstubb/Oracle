# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: new-features.spec.ts >> Price Refresh >> Cron endpoint returns valid response
- Location: tests/e2e/new-features.spec.ts:173:7

# Error details

```
Error: apiRequestContext.get: read ETIMEDOUT
Call log:
  - → GET https://oracle-alpha-two.vercel.app/api/cron/refresh-prices
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - cookie: sb-udocxsyzzvrceiuupprj-auth-token=base64-eyJhY2Nlc3NfdG9rZW4iOiJleUpoYkdjaU9pSkZVekkxTmlJc0ltdHBaQ0k2SWpVNU1EQm1Zakk0TFdGa1pHSXRORGhqWlMwNU5qZ3pMVGcyWmpsallXVXpOemMxTXlJc0luUjVjQ0k2SWtwWFZDSjkuZXlKcGMzTWlPaUpvZEhSd2N6b3ZMM1ZrYjJONGMzbDZlblp5WTJWcGRYVndjSEpxTG5OMWNHRmlZWE5sTG1OdkwyRjFkR2d2ZGpFaUxDSnpkV0lpT2lKa1lUZGpZMlk1TmkweVl6Y3pMVFF6TVdNdE9XUXdNeTA1TlRJME5qTm1PREprWTJNaUxDSmhkV1FpT2lKaGRYUm9aVzUwYVdOaGRHVmtJaXdpWlhod0lqb3hOemcwTmpnMU56QTNMQ0pwWVhRaU9qRTNPRFEyT0RJeE1EY3NJbVZ0WVdsc0lqb2lhMjVsZDNOMGRXSmlRR2R0WVdsc0xtTnZiU0lzSW5Cb2IyNWxJam9pSWl3aVlYQndYMjFsZEdGa1lYUmhJanA3SW5CeWIzWnBaR1Z5SWpvaVpXMWhhV3dpTENKd2NtOTJhV1JsY25NaU9sc2laVzFoYVd3aVhYMHNJblZ6WlhKZmJXVjBZV1JoZEdFaU9uc2laVzFoYVd4ZmRtVnlhV1pwWldRaU9uUnlkV1Y5TENKeWIyeGxJam9pWVhWMGFHVnVkR2xqWVhSbFpDSXNJbUZoYkNJNkltRmhiREVpTENKaGJYSWlPbHQ3SW0xbGRHaHZaQ0k2SW5CaGMzTjNiM0prSWl3aWRHbHRaWE4wWVcxd0lqb3hOemcwTmpneU1UQTNmVjBzSW5ObGMzTnBiMjVmYVdRaU9pSm1OMlkwTldRMlpDMWlPR0psTFRSaE1tWXRZV1JtWWkweFkyTm1NekZpTVdJd05XWWlMQ0pwYzE5aGJtOXVlVzF2ZFhNaU9tWmhiSE5sZlEuTW9OcmhQVzg2b3hOZG5QMmJKZFcwbnFSLVVnVXJOR05nOFJTNHhyWXhBamJldEZRbzZCUll0ejlyUk9Qc1lraU9ncml2N1BJZG9sM0haWDdDS3RuU0EiLCJ0b2tlbl90eXBlIjoiYmVhcmVyIiwiZXhwaXJlc19pbiI6MzYwMCwiZXhwaXJlc19hdCI6MTc4NDY4NTcwNywicmVmcmVzaF90b2tlbiI6ImE3cHk3anl0YnN6ayIsInVzZXIiOnsiaWQiOiJkYTdjY2Y5Ni0yYzczLTQzMWMtOWQwMy05NTI0NjNmODJkY2MiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJlbWFpbCI6ImtuZXdzdHViYkBnbWFpbC5jb20iLCJlbWFpbF9jb25maXJtZWRfYXQiOiIyMDI2LTA3LTA1VDIxOjMzOjUwLjg4OTA0NloiLCJwaG9uZSI6IiIsImNvbmZpcm1lZF9hdCI6IjIwMjYtMDctMDVUMjE6MzM6NTAuODg5MDQ2WiIsInJlY292ZXJ5X3NlbnRfYXQiOiIyMDI2LTA3LTIxVDAwOjMyOjQ2LjczNjQ4OVoiLCJsYXN0X3NpZ25faW5fYXQiOiIyMDI2LTA3LTIyVDAxOjAxOjQ2Ljk5Nzk2MDA3NVoiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbF92ZXJpZmllZCI6dHJ1ZX0sImlkZW50aXRpZXMiOlt7ImlkZW50aXR5X2lkIjoiOTMzNGNhOWMtZGRjYS00ZGRhLTkwNTQtMjhjNTgwYWQwZWViIiwiaWQiOiJkYTdjY2Y5Ni0yYzczLTQzMWMtOWQwMy05NTI0NjNmODJkY2MiLCJ1c2VyX2lkIjoiZGE3Y2NmOTYtMmM3My00MzFjLTlkMDMtOTUyNDYzZjgyZGNjIiwiaWRlbnRpdHlfZGF0YSI6eyJlbWFpbCI6ImtuZXdzdHViYkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiJkYTdjY2Y5Ni0yYzczLTQzMWMtOWQwMy05NTI0NjNmODJkY2MifSwicHJvdmlkZXIiOiJlbWFpbCIsImxhc3Rfc2lnbl9pbl9hdCI6IjIwMjYtMDctMDVUMjE6MzM6NTAuODgxOTU5WiIsImNyZWF0ZWRfYXQiOiIyMDI2LTA3LTA1VDIxOjMzOjUwLjg4MjAxNFoiLCJ1cGRhdGVkX2F0IjoiMjAyNi0wNy0wNVQyMTozMzo1MC44ODIwMTRaIiwiZW1haWwiOiJrbmV3c3R1YmJAZ21haWwuY29tIn1dLCJjcmVhdGVkX2F0IjoiMjAyNi0wNy0wNVQyMTozMzo1MC44Njc0NzJaIiwidXBkYXRlZF9hdCI6IjIwMjYtMDctMjJUMDE6MDE6NDcuMDQ4MVoiLCJpc19hbm9ueW1vdXMiOmZhbHNlfSwid2Vha19wYXNzd29yZCI6bnVsbH0

```

# Test source

```ts
  74  |     // Turn counter should show 1
  75  |     await expect(page.getByText(/Turn: 1/)).toBeVisible()
  76  |   })
  77  | 
  78  |   test('Mulligan redraws hand to 7', async ({ page }) => {
  79  |     const goldfishTab = page.getByRole('tab', { name: /goldfish/i })
  80  |     await goldfishTab.click()
  81  |     await page.waitForTimeout(500)
  82  | 
  83  |     const mulliganBtn = page.getByRole('button', { name: /mulligan/i })
  84  |     await mulliganBtn.click()
  85  |     await page.waitForTimeout(300)
  86  | 
  87  |     // Hand should still show 7 (London mulligan draws 7)
  88  |     const handHeading = page.getByText(/Hand \(7\)/i)
  89  |     await expect(handHeading).toBeVisible()
  90  | 
  91  |     // Mulligan count shows in button
  92  |     await expect(page.getByRole('button', { name: /mulligan \(1\)/i })).toBeVisible()
  93  |   })
  94  | 
  95  |   test('New Game resets everything', async ({ page }) => {
  96  |     const goldfishTab = page.getByRole('tab', { name: /goldfish/i })
  97  |     await goldfishTab.click()
  98  |     await page.waitForTimeout(500)
  99  | 
  100 |     // Draw a card first
  101 |     await page.getByRole('button', { name: /draw/i }).click()
  102 |     await page.waitForTimeout(300)
  103 | 
  104 |     // Reset
  105 |     await page.getByRole('button', { name: /new game/i }).click()
  106 |     await page.waitForTimeout(300)
  107 | 
  108 |     // Back to 7 in hand, turn 0
  109 |     await expect(page.getByText(/Hand \(7\)/i)).toBeVisible()
  110 |     await expect(page.getByText(/Turn: 0/)).toBeVisible()
  111 |   })
  112 | })
  113 | 
  114 | // ═══════════════════════════════════════════════════════════════════════════════
  115 | // COLLECTION EXPORT
  116 | // ═══════════════════════════════════════════════════════════════════════════════
  117 | 
  118 | test.describe('Collection Export', () => {
  119 |   test('Export button is visible on collection page', async ({ page }) => {
  120 |     await page.goto('/collection')
  121 |     await page.waitForTimeout(2000)
  122 | 
  123 |     const exportBtn = page.getByRole('button', { name: /export/i })
  124 |     await expect(exportBtn).toBeVisible({ timeout: LOAD_TIMEOUT })
  125 |   })
  126 | 
  127 |   test('Export button triggers CSV download', async ({ page }) => {
  128 |     await page.goto('/collection')
  129 |     await page.waitForTimeout(2000)
  130 | 
  131 |     // Listen for download
  132 |     const downloadPromise = page.waitForEvent('download', { timeout: ACTION_TIMEOUT })
  133 | 
  134 |     const exportBtn = page.getByRole('button', { name: /export/i })
  135 |     await exportBtn.click()
  136 | 
  137 |     const download = await downloadPromise
  138 |     expect(download.suggestedFilename()).toMatch(/oracle-collection.*\.csv$/)
  139 |   })
  140 | 
  141 |   test('Export API returns valid CSV with correct headers', async ({ request }) => {
  142 |     const res = await request.get('/api/collection/export')
  143 |     expect(res.status()).toBe(200)
  144 |     expect(res.headers()['content-type']).toContain('text/csv')
  145 | 
  146 |     const csv = await res.text()
  147 |     const firstLine = csv.split('\n')[0]
  148 |     expect(firstLine).toContain('Name')
  149 |     expect(firstLine).toContain('Edition Code')
  150 |     expect(firstLine).toContain('Scryfall ID')
  151 |     expect(firstLine).toContain('Purchase Price')
  152 |   })
  153 | })
  154 | 
  155 | // ═══════════════════════════════════════════════════════════════════════════════
  156 | // PRICE REFRESH
  157 | // ═══════════════════════════════════════════════════════════════════════════════
  158 | 
  159 | test.describe('Price Refresh', () => {
  160 |   test('Refresh Prices button is visible in collection value banner', async ({ page }) => {
  161 |     await page.goto('/collection')
  162 |     await page.waitForTimeout(3000)
  163 | 
  164 |     // The refresh button is in the CollectionValueBanner (only shows if collection has value)
  165 |     const refreshBtn = page.getByRole('button', { name: /refresh/i })
  166 |     // May not be visible if collection has no priced cards — that's OK
  167 |     const bannerVisible = await page.locator('text=Collection Value').isVisible()
  168 |     if (bannerVisible) {
  169 |       await expect(refreshBtn).toBeVisible()
  170 |     }
  171 |   })
  172 | 
  173 |   test('Cron endpoint returns valid response', async ({ request }) => {
> 174 |     const res = await request.get('/api/cron/refresh-prices')
      |                               ^ Error: apiRequestContext.get: read ETIMEDOUT
  175 |     // Should return 200 (no CRON_SECRET required when env var isn't set)
  176 |     // or 401 if CRON_SECRET is configured
  177 |     expect([200, 401]).toContain(res.status())
  178 | 
  179 |     if (res.status() === 200) {
  180 |       const data = await res.json()
  181 |       expect(data).toHaveProperty('updated')
  182 |       expect(data).toHaveProperty('total')
  183 |     }
  184 |   })
  185 | })
  186 | 
  187 | // ═══════════════════════════════════════════════════════════════════════════════
  188 | // MULTI-PLATFORM DECK IMPORT (URL PARSING)
  189 | // ═══════════════════════════════════════════════════════════════════════════════
  190 | 
  191 | test.describe('Multi-Platform Import', () => {
  192 |   test('Import button opens import dialog', async ({ page }) => {
  193 |     await page.goto('/')
  194 |     await page.waitForTimeout(2000)
  195 | 
  196 |     // Find import deck button
  197 |     const importBtn = page.getByRole('button', { name: /import/i }).first()
  198 |     await expect(importBtn).toBeVisible({ timeout: LOAD_TIMEOUT })
  199 |     await importBtn.click()
  200 |     await page.waitForTimeout(500)
  201 | 
  202 |     // Dialog should open with URL input
  203 |     const urlInput = page.getByPlaceholder(/url/i).or(page.locator('input[type="url"]')).or(page.locator('input[placeholder*="archidekt"]'))
  204 |     await expect(urlInput).toBeVisible({ timeout: ACTION_TIMEOUT })
  205 |   })
  206 | 
  207 |   test('import preview accepts Archidekt URL format', async ({ request }) => {
  208 |     // Test with a known public deck — this tests URL parsing, not the actual fetch
  209 |     const res = await request.post('/api/decks/import/preview', {
  210 |       data: { url: 'https://archidekt.com/decks/1234567' },
  211 |     })
  212 |     // Will return 404 (deck doesn't exist) or 200 — either confirms URL parsing works
  213 |     expect([200, 404, 502]).toContain(res.status())
  214 |   })
  215 | 
  216 |   test('import preview accepts Moxfield URL format', async ({ request }) => {
  217 |     const res = await request.post('/api/decks/import/preview', {
  218 |       data: { url: 'https://www.moxfield.com/decks/abc123def' },
  219 |     })
  220 |     expect([200, 404, 502]).toContain(res.status())
  221 |   })
  222 | 
  223 |   test('import preview accepts MTGGoldfish URL format', async ({ request }) => {
  224 |     const res = await request.post('/api/decks/import/preview', {
  225 |       data: { url: 'https://www.mtggoldfish.com/deck/6000000' },
  226 |     })
  227 |     expect([200, 404, 502]).toContain(res.status())
  228 |   })
  229 | 
  230 |   test('import preview accepts TappedOut URL format', async ({ request }) => {
  231 |     const res = await request.post('/api/decks/import/preview', {
  232 |       data: { url: 'https://tappedout.net/mtg-decks/my-cool-deck/' },
  233 |     })
  234 |     expect([200, 404, 502]).toContain(res.status())
  235 |   })
  236 | 
  237 |   test('import preview accepts Deckbox URL format', async ({ request }) => {
  238 |     const res = await request.post('/api/decks/import/preview', {
  239 |       data: { url: 'https://deckbox.org/sets/1234567' },
  240 |     })
  241 |     expect([200, 404, 502]).toContain(res.status())
  242 |   })
  243 | 
  244 |   test('import preview rejects unsupported URL', async ({ request }) => {
  245 |     const res = await request.post('/api/decks/import/preview', {
  246 |       data: { url: 'https://example.com/not-a-deck' },
  247 |     })
  248 |     expect(res.status()).toBe(400)
  249 |     const data = await res.json()
  250 |     expect(data.error).toContain('does not match')
  251 |   })
  252 | 
  253 |   test('text paste import works with MTGA format', async ({ page }) => {
  254 |     await page.goto('/')
  255 |     await page.waitForTimeout(2000)
  256 | 
  257 |     const importBtn = page.getByRole('button', { name: /import/i }).first()
  258 |     await importBtn.click()
  259 |     await page.waitForTimeout(500)
  260 | 
  261 |     // Switch to paste mode if there's a tab/toggle
  262 |     const pasteTab = page.getByText(/paste/i).first()
  263 |     if (await pasteTab.isVisible()) {
  264 |       await pasteTab.click()
  265 |       await page.waitForTimeout(300)
  266 |     }
  267 | 
  268 |     // Look for textarea
  269 |     const textarea = page.locator('textarea').first()
  270 |     if (await textarea.isVisible()) {
  271 |       await textarea.fill('Commander\n1 Sol Ring (CMR) 472\n1 Command Tower (CMR) 350')
  272 |       // Should accept the input without error
  273 |       await page.waitForTimeout(500)
  274 |     }
```