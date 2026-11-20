// Headless Chromium check of the card details window (collection context), on fixture answers.
// Playwright's e2e suite cannot run here (no isolated test login). This uses the saved session only to pass the
// page guard, a temporary page (harness-page.tsx.txt copied to src/app/zz-harness/page.tsx), and fixture answers
// for every request the window makes. Every write request is answered by the fixture: nothing reaches hosted data.
// Usage: BASE=http://localhost:3137 node capture.mjs   (run from the repo root so 'playwright' resolves)
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE ?? 'http://localhost:3137'
const SESSION = process.env.SESSION ?? '/Users/bradknewstubb/Developer/Personal/oracle_app/tests/e2e/.auth/session.json'
const storage = JSON.parse(fs.readFileSync(SESSION, 'utf8'))
storage.cookies = storage.cookies.filter((c) => c.name.startsWith('sb-')).map((c) => ({ ...c, domain: 'localhost', secure: false, sameSite: 'Lax' }))
storage.origins = []
const SETS = ['c21', 'cmr', 'm15', 'ths', 'mm3', 'pls', 'ema', 'cm2', 'c19', 'afc', 'lcc', 'm10']
const printings = SETS.map((s, i) => ({
  scryfallId: `8a2c0dc1-3d3a-4c8a-b2a5-2d5b3d4d6a${String(i).padStart(2, '0')}`, setCode: s, setName: `Set ${s.toUpperCase()}`, collectorNumber: String(40 + i * 7),
  rarity: i % 3 === 0 ? 'rare' : 'uncommon', finish: i % 4 === 1 ? 'foil' : 'nonfoil', priceUsd: i === 5 ? null : 0.6 + i * 0.4, releasedAt: `${2010 + i}-06-01`,
  imageSmall: null, imageNormal: null, owned: i < 3 ? 1 : 0, isSlotPrinting: false,
}))
const P = (i) => ({ setCode: SETS[i], setName: `Set ${SETS[i].toUpperCase()}`, collectorNumber: String(40 + i * 7) })
const copies = [
  { copyId: 1, isProxy: false, finish: 'foil', condition: 'near_mint', printingId: printings[1].scryfallId, printing: P(1), priceUsd: 4.8, storage: { id: 3, name: 'Binder 2' }, assigned: { deckId: 9, deckName: 'Auntie Ool', deckState: 'playable', deckCardsId: 90 }, state: 'in_deck' },
  { copyId: 2, isProxy: true, finish: 'nonfoil', condition: null, printingId: printings[0].scryfallId, printing: P(0), priceUsd: null, storage: { id: null, name: null }, assigned: { deckId: 8, deckName: 'The Fairmaker', deckState: 'brewing', deckCardsId: 91 }, state: 'in_deck' },
  ...Array.from({ length: 9 }, (_, i) => ({ copyId: 10 + i, isProxy: false, finish: 'nonfoil', condition: i % 2 ? 'lightly_played' : 'near_mint', printingId: printings[2].scryfallId, printing: P(2), priceUsd: 0.9, storage: { id: 3, name: 'Binder 2' }, assigned: null, state: 'open' })),
]
const details = {
  oracleId: 'oid-sol', cardName: 'Sol Ring',
  facts: { name: 'Sol Ring', typeLine: 'Artifact', manaCost: '{1}', manaValue: 1, colourIdentity: '', power: null, toughness: null, loyalty: null, oracleText: '{T}: Add {C}{C}.' },
  tags: ['Ramp', 'Mana rock', 'Fast mana', 'Colourless'].map((n) => ({ key: n, displayName: n, kind: 'mechanic' })),
  printings, copies,
  waitingDecks: [
    { deckCardsId: 50, deckId: 4, deckName: "Rocco's Secret Sauce", deckState: 'brewing' },
    { deckCardsId: 51, deckId: 5, deckName: 'Korvold', deckState: 'assembling' },
  ],
  rulings: Array.from({ length: 14 }, (_, i) => ({ publishedAt: `2008-0${1 + (i % 9)}-01`, comment: `Ruling ${i + 1}: the ability adds two colourless mana. ${'More detail. '.repeat(i % 4)}` })),
  commanderLegality: 'legal', ownedCount: copies.length, collectionValue: 12.9, cheapest: 0.6, imageScryfallId: printings[2].scryfallId,
}
const failures = []
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`) }
const contrast = async (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel)
  if (!el) return null
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  const rgba = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  let bg = [0, 0, 0]
  for (let n = el; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] > 0.95) { bg = c; break } }
  const fg = rgba(getComputedStyle(el).color)
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}, selector)
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
for (const [w, h] of [[1280, 800], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, storageState: storage })
  const page = await ctx.newPage()
  const errors = []
  const writes = []
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|scryfall/i.test(m.text())) errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.route('**/api/collection/instances/oid-sol/details', (r) => r.fulfill({ json: details }))
  await page.route('**/api/settings/storage-locations', (r) => r.fulfill({ json: [{ id: 3, name: 'Binder 2', color: null }, { id: 4, name: 'Box', color: null }] }))
  await page.route('**/api/allocation/valid-decks**', (r) => r.fulfill({ json: [{ deckId: 4, deckName: "Rocco's Secret Sauce", deckStatus: 'brewing' }] }))
  await page.route('**/api/collection/instances/condition', async (r) => { writes.push(r.request().url()); await new Promise((x) => setTimeout(x, 600)); await r.fulfill({ json: { ok: true } }) })
  await page.route('**/api/collection/assign-location', (r) => { writes.push(r.request().url()); return r.fulfill({ json: { ok: true } }) })
  await page.goto(`${BASE}/zz-harness`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.getByTestId('open-details').click()
  const modal = page.getByTestId('card-details')
  await modal.waitFor()
  await page.getByTestId('card-details-own-pill').waitFor({ timeout: 30000 })
  await page.waitForTimeout(600)
  const box = await modal.boundingBox()
  if (w >= 640) check(Math.abs(box.width - 1080) <= 1 && Math.abs(box.height - 600) <= 1, `${w}: modal is 1080 x 600 (got ${box.width} x ${box.height})`)
  else check(Math.abs(box.width - w) <= 1 && Math.abs(box.height - h) <= 1, `${w}: full screen on a phone (got ${box.width} x ${box.height})`)
  for (const tab of ['Overview', 'Printings', 'Copies', 'Rulings']) {
    await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
    await page.waitForTimeout(250)
    const panel = page.getByRole('tabpanel')
    const m = await panel.evaluate((el) => {
      const scroller = [...el.querySelectorAll('*'), el].find((n) => getComputedStyle(n).overflowY === 'auto' && n.scrollHeight > n.clientHeight + 1)
      return { scrolls: Boolean(scroller) }
    })
    const mb = await modal.boundingBox()
    check(Math.abs(mb.height - box.height) <= 1, `${w}: ${tab} keeps the window height (${mb.height}); scrolls inside: ${m.scrolls}`)
    await page.screenshot({ path: path.join(here, `${w}-${tab.toLowerCase()}.png`) })
  }
  // Copies: condition save status and the menu
  await page.getByRole('tab', { name: /^Copies/ }).click()
  await page.getByLabel('Condition for copy 10').selectOption('moderately_played')
  await page.getByText('Saving…').first().waitFor({ timeout: 3000 })
  await page.screenshot({ path: path.join(here, `${w}-copies-saving.png`) })
  await page.getByText(/^Saved at/).first().waitFor({ timeout: 5000 })
  check(writes.some((u) => u.includes('/condition')), `${w}: condition save went to the (fixture) condition route`)
  await page.getByLabel('Select copy 10', { exact: false }).first().check()
  check((await page.getByTestId('card-details-selected-count').innerText()) === '1 selected', `${w}: ticking a copy shows 1 selected`)
  await page.getByRole('button', { name: 'More actions for copy 1', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Unassign' }).click()
  await page.getByTestId('card-details-unassign-warning').waitFor()
  await page.screenshot({ path: path.join(here, `${w}-copies-playable-warning.png`) })
  // contrast
  await page.getByRole('tab', { name: /^Overview/ }).click()
  for (const [sel, need, label] of [['[data-testid="card-details-where"] h3', 4.5, 'panel heading'], ['[data-testid="card-details-where-row"] .text-muted-foreground', 4.5, 'muted state text'], ['[data-testid="card-details-own-pill"]', 4.5, 'You own pill']]) {
    const c = await contrast(page, sel)
    check(c != null && c >= need, `${w}: contrast ${label} ${c?.toFixed(2)} >= ${need}`)
  }
  for (const kind of ['original', 'open', 'proxy']) {
    const c = await page.evaluate((k) => { const el = document.querySelector(`[data-swatch="${k}"]`); return el ? getComputedStyle(el).borderTopColor : null }, kind)
    console.log(`info ${w}: swatch ${kind} border ${c}`)
  }
  // keyboard: focus returns to the opener on close
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
  check(focused === 'open-details', `${w}: focus returns to the opener after close (got ${focused})`)
  check(errors.length === 0, `${w}: no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await ctx.close()
}
await browser.close()
if (failures.length) { console.log(`\n${failures.length} FAILED`); process.exit(1) }
console.log('\nall checks passed')
