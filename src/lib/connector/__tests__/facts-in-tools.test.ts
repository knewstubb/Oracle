import { describe, it, expect } from 'vitest'
import { searchCollection, searchCollectionInput } from '../tools/search-collection'
import { getDeck, getDeckInput } from '../tools/get-deck'
import { listDeckCardsByOwnership, listByOwnershipInput } from '../tools/list-deck-cards-by-ownership'
import { byteLength, MAX_RESPONSE_BYTES } from '../limits'
import { mockDb, type RecordedQuery } from './mock-db'
import { copyRow, resetIds, viewDb } from './view-db'

const U = 'user-1'

const inList = (q: RecordedQuery) => (q.filters.find((f) => f.op === 'in')?.args[1] as string[]) ?? []

const LIB: Record<string, Record<string, unknown>> = {
  'Sol Ring': { name: 'Sol Ring', type_line: 'Artifact', oracle_text: 'Tap: Add {C}{C}.', mana_cost: '{1}', mana_value: 1, color_identity: '', commander_legal: true },
}

const solRing = { name: 'Sol Ring', type_line: 'Artifact', oracle_text: 'Tap: Add {C}{C}.', mana_cost: '{1}', mana_value: 1, color_identity: '', commander_legal: true }

function searchDb(names: string[]) {
  resetIds()
  const rows = names.map((n) => copyRow(LIB[n] ? (LIB[n] as never) : null, { name: n, box: 'Unsorted' }))
  const base = viewDb(rows, { library: [...Object.values(LIB) as never[], solRing] })
  // The facts code also reads ref_printings for prices.
  const inner = base.db
  return {
    queries: base.queries,
    db: {
      select: (t: string, c: string, o?: never) =>
        t === 'ref_printings'
          ? (mockDb((q) => ({ data: (q.filters.find((f) => f.op === 'in')?.args[1] as string[] | undefined)?.includes('Sol Ring') && q.columns !== 'name' ? [{ name: 'Sol Ring', price_usd: 1.5, digital: false, updated_at: '2026-11-15T00:00:00Z' }] : [] })).db.select(t, c, o))
          : inner.select(t, c, o),
    },
  }
}

type Found = { items: { name: string; typeLine: string | null; facts: Record<string, unknown> }[]; truncated: boolean; note?: string }

describe('search_collection facts (CC-06b)', () => {
  it('Sol Ring shows type, cost, colours, legality, rules text and the estimate label', async () => {
    const { db } = searchDb(['Sol Ring'])
    const r = (await searchCollection({ db: db as never, userId: U }, searchCollectionInput.parse({ query: 'Sol Ring' }))) as never as Found
    expect(r.items[0].facts).toMatchObject({
      available: true, typeLine: 'Artifact', manaCost: '{1}', manaValue: 1, colorIdentity: '', rulesText: 'Tap: Add {C}{C}.',
      legality: 'legal', price: { usd: 1.5, label: 'Estimate from Scryfall' },
    })
  })

  it('the row type comes from the card library facts', async () => {
    const { db } = searchDb(['Sol Ring'])
    const r = (await searchCollection({ db: db as never, userId: U }, searchCollectionInput.parse({}))) as never as Found
    expect(r.items[0].typeLine).toBe('Artifact')
  })

  it('a name not in the library says facts unavailable', async () => {
    const { db } = searchDb(['Mystery Card'])
    const r = (await searchCollection({ db: db as never, userId: U }, searchCollectionInput.parse({}))) as never as Found
    expect(r.items[0].facts).toMatchObject({ available: false, typeLine: null, legality: 'unknown', price: { usd: null } })
    expect(r.items[0].typeLine).toBeNull()
  })

  it('one batched facts lookup per page, not one per card', async () => {
    const { db, queries } = searchDb(['Sol Ring', ...Array.from({ length: 24 }, (_, i) => `Card ${i}`)])
    await searchCollection({ db: db as never, userId: U }, searchCollectionInput.parse({}))
    expect(queries.filter((q) => q.table === 'ref_cards' && q.filters.some((f) => f.op === 'in')).length).toBe(1)
  })

  it('a 25-card page of full facts stays under the size cap or says more remain', async () => {
    const long = 'w'.repeat(300)
    const names = Array.from({ length: 25 }, (_, i) => `Big Card ${i}`)
    for (const n of names) LIB[n] = { name: n, type_line: 'Legendary Creature — Something Long', oracle_text: long.repeat(3), mana_cost: '{W}{U}{B}{R}{G}', mana_value: 5, color_identity: 'WUBRG', commander_legal: true }
    const { db } = searchDb(names)
    const r = (await searchCollection({ db: db as never, userId: U }, searchCollectionInput.parse({}))) as never as Found
    expect(byteLength(r)).toBeLessThanOrEqual(MAX_RESPONSE_BYTES)
    if (r.items.length < 25) {
      expect(r.truncated).toBe(true)
      expect(r.note).toMatch(/Showing \d+ of 25/)
    }
  })

  it('a facts lookup failure is a real error, not "unavailable"', async () => {
    resetIds()
    const { db } = viewDb([copyRow(solRing as never, { box: 'B' })], { library: [solRing as never], failTable: 'ref_cards' })
    expect(await searchCollection({ db, userId: U }, searchCollectionInput.parse({}))).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
  })
})

