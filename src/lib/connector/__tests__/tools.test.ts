import { describe, it, expect } from 'vitest'
import { getCollectionSummary } from '../tools/get-collection-summary'
import { searchCollection, searchCollectionInput } from '../tools/search-collection'
import { listDecks, listDecksInput } from '../tools/list-decks'
import { getDeck, getDeckInput } from '../tools/get-deck'
import { runTool } from '../server'
import { MAX_RESPONSE_BYTES, byteLength, cutText } from '../limits'
import { hasEq, mockDb, rangeOf, type RecordedQuery } from './mock-db'

const U = 'user-1'
const err = { message: 'db down' }

function allScoped(queries: RecordedQuery[]) {
  // Card library tables (ref_*) are shared reference data with no owner column; every other query must carry the user id.
  for (const q of queries) {
    if (q.table.startsWith('ref_')) continue
    expect(hasEq(q, 'user_id', U), `${q.table} query must carry user_id`).toBe(true)
  }
}

describe('get_collection_summary', () => {
  it('returns counts and every query is user-scoped', async () => {
    const { db, queries } = mockDb((q) => ({ count: q.table === 'user_cards' ? 10 : q.table === 'deck_cards' ? 4 : q.filters.some((f) => f.args[0] === 'is_proxy' && f.args[1] === true) ? 2 : 30 }))
    const r = await getCollectionSummary({ db, userId: U })
    expect(r).toMatchObject({ ok: true, distinctCards: 10, copiesInDecks: 4, proxyCopies: 2 })
    expect(queries.length).toBe(7)
    allScoped(queries)
  })
  it('a database error is LOOKUP_FAILED, never zeros', async () => {
    const { db } = mockDb(() => ({ error: err }))
    const r = await getCollectionSummary({ db, userId: U })
    expect(r).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
  })
})

const card = (i: number) => ({ id: i, oracle_id: `o${i}`, card_name: `Card ${i}`, type_line: 'Artifact' })

