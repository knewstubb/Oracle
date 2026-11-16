import { describe, it, expect } from 'vitest'
import { getCollectionSummary } from '../tools/get-collection-summary'
import { searchCollection, searchCollectionInput } from '../tools/search-collection'
import { listDecks, listDecksInput } from '../tools/list-decks'
import { getDeck, getDeckInput } from '../tools/get-deck'
import { runTool } from '../server'
import { MAX_RESPONSE_BYTES, byteLength, cutText } from '../limits'
import { hasEq, mockDb, type RecordedQuery } from './mock-db'
import { copyRow, resetIds, viewDb, type LibCard } from './view-db'
import { readFileSync } from 'node:fs'
import path from 'node:path'

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

const lib = (name: string, extra: Partial<LibCard> = {}): LibCard => ({ name, type_line: 'Artifact', oracle_text: 'x', mana_value: 1, color_identity: '', ...extra })
type Res = { ok: true; items: { oracleId: string; name: string; kind: string; copyCount: number; copies: { printingId: string; finish: string; location: Record<string, unknown> }[]; copiesTruncated: boolean }[]; total: number; totalCopies: number; returned: number; truncated: boolean; note?: string }
const run = (db: never, input: object = {}) => searchCollection({ db, userId: U }, searchCollectionInput.parse(input)) as never as Promise<Res>

