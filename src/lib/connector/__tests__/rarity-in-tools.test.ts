// Rarity of each card's printing in Claude's tools: get_deck (through the real user-scoped Supabase client and the
// MCP result Claude reads), search_collection copies and list_deck_cards_by_ownership rows.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUserScopedClient } from '../user-client'
import { toToolResult } from '../server'
import { getDeck, getDeckInput } from '../tools/get-deck'
import { searchCollection, searchCollectionInput } from '../tools/search-collection'
import { listDeckCardsByOwnership, listByOwnershipInput } from '../tools/list-deck-cards-by-ownership'
import { clearCardTagCaches } from '../../card-tags-read'
import { mockDb, type RecordedQuery } from './mock-db'
import { copyRow, resetIds, viewDb, type LibCard } from './view-db'

const U = 'user-1'
const MIND_STONE = 'cb3d470d-e0f0-44c2-97f7-f31c02cdfbd3'
const MIND_STONE_ORACLE = 'c97361b5-af16-4a7b-af85-a429dbaf4ad2'

// A tiny stand-in for the database's web interface (PostgREST): answers GET /rest/v1/<table> with eq./in. filters,
// the way the live service does, so the real supabase-js client and its query building are what is under test.
type Row = Record<string, unknown>
const TABLES: Record<string, Row[]> = {
  decks: [{ id: 7, user_id: U, name: 'Drake Expectations', commander_name: null, format: 'commander', status: 'active', bracket: null, card_count: 2, is_active: true }],
  deck_cards: [
    { id: 56904, user_id: U, deck_id: 7, card_name: 'Mind Stone', quantity: 1, categories: '["Artifact"]', is_commander: false, ownership_status: 'original', is_generic: false, generic_sleeved: null, copy_id: 900, scryfall_id: MIND_STONE, requested_finish: 'nonfoil' },
    { id: 56905, user_id: U, deck_id: 7, card_name: 'Mystery', quantity: 1, categories: null, is_commander: false, ownership_status: 'not_owned', is_generic: false, generic_sleeved: null, copy_id: null, scryfall_id: 'not-in-library', requested_finish: null },
  ],
  user_copies: [{ id: 900, user_id: U, printing_id: MIND_STONE, finish: 'nonfoil' }],
  ref_printings: [{ scryfall_id: MIND_STONE, oracle_id: MIND_STONE_ORACLE, rarity: 'common', name: 'Mind Stone' }],
}
const unquote = (v: string) => v.replace(/^"(.*)"$/, '$1')
function postgrest(url: URL): Row[] {
  const table = url.pathname.split('/').pop() as string
  let rows = TABLES[table] ?? []
  for (const [col, raw] of url.searchParams) {
    if (['select', 'order', 'offset', 'limit'].includes(col)) continue
    if (raw.startsWith('eq.')) rows = rows.filter((r) => String(r[col]) === unquote(raw.slice(3)))
    else if (raw.startsWith('in.(')) {
      const list = raw.slice(4, -1).split(',').map(unquote)
      rows = rows.filter((r) => list.includes(String(r[col])))
    }
  }
  const cols = (url.searchParams.get('select') ?? '*').split(',').map((c) => c.trim())
  return rows.map((r) => (cols[0] === '*' ? r : Object.fromEntries(cols.map((c) => [c, r[c] ?? null]))))
}