const DECK = { id: 1, name: 'Korvold', commander_name: 'Korvold', format: 'commander', status: 'active', bracket: null, card_count: 4, is_active: true }
const slotRow = (id: number, name: string) => ({ id, card_name: name, quantity: 1, categories: null, is_commander: false, ownership_status: 'original', is_generic: false, copy_id: null, scryfall_id: null, requested_finish: null })
const deckLib: Record<string, Record<string, unknown>> = {
  'Craterhoof Behemoth': { name: 'Craterhoof Behemoth', type_line: 'Creature — Beast', oracle_text: 'Haste. ETB: creatures get +X/+X.', mana_cost: '{5}{G}{G}{G}', mana_value: 8, color_identity: 'G', commander_legal: true },
  'Llanowar Elves': { name: 'Llanowar Elves', type_line: 'Creature — Elf Druid', oracle_text: 'Tap: Add {G}.', mana_cost: '{G}', mana_value: 1, color_identity: 'G', commander_legal: true },
  'Eternal Witness': { name: 'Eternal Witness', type_line: 'Creature — Human Shaman', oracle_text: 'ETB: return a card.', mana_cost: '{1}{G}{G}', mana_value: 3, color_identity: 'G', commander_legal: true },
  'Hornet Queen': { name: 'Hornet Queen', type_line: 'Creature — Insect', oracle_text: 'Flying, deathtouch.', mana_cost: '{4}{G}{G}{G}', mana_value: 7, color_identity: 'G', commander_legal: true },
}

function deckDb() {
  return mockDb((q) => {
    if (q.table === 'decks') return { data: [DECK] }
    if (q.table === 'deck_cards') return { data: Object.keys(deckLib).map((n, i) => slotRow(i + 1, n)) }
    if (q.table === 'ref_cards') return { data: inList(q).filter((n) => deckLib[n]).map((n) => deckLib[n]) }
    return { data: [] }
  })
}