describe('search_collection (CC-07 S1: reads the view)', () => {
  it('labels printing and finish separately and says where copies are, including In your hand and Missing', async () => {
    resetIds()
    const sol = lib('Sol Ring')
    const { db, queries } = viewDb([
      copyRow(sol, { deck: 'Korvold' }), copyRow(sol, { box: 'Binder A' }), copyRow(sol, { hand: true }), copyRow(sol, { missing: true }),
    ], { library: [sol] })
    const r = await run(db as never)
    expect(r.total).toBe(1)
    expect(r.totalCopies).toBe(4)
    expect(r.items[0].oracleId).toBe('o-Sol Ring')
    expect(r.items[0].copies.map((c) => c.location)).toEqual([
      { kind: 'deck', deckId: 1, deckName: 'Korvold' }, { kind: 'storage', name: 'Binder A' }, { kind: 'in_hand' }, { kind: 'missing' },
    ])
    expect(r.items[0].copies[0]).toMatchObject({ printingId: 'sf-Sol Ring', finish: 'normal' })
    allScoped(queries)
  })
  it('a card with originals and proxies is two rows with the right counts, original first', async () => {
    resetIds()
    const sol = lib('Sol Ring')
    const { db } = viewDb([copyRow(sol, { proxy: true, box: 'A' }), copyRow(sol, { box: 'A' }), copyRow(sol, { box: 'A' })], { library: [sol] })
    const r = await run(db as never)
    expect(r.total).toBe(2)
    expect(r.totalCopies).toBe(3)
    expect(r.items.map((i) => [i.kind, i.copyCount])).toEqual([['original', 2], ['proxy', 1]])
  })
  it('only_free leaves out copies in decks, In your hand and Missing (the app-wide supply rule)', async () => {
    resetIds()
    const a = lib('Alpha'), b = lib('Beta'), c = lib('Gamma'), d = lib('Delta')
    const { db } = viewDb([copyRow(a, { deck: 'D' }), copyRow(b, { hand: true }), copyRow(c, { missing: true }), copyRow(d, { box: 'X' }), copyRow(d, { deck: 'D' })], { library: [a, b, c, d] })
    const r = await run(db as never, { only_free: true })
    expect(r.items.map((i) => i.name)).toEqual(['Delta'])
    expect(r.totalCopies).toBe(1)
  })
  it('proxy switches: include_proxies=false and only_proxies; both together is INVALID_INPUT', async () => {
    resetIds()
    const sol = lib('Sol Ring')
    const { db } = viewDb([copyRow(sol, { box: 'A' }), copyRow(sol, { proxy: true, box: 'A' })], { library: [sol] })
    expect((await run(db as never, { include_proxies: false })).items.map((i) => i.kind)).toEqual(['original'])
    expect((await run(db as never, { only_proxies: true })).items.map((i) => i.kind)).toEqual(['proxy'])
    expect(() => searchCollectionInput.parse({ only_proxies: true, include_proxies: false })).toThrow()
  })
  it('stays exact past the old 3,000-card ceiling (3,500 cards, 3,600 copies)', async () => {
    resetIds()
    const rows = Array.from({ length: 3500 }, (_, i) => copyRow(lib(`Card ${String(i).padStart(4, '0')}`), { box: 'A' }))
    for (let i = 0; i < 100; i++) rows.push(copyRow(lib('Card 0000'), { box: 'A' }))
    const { db } = viewDb(rows, { library: [] })
    const r = await run(db as never, { only_free: true, offset: 3490 })
    expect(r.total).toBe(3500)
    expect(r.totalCopies).toBe(3600)
    expect(r.returned).toBe(10)
    expect(r.note ?? '').not.toMatch(/first 3000/)
  })
  it('empty is explicit total 0, distinct from a database error', async () => {
    const empty = viewDb([])
    expect(await run(empty.db as never, { query: 'zzz' })).toMatchObject({ ok: true, total: 0, totalCopies: 0, returned: 0, truncated: false })
    const bad = mockDb(() => ({ error: err }))
    expect(await searchCollection({ db: bad.db, userId: U }, searchCollectionInput.parse({}))).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
  })
  it('a failure on any later read is LOOKUP_FAILED, not a short list', async () => {
    resetIds()
    const sol = lib('Sol Ring')
    // The second read of the view (page detail) fails.
    let n = 0
    const base = viewDb([copyRow(sol, { box: 'A' })], { library: [sol], onView: () => { n++ } })
    const db = { select: (t: string, c: string, o?: never) => (t === 'connector_collection_copies' && n >= 1 ? mockDb(() => ({ error: err })).db.select(t, c, o) : base.db.select(t, c, o)) }
    expect(await searchCollection({ db: db as never, userId: U }, searchCollectionInput.parse({}))).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
  })
  it('escapes LIKE wildcards in the query', async () => {
    const { db, queries } = viewDb([])
    await run(db as never, { query: '50%_off\\' })
    const like = queries[0].filters.find((f) => f.op === 'ilike')!
    expect(like.args).toEqual(['card_name', '%50\\%\\_off\\\\%'])
  })
  it('page cap is 25 and offset is applied', async () => {
    expect(() => searchCollectionInput.parse({ limit: 26 })).toThrow()
    resetIds()
    const rows = Array.from({ length: 60 }, (_, i) => copyRow(lib(`C ${String(i).padStart(2, '0')}`), { box: 'A' }))
    const { db } = viewDb(rows)
    const r = await run(db as never, { offset: 50 })
    expect(r.items.map((i) => i.name)[0]).toBe('C 50')
    expect(r.returned).toBe(10)
    const p1 = await run(db as never, {})
    expect(p1.returned).toBe(25)
    expect(p1.note).toMatch(/Showing 25 of 60.*offset 25/)
  })
  it('caps copies at 20 per row but keeps the exact count', async () => {
    resetIds()
    const sol = lib('Sol Ring')
    const { db } = viewDb(Array.from({ length: 30 }, () => copyRow(sol, { box: 'A' })), { library: [sol] })
    const r = await run(db as never)
    expect(r.items[0]).toMatchObject({ copyCount: 30, copiesTruncated: true })
    expect(r.items[0].copies).toHaveLength(20)
  })
  it('40 KB cap shortens, sets truncated and says so', async () => {
    resetIds()
    const libs = Array.from({ length: 25 }, (_, i) => lib(`${'N'.repeat(100)}${i}`, { type_line: 'T'.repeat(250), oracle_text: 'w'.repeat(900) }))
    const rows = libs.flatMap((l) => Array.from({ length: 20 }, () => copyRow(l, { box: 'A'.repeat(60) })))
    const { db } = viewDb(rows, { library: libs })
    const r = await run(db as never)
    expect(byteLength(r)).toBeLessThanOrEqual(MAX_RESPONSE_BYTES)
    expect(r.returned).toBeLessThan(25)
    expect(r.truncated).toBe(true)
    expect(r.note).toMatch(/Showing \d+ of 25/)
  })
  it('the old scan code is gone', () => {
    const src = readFileSync(path.resolve(__dirname, '../tools/search-collection.ts'), 'utf8')
    expect(src).not.toMatch(/SCAN_CAP|first \$\{?3000|copyViews/)
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