describe('search_collection', () => {
  it('happy path labels printing and finish separately and says where copies are', async () => {
    const { db, queries } = mockDb((q) => {
      if (q.table === 'user_cards') return { data: [card(1)], count: 1 }
      if (q.table === 'user_copies') return { data: [
        { id: 11, card_id: 1, printing_id: 'sf-1', finish: 'foil', is_proxy: false, missing: false, location_id: null },
        { id: 12, card_id: 1, printing_id: 'sf-2', finish: 'normal', is_proxy: true, missing: false, location_id: 5 },
      ] }
      if (q.table === 'deck_cards') return { data: [{ copy_id: 11, deck_id: 7 }] }
      if (q.table === 'decks') return { data: [{ id: 7, name: 'Korvold' }] }
      if (q.table === 'user_locations') return { data: [{ id: 5, name: 'Binder A' }] }
      return {}
    })
    const r = (await searchCollection({ db, userId: U }, searchCollectionInput.parse({}))) as never as { items: { oracleId: string; copyCount: number; copies: { printingId: string; finish: string; location: unknown }[] }[]; total: number }
    expect(r.total).toBe(1)
    expect(r.items[0].oracleId).toBe('o1')
    expect(r.items[0].copyCount).toBe(2)
    expect(r.items[0].copies[0]).toMatchObject({ printingId: 'sf-1', finish: 'foil', location: { kind: 'deck', deckId: 7, deckName: 'Korvold' } })
    expect(r.items[0].copies[1].location).toEqual({ kind: 'storage', name: 'Binder A' })
    allScoped(queries)
  })
  it('empty is explicit total 0, distinct from a database error', async () => {
    const empty = mockDb(() => ({ data: [], count: 0 }))
    expect(await searchCollection({ db: empty.db, userId: U }, searchCollectionInput.parse({ query: 'zzz' }))).toMatchObject({ ok: true, total: 0, returned: 0, truncated: false })
    const bad = mockDb(() => ({ error: err }))
    expect(await searchCollection({ db: bad.db, userId: U }, searchCollectionInput.parse({}))).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
  })
  it('escapes LIKE wildcards in the query', async () => {
    const { db, queries } = mockDb(() => ({ data: [], count: 0 }))
    await searchCollection({ db, userId: U }, searchCollectionInput.parse({ query: '50%_off\\' }))
    const like = queries[0].filters.find((f) => f.op === 'ilike')!
    expect(like.args).toEqual(['card_name', '%50\\%\\_off\\\\%'])
  })
  it('page cap is 25 and offset is applied', async () => {
    expect(() => searchCollectionInput.parse({ limit: 26 })).toThrow()
    const { db, queries } = mockDb(() => ({ data: [], count: 0 }))
    await searchCollection({ db, userId: U }, searchCollectionInput.parse({ offset: 50 }))
    expect(rangeOf(queries[0])).toEqual([50, 74])
  })
  it('caps copies at 20 per card but keeps the exact count', async () => {
    const copies = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, card_id: 1, printing_id: 'p', finish: 'normal', is_proxy: false, missing: false, location_id: null }))
    const { db } = mockDb((q) => (q.table === 'user_cards' ? { data: [card(1)], count: 1 } : q.table === 'user_copies' ? { data: copies } : { data: [] }))
    const r = (await searchCollection({ db, userId: U }, searchCollectionInput.parse({}))) as never as { items: { copyCount: number; copies: unknown[]; copiesTruncated: boolean }[] }
    expect(r.items[0]).toMatchObject({ copyCount: 30, copiesTruncated: true })
    expect(r.items[0].copies).toHaveLength(20)
  })
  it('only_free drops cards whose copies are all in decks', async () => {
    const { db } = mockDb((q) => {
      if (q.table === 'user_cards') return { data: [card(1), card(2)], count: 2 }
      if (q.table === 'user_copies') return { data: [
        { id: 11, card_id: 1, printing_id: 'a', finish: 'normal', is_proxy: false, missing: false, location_id: null },
        { id: 21, card_id: 2, printing_id: 'b', finish: 'normal', is_proxy: false, missing: false, location_id: null },
      ] }
      if (q.table === 'deck_cards') return { data: [{ copy_id: 11, deck_id: 7 }] }
      if (q.table === 'decks') return { data: [{ id: 7, name: 'D' }] }
      return { data: [] }
    })
    const r = (await searchCollection({ db, userId: U }, searchCollectionInput.parse({ only_free: true }))) as never as { items: { oracleId: string }[]; total: number }
    expect(r.items.map((i) => i.oracleId)).toEqual(['o2'])
    expect(r.total).toBe(1)
  })
  it('40 KB cap shortens, sets truncated and says so', async () => {
    const cards = Array.from({ length: 25 }, (_, i) => ({ ...card(i + 1), card_name: 'N'.repeat(100), type_line: 'T'.repeat(250) }))
    const copies = cards.flatMap((c) => Array.from({ length: 20 }, (_, j) => ({ id: c.id * 100 + j, card_id: c.id, printing_id: 'p'.repeat(36), finish: 'normal', is_proxy: false, missing: false, location_id: null })))
    const { db } = mockDb((q) => (q.table === 'user_cards' ? { data: cards, count: 25 } : q.table === 'user_copies' ? { data: copies } : { data: [] }))
    const r = (await searchCollection({ db, userId: U }, searchCollectionInput.parse({}))) as never as { returned: number; truncated: boolean; note: string }
    expect(byteLength(r)).toBeLessThanOrEqual(MAX_RESPONSE_BYTES)
    expect(r.returned).toBeLessThan(25)
    expect(r.truncated).toBe(true)
    expect(r.note).toMatch(/Showing \d+ of 25/)
  })
})

const deckRow = (i: number) => ({ id: i, name: `Deck ${i}`, commander_name: 'C', format: 'commander', status: 'active', bracket: '3', card_count: 100, is_active: true })

describe('list_decks', () => {
  it('lists decks with sleeved counts; scoped; page cap 50', async () => {
    expect(() => listDecksInput.parse({ limit: 51 })).toThrow()
    const { db, queries } = mockDb((q) => (q.table === 'decks' ? { data: [deckRow(1), deckRow(2)], count: 2 } : { data: [{ deck_id: 1 }, { deck_id: 1 }, { deck_id: 2 }] }))
    const r = (await listDecks({ db, userId: U }, listDecksInput.parse({}))) as never as { items: { deckId: number; sleevedCount: number }[]; total: number }
    expect(r.total).toBe(2)
    expect(r.items.map((d) => d.sleevedCount)).toEqual([2, 1])
    allScoped(queries)
    expect(queries[0].filters).toContainEqual({ op: 'eq', args: ['is_active', true] })
  })
  it('zero decks is explicit; a database error is not empty', async () => {
    const ok = await listDecks({ db: mockDb(() => ({ data: [], count: 0 })).db, userId: U }, listDecksInput.parse({}))
    expect(ok).toMatchObject({ ok: true, total: 0 })
    const bad = await listDecks({ db: mockDb(() => ({ error: err })).db, userId: U }, listDecksInput.parse({}))
    expect(bad).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
  })
})

const dc = (i: number, cat: string | null, copy: number | null = null) => ({ id: i, card_name: `K${i}`, quantity: 1, categories: cat, is_commander: false, ownership_status: 'original', is_generic: false, copy_id: copy, scryfall_id: `sf${i}`, requested_finish: null })