describe('get_deck through the real user-scoped client', () => {
  beforeEach(() => {
    clearCardTagCaches()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      return new Response(JSON.stringify(postgrest(url)), { status: 200, headers: { 'content-type': 'application/json' } })
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('shows rarity common for the Mind Stone printing in the answer Claude reads', async () => {
    const db = createUserScopedClient('user-token')
    const result = toToolResult(await getDeck({ db, userId: U }, getDeckInput.parse({ deck_id: 7 })))
    const text = JSON.parse(result.content[0].text) as { mainboard: { items: { name: string; printingId: string; rarity?: string; rarity_unavailable?: true }[] } }
    const mind = text.mainboard.items.find((i) => i.name === 'Mind Stone')!
    expect(mind).toMatchObject({ printingId: MIND_STONE, rarity: 'common' })
    // A printing the card library does not have: rarity is left out, never guessed.
    const mystery = text.mainboard.items.find((i) => i.name === 'Mystery')!
    expect(mystery.rarity).toBeUndefined()
    expect(mystery.rarity_unavailable).toBeUndefined()
  })
})

describe('search_collection shows the rarity of each copy', () => {
  const LIB: LibCard[] = [{ name: 'Mind Stone', type_line: 'Artifact', oracle_text: 'Tap: add C.', mana_value: 2, color_identity: '' }]
  beforeEach(() => clearCardTagCaches())

  it('each copy carries the rarity of its own printing, in one batched read', async () => {
    resetIds()
    const a = { ...copyRow(LIB[0], { box: 'Unsorted' }), printing_id: 'p-cmm' }
    const b = { ...copyRow(LIB[0], { deck: 'Drake Expectations' }), printing_id: 'p-c15' }
    const { db, queries } = viewDb([a, b], { library: LIB, printings: [{ scryfall_id: 'p-cmm', oracle_id: 'o-Mind Stone', rarity: 'common' }, { scryfall_id: 'p-c15', oracle_id: 'o-Mind Stone', rarity: 'uncommon' }] })
    const r = (await searchCollection({ db, userId: U }, searchCollectionInput.parse({ query: 'Mind Stone' }))) as never as { items: { copies: { printingId: string; rarity?: string; pauperLegal?: boolean }[] }[] }
    const byPrinting = Object.fromEntries(r.items[0].copies.map((c) => [c.printingId, c]))
    expect(byPrinting['p-cmm'].rarity).toBe('common')
    expect(byPrinting['p-c15'].rarity).toBe('uncommon')
    expect(r.items[0].copies.some((c) => 'pauperLegal' in c)).toBe(false)
    expect(queries.filter((q) => q.table === 'ref_printings' && q.columns.includes('rarity'))).toHaveLength(1)
  })

  it('a failed rarity read is marked, never guessed', async () => {
    resetIds()
    const base = viewDb([copyRow(LIB[0], { box: 'Unsorted' })], { library: LIB }).db
    const down = mockDb(() => ({ error: { message: 'down' } })).db
    // Only the rarity read fails; the other card library reads still work.
    const db = { select: (t: string, c: string, o?: never) => (t === 'ref_printings' && c.includes('rarity') ? down : base).select(t, c, o) }
    const r = (await searchCollection({ db, userId: U }, searchCollectionInput.parse({ query: 'Mind Stone' }))) as never as { items: { copies: { rarity?: string; rarity_unavailable?: true }[] }[] }
    expect(r.items[0].copies[0]).toMatchObject({ rarity_unavailable: true })
    expect(r.items[0].copies[0].rarity).toBeUndefined()
  })
})

describe('list_deck_cards_by_ownership shows the rarity of the printing in each slot', () => {
  const slot = (id: number, name: string, status: string, copy: number | null, printing: string | null) => ({ id, deck_id: 1, card_name: name, quantity: 1, categories: null, ownership_status: status, is_generic: false, copy_id: copy, scryfall_id: printing })
  const resolve = (failRarity = false) => (q: RecordedQuery) => {
    if (q.table === 'decks') return { data: [{ id: 1, name: 'Drake Expectations' }] }
    if (q.table === 'deck_cards') return { data: [slot(1, 'Mind Stone', 'proxy', 50, 'p-asked'), slot(2, 'Rhystic Study', 'not_owned', null, 'p-rhystic')] }
    if (q.table === 'user_copies') return { data: [{ id: 50, printing_id: 'p-proxy' }] }
    if (q.table === 'ref_printings' && q.columns.includes('rarity')) {
      if (failRarity) return { error: { message: 'down' } }
      return { data: [{ scryfall_id: 'p-proxy', oracle_id: 'o1', rarity: 'common' }, { scryfall_id: 'p-asked', oracle_id: 'o1', rarity: 'uncommon' }, { scryfall_id: 'p-rhystic', oracle_id: 'o2', rarity: 'rare' }] }
    }
    return { data: [] }
  }
  type Res = { items: { name: string; rarity?: string; rarity_unavailable?: true; pauperLegal?: boolean }[] }

  it('a proxy uses its own copy\'s printing; a card not owned uses the printing the slot asks for', async () => {
    const { db } = mockDb(resolve())
    const r = (await listDeckCardsByOwnership({ db, userId: U }, listByOwnershipInput.parse({}))) as never as Res
    const by = Object.fromEntries(r.items.map((i) => [i.name, i]))
    expect(by['Mind Stone'].rarity).toBe('common')
    expect(by['Rhystic Study'].rarity).toBe('rare')
    expect(r.items.some((i) => 'pauperLegal' in i)).toBe(false)
  })

  it('a failed rarity read is marked on each row, and the list still comes back', async () => {
    const { db } = mockDb(resolve(true))
    const r = (await listDeckCardsByOwnership({ db, userId: U }, listByOwnershipInput.parse({}))) as never as Res
    expect(r.items).toHaveLength(2)
    for (const i of r.items) expect(i).toMatchObject({ rarity_unavailable: true })
  })
})
