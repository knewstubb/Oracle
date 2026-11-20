// Headless Chromium check of the card details modal (deck context).
// The saved Playwright session belongs to the test user, who has no decks, so this uses a temporary page
// (harness-page.tsx.txt copied to src/app/zz-harness/page.tsx) and fixture answers for the details request.
// Read-only: it opens the modal and switches tabs; it never saves anything.
// Usage: BASE=http://localhost:3137 CHROMIUM=<headless shell path> node capture.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE ?? 'http://localhost:3137'
const SESSION = process.env.SESSION ?? path.resolve(here, '../../../../../../../tests/e2e/.auth/session.json')
const storage = JSON.parse(fs.readFileSync(SESSION, 'utf8'))
storage.cookies = storage.cookies
  .filter((c) => c.name.startsWith('sb-'))
  .map((c) => ({ ...c, domain: 'localhost', secure: false, sameSite: 'Lax' }))
storage.origins = []

const SETS = ['m14', 'dtk', 'c21', 'cmr', 'm15', 'ths', 'mm3', 'pls', 'ema', 'cm2', 'c19', 'afc', 'lcc', 'm10']
const printings = SETS.map((s, i) => ({
  scryfallId: `8a2c0dc1-3d3a-4c8a-b2a5-2d5b3d4d6a${String(i).padStart(2, '0')}`, setCode: s, setName: `Set ${s.toUpperCase()}`, collectorNumber: String(40 + i * 7),
  rarity: i % 3 === 0 ? 'rare' : 'uncommon', finish: i % 4 === 1 ? 'foil' : 'nonfoil', priceUsd: i === 5 ? null : 0.6 + i * 0.4, releasedAt: `${2010 + i}-06-01`,
  imageSmall: null, imageNormal: null, owned: i < 3 ? 1 : 0, isSlotPrinting: i === 0,
}))
const details = {
  deckId: 4, deckName: "Rocco's Secret Sauce", deckCardId: 1, cardName: 'Elvish Archdruid', oracleId: 'oid',
  slot: { scryfallId: printings[0].scryfallId, setCode: 'm14', copyId: null, finish: null },
  facts: {
    name: 'Elvish Archdruid', typeLine: 'Creature — Elf Druid', manaCost: '{1}{G}{G}', manaValue: 3, colourIdentity: 'G', power: '2', toughness: '2', loyalty: null,
    oracleText: 'Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control.',
  },
  tags: ['Mana dork', 'Anthem', 'Tribal lord', 'Elf matters', 'Ramp'].map((n) => ({ key: n, displayName: n, kind: 'mechanic' })),
  printings,
  copies: [
    { copyId: 1, isProxy: false, finish: 'nonfoil', condition: 'LP', printingId: printings[2].scryfallId, printing: { setCode: 'c21', collectorNumber: '54' }, where: { kind: 'storage', name: 'Binder 2' }, state: 'open', action: 'sleeve_here' },
    { copyId: 2, isProxy: false, finish: 'foil', condition: 'NM', printingId: printings[1].scryfallId, printing: { setCode: 'dtk', collectorNumber: '47' }, where: { kind: 'deck', deckId: 9, deckName: 'Auntie Ool', deckState: 'playable' }, state: 'claimed', action: 'move_here' },
    { copyId: 3, isProxy: true, finish: 'nonfoil', condition: null, printingId: printings[0].scryfallId, printing: { setCode: 'm14', collectorNumber: '40' }, where: { kind: 'deck', deckId: 8, deckName: 'The Fairmaker', deckState: 'brewing' }, state: 'proxy_elsewhere', action: null },
    ...Array.from({ length: 9 }, (_, i) => ({ copyId: 20 + i, isProxy: false, finish: 'nonfoil', condition: 'NM', printingId: printings[3].scryfallId, printing: { setCode: 'cmr', collectorNumber: '61' }, where: { kind: 'storage', name: `Box ${i + 1}` }, state: 'open', action: 'sleeve_here' })),
  ],
  rulings: Array.from({ length: 14 }, (_, i) => ({ publishedAt: `2008-0${1 + (i % 9)}-01`, comment: `Ruling ${i + 1}: the ability counts Elves you control as it resolves, including this card itself. ${'More detail. '.repeat(i % 4)}` })),
  commanderLegality: 'legal', whyAvailable: true, why: 'Lord and mana engine in one.',
}

const failures = []
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`) }

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
for (const [w, h] of [[1280, 800], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, storageState: storage })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|scryfall/i.test(m.text())) errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.route('**/api/decks/4/cards/1/details', (r) => r.fulfill({ json: details }))
  await page.goto(`${BASE}/zz-harness`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.getByTestId('card-name-button').click()
  const modal = page.getByTestId('card-details')
  await modal.waitFor()
  await page.getByTestId('card-details-oracle').waitFor({ timeout: 30000 })
  for (const tab of ['Overview', 'Printings', 'Copies', 'Rulings']) {
    await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
    await page.waitForTimeout(300)
    const box = await modal.boundingBox()
    if (w >= 640) check(Math.round(box.height) === 600 && Math.round(box.width) === 1080, `${w}px ${tab}: modal ${Math.round(box.width)}x${Math.round(box.height)} is 1080x600`)
    else check(Math.round(box.height) === h && Math.round(box.width) === w, `${w}px ${tab}: sheet ${Math.round(box.width)}x${Math.round(box.height)} fills the screen`)
    const panel = page.locator('[role=tabpanel] > div').first()
    const scrolls = await panel.evaluate((el) => el.scrollHeight > el.clientHeight)
    console.log(`     ${tab} body scrolls inside: ${scrolls}`)
    await page.screenshot({ path: path.join(here, `${w}-${tab.toLowerCase()}.png`) })
  }
  check(errors.length === 0, `${w}px: console errors ${errors.length}${errors.length ? ' ' + errors.slice(0, 3).join(' | ') : ''}`)
  await ctx.close()
}
await browser.close()
if (failures.length) { console.error(`${failures.length} check(s) failed`); process.exit(1) }