describe('get_deck', () => {
  it('returns mainboard, counts maybeboard separately, scoped', async () => {
    const { db, queries } = mockDb((q) => {
      if (q.table === 'decks') return { data: [deckRow(3)] }
      if (q.table === 'deck_cards') return { data: [dc(1, '["Creature"]', 9), dc(2, '["Maybeboard"]'), dc(3, null)] }
      if (q.table === 'user_copies') return { data: [{ id: 9, printing_id: 'real', finish: 'foil' }] }
      return { data: [] }
    })
    const r = (await getDeck({ db, userId: U }, getDeckInput.parse({ deck_id: 3 }))) as never as { mainboard: { items: { name: string; sleeved: boolean; printingId: string; finish: string }[]; total: number }; maybeboardCount: number; deck: { sleevedCount: number } }
    expect(r.mainboard.items.map((i) => i.name)).toEqual(['K1', 'K3'])
    expect(r.maybeboardCount).toBe(1)
    expect(r.mainboard.items[0]).toMatchObject({ sleeved: true, printingId: 'real', finish: 'foil' })
    expect(r.deck.sleevedCount).toBe(1)
    allScoped(queries)
    const withMaybe = (await getDeck({ db, userId: U }, getDeckInput.parse({ deck_id: 3, include_maybeboard: true }))) as never as { mainboard: { total: number } }
    expect(withMaybe.mainboard.total).toBe(3)
  })
  it('another user\'s deck is NOT_FOUND, identical to a missing deck', async () => {
    const other = mockDb((q) => (q.table === 'decks' ? { data: [] } : { data: [] }))
    const a = await getDeck({ db: other.db, userId: U }, getDeckInput.parse({ deck_id: 99 }))
    const b = await getDeck({ db: other.db, userId: U }, getDeckInput.parse({ deck_id: 100 }))
    expect(a).toEqual(b)
    expect(a).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', message: 'No deck with that id in your Oracle.' } })
  })
  it('page cap 150 and paging window', async () => {
    expect(() => getDeckInput.parse({ deck_id: 1, limit: 151 })).toThrow()
    const many = Array.from({ length: 200 }, (_, i) => dc(i + 1, '["Land"]'))
    const { db } = mockDb((q) => (q.table === 'decks' ? { data: [deckRow(1)] } : q.table === 'deck_cards' ? { data: many.slice(0, 200) } : { data: [] }))
    const r = (await getDeck({ db, userId: U }, getDeckInput.parse({ deck_id: 1 }))) as never as { mainboard: { returned: number; total: number; truncated: boolean; note: string } }
    expect(r.mainboard).toMatchObject({ total: 200, truncated: true })
    expect(r.mainboard.returned).toBeLessThanOrEqual(150) // facts make rows bigger, so the 40 KB cap can cut a page short; it says so
    expect(r.mainboard.note).toMatch(/offset \d+/)
  })
  it('database error is LOOKUP_FAILED', async () => {
    const r = await getDeck({ db: mockDb(() => ({ error: err })).db, userId: U }, getDeckInput.parse({ deck_id: 1 }))
    expect(r).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
  })
})

// get_deck_health tests live in deck-health-live.test.ts (CC-06d replaced the saved-only tool).

describe('runTool input handling', () => {
  const ctx = { db: mockDb(() => ({ data: [], count: 0 })).db, userId: U, connectionId: 'c1', clientId: 'cl', clientName: 'Claude', gateway: {} as never }
  it.each(['user_id', 'userId'])('a %s argument is INVALID_INPUT, not ignored', async (key) => {
    for (const name of ['get_collection_summary', 'search_collection', 'list_decks']) {
      const r = await runTool(ctx, name, { [key]: 'other' })
      expect(r.isError).toBe(true)
      expect(r.structuredContent).toMatchObject({ error: { code: 'INVALID_INPUT' } })
    }
    const r = await runTool(ctx, 'get_deck', { deck_id: 1, [key]: 'x' })
    expect(r.structuredContent).toMatchObject({ error: { code: 'INVALID_INPUT' } })
  })
  it('a bad value names the field', async () => {
    const r = await runTool(ctx, 'list_decks', { limit: 'lots' })
    expect(r.content[0].text).toMatch(/limit/)
  })
})

describe('string cut', () => {
  it('cuts free text at 300 characters with an ellipsis', () => {
    const s = cutText('a'.repeat(400))!
    expect(s.length).toBe(300)
    expect(s.endsWith('…')).toBe(true)
    expect(cutText('short')).toBe('short')
  })
})