describe('get_deck facts (CC-06c)', () => {
  it('creatures costing 4 or more can be answered from one get_deck call (scenario S1)', async () => {
    const { db, queries } = deckDb()
    const r = (await getDeck({ db, userId: U }, getDeckInput.parse({ deck_id: 1 }))) as never as { mainboard: { items: { name: string; facts: { typeLine: string; manaValue: number } }[] } }
    const big = r.mainboard.items.filter((i) => i.facts.typeLine.includes('Creature') && i.facts.manaValue >= 4).map((i) => i.name)
    expect(big.sort()).toEqual(['Craterhoof Behemoth', 'Hornet Queen'])
    expect(queries.filter((q) => q.table === 'ref_cards' && q.filters.some((f) => f.op === 'in')).length).toBe(1)
  })

  it('rules text is off by default and on with include_rules_text', async () => {
    const off = (await getDeck({ db: deckDb().db, userId: U }, getDeckInput.parse({ deck_id: 1 }))) as never as { mainboard: { items: { facts: Record<string, unknown> }[] } }
    expect('rulesText' in off.mainboard.items[0].facts).toBe(false)
    const on = (await getDeck({ db: deckDb().db, userId: U }, getDeckInput.parse({ deck_id: 1, include_rules_text: true }))) as never as { mainboard: { items: { facts: Record<string, unknown> }[] } }
    expect(on.mainboard.items[0].facts.rulesText).toBeTruthy()
  })

  it('a realistic 100-card deck stays under the cap; if facts push it over, the page is shortened and says so', async () => {
    const names = Array.from({ length: 100 }, (_, i) => `Eternal Witness of Things ${i}`)
    const lib = Object.fromEntries(names.map((n) => [n, { name: n, type_line: 'Legendary Creature — Elf Druid', oracle_text: 'x'.repeat(500), mana_cost: '{2}{G}{G}', mana_value: 4, color_identity: 'G', commander_legal: true }]))
    const { db, queries } = mockDb((q) => {
      if (q.table === 'decks') return { data: [{ ...DECK, card_count: 100 }] }
      if (q.table === 'deck_cards') return { data: names.map((n, i) => ({ ...slotRow(i + 1, n), categories: '["Creature","Ramp"]', scryfall_id: '12345678-1234-1234-1234-123456789012' })) }
      if (q.table === 'ref_cards') return { data: inList(q).filter((n) => lib[n]).map((n) => lib[n]) }
      return { data: [] }
    })
    const r = (await getDeck({ db, userId: U }, getDeckInput.parse({ deck_id: 1 }))) as never as { mainboard: { returned: number; truncated: boolean; note?: string } }
    expect(byteLength(r)).toBeLessThanOrEqual(MAX_RESPONSE_BYTES)
    if (r.mainboard.returned < 100) {
      expect(r.mainboard.truncated).toBe(true)
      expect(r.mainboard.note).toMatch(/offset \d+/)
    }
    for (const q of queries.filter((x) => !x.table.startsWith('ref_'))) expect(q.filters.some((f) => f.op === 'eq' && f.args[0] === 'user_id' && f.args[1] === U), q.table).toBe(true)
  })

  it('ownership rows carry facts and keep their own price figures and totals', async () => {
    const { db } = mockDb((q) => {
      if (q.table === 'decks') return { data: [{ id: 1, name: 'Korvold', is_active: true }] }
      if (q.table === 'deck_cards') return { data: [{ id: 1, deck_id: 1, card_name: 'Sol Ring', quantity: 2, categories: null, ownership_status: 'proxy', is_generic: false }] }
      if (q.table === 'ref_cards') return { data: [LIB['Sol Ring']] }
      if (q.table === 'ref_printings') return { data: [{ name: 'Sol Ring', price_usd: 1.5, digital: false, updated_at: new Date().toISOString() }] }
      return { data: [] }
    })
    const r = (await listDeckCardsByOwnership({ db, userId: U }, listByOwnershipInput.parse({}))) as never as { totals: { valueIfBoughtUsd: number }; items: { unitPriceUsd: number; valueIfBoughtUsd: number; facts: { typeLine: string; legality: string } }[] }
    expect(r.items[0]).toMatchObject({ unitPriceUsd: 1.5, valueIfBoughtUsd: 3, facts: { typeLine: 'Artifact', legality: 'legal' } })
    expect(r.totals.valueIfBoughtUsd).toBe(3)
  })
})
