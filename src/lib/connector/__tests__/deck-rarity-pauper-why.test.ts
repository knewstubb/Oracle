// get_deck for Claude: rarity of the printing in use, Pauper legality by any printing, Tags, and the owner's Why (saved, then read back).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeClient, type FakeCall, type FakeResult } from '@/lib/card-details/fake-client'
import { resetWhyColumnCache } from '@/lib/card-details/why-column'
import { clearCardTagCaches } from '../../card-tags-read'
import { getDeck, getDeckInput } from '../tools/get-deck'
import { CONNECTOR_TOOLS } from '../tools'
import { mockDb, type RecordedQuery } from './mock-db'

let saved: Record<number, string | null> = {}
vi.mock('@/lib/supabase', () => ({
  createAdminClient: () =>
    fakeClient((c: FakeCall): FakeResult => {
      if (c.table === 'decks') return { data: { id: 1 }, error: null }
      if (c.columns === 'why_here') return { data: [], error: null } // the Why column exists
      if (c.op === 'update') {
        saved[2] = (c.values as { why_here: string | null }).why_here
        return { data: { id: 2 }, error: null }
      }
      return { data: [], error: null }
    }),
}))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }) }))
import { PUT } from '@/app/api/decks/[id]/cards/[cardId]/why/route'

const U = 'user-1'
const DECK = { id: 1, name: 'Pauper Elves', commander_name: null, format: 'pauper', status: 'active', bracket: null, card_count: 3, is_active: true }
const slot = (id: number, name: string, printing: string | null) => ({ id, card_name: name, quantity: 1, categories: null, is_commander: false, ownership_status: 'original', is_generic: false, copy_id: null, scryfall_id: printing, requested_finish: 'nonfoil' })
// Rancor: owner's printing is rare, another printing was common. Mythic Thing: never common. Mystery: printing not in the library.
const OWN = [
  { scryfall_id: 'p-rancor-rare', oracle_id: 'o-rancor', rarity: 'rare' },
  { scryfall_id: 'p-thing', oracle_id: 'o-thing', rarity: 'mythic' },
]
function resolve(whyRows: () => object, printingFail = false) {
  return (q: RecordedQuery) => {
    if (q.table === 'decks') return { data: [DECK] }
    if (q.table === 'deck_cards' && q.columns === 'id, why_here') return whyRows()
    if (q.table === 'deck_cards') return { data: [slot(1, 'Rancor', 'p-rancor-rare'), slot(2, 'Mythic Thing', 'p-thing'), slot(3, 'Mystery', 'p-none')] }
    if (q.table === 'ref_printings' && q.columns === 'scryfall_id, oracle_id, rarity') return printingFail ? { error: { message: 'down' } } : { data: OWN }
    if (q.table === 'ref_printings' && q.columns === 'oracle_id') return { data: [{ oracle_id: 'o-rancor' }] } // some printing of Rancor was common
    if (q.table === 'ref_printings' && q.columns === 'scryfall_id, oracle_id') return { data: OWN.map(({ scryfall_id, oracle_id }) => ({ scryfall_id, oracle_id })) }
    if (q.table === 'ref_card_tags') return { data: [{ oracle_id: 'o-rancor', tag_key: 'ramp' }] }
    return { data: [] }
  }
}
type Item = { name: string; rarity?: string; pauperLegal?: boolean; rarity_unavailable?: true; tags?: string[]; why?: string }
const read = async (r: ReturnType<typeof resolve>) => {
  const { db } = mockDb(r)
  const out = (await getDeck({ db, userId: U }, getDeckInput.parse({ deck_id: 1 }))) as never as { tagNames: Record<string, string>; mainboard: { items: Item[] } }
  return { out, by: Object.fromEntries(out.mainboard.items.map((i) => [i.name, i])) as Record<string, Item> }
}

beforeEach(() => {
  saved = {}
  resetWhyColumnCache()
  clearCardTagCaches()
})

describe('get_deck rarity and Pauper legality', () => {
  it('shows the rarity of the printing in use and Pauper legality by any printing', async () => {
    const { by } = await read(resolve(() => ({ data: [] })))
    expect(by['Rancor']).toMatchObject({ rarity: 'rare', pauperLegal: true }) // legal, but the owner's copy is a rare printing
    expect(by['Mythic Thing']).toMatchObject({ rarity: 'mythic', pauperLegal: false })
    expect(by['Mystery']).not.toHaveProperty('rarity')
  })
  it('marks rarity_unavailable when the read fails, never a guess', async () => {
    const { by } = await read(resolve(() => ({ data: [] }), true))
    expect(by['Rancor'].rarity_unavailable).toBe(true)
    expect(by['Rancor'].rarity).toBeUndefined()
  })
  it('keeps the Tags Claude already sees', async () => {
    const { out, by } = await read(resolve(() => ({ data: [] })))
    expect(by['Rancor'].tags!.map((c) => out.tagNames[c])).toEqual(['Ramp'])
  })
  it('tells Claude what the fields mean', () => {
    const d = CONNECTOR_TOOLS.find((t) => t.name === 'get_deck')!.description
    expect(d).toMatch(/pauperLegal/)
    expect(d).toMatch(/legal, but your copy is a rare printing/)
  })
})

describe("Why it's here: saved, then read back", () => {
  it('the owner saves a Why, and a later get_deck returns it on that slot only', async () => {
    const res = await PUT(new NextRequest('http://localhost/x', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ why: '  Makes my elves huge  ' }) }), { params: Promise.resolve({ id: '1', cardId: '2' }) })
    expect(res.status).toBe(200)
    expect(saved[2]).toBe('Makes my elves huge') // trimmed
    const { by } = await read(resolve(() => ({ data: Object.entries(saved).map(([id, why_here]) => ({ id: Number(id), why_here })) })))
    expect(by['Mythic Thing'].why).toBe('Makes my elves huge')
    expect(by['Rancor'].why).toBeUndefined()
  })
  it('reads a stored Why for the slot and leaves it out when empty or when the column is missing', async () => {
    const { by } = await read(resolve(() => ({ data: [{ id: 2, why_here: 'Makes my elves huge' }, { id: 1, why_here: null }] })))
    expect(by['Mythic Thing'].why).toBe('Makes my elves huge')
    expect(by['Rancor'].why).toBeUndefined()
    const missing = await read(resolve(() => ({ error: { code: '42703', message: 'no column' } })))
    expect(missing.by['Mythic Thing'].why).toBeUndefined()
    expect(missing.by['Mythic Thing'].rarity).toBe('mythic') // the deck still reads
  })
})

describe('size', () => {
  const bigDeck = (why: string | null) => {
    const names = Array.from({ length: 100 }, (_, i) => `Elvish Witness ${i}`)
    const idx = (id: string) => Number(id.slice(-12))
    const inList = (q: RecordedQuery) => (q.filters.find((f) => f.op === 'in')?.args[1] ?? []) as string[]
    return mockDb((q) => {
      if (q.table === 'decks') return { data: [{ ...DECK, card_count: 100 }] }
      if (q.table === 'deck_cards' && q.columns === 'id, why_here') return { data: names.map((_, i) => ({ id: i + 1, why_here: why })) }
      if (q.table === 'deck_cards') return { data: names.map((n, i) => ({ ...slot(i + 1, n, `12345678-1234-1234-1234-${String(i).padStart(12, '0')}`), categories: '["Creature","Ramp"]' })) }
      if (q.table === 'ref_printings' && q.columns === 'scryfall_id, oracle_id, rarity') return { data: inList(q).map((id) => ({ scryfall_id: id, oracle_id: `o-${idx(id)}`, rarity: 'uncommon' })) }
      if (q.table === 'ref_printings' && q.columns === 'oracle_id') return { data: inList(q).map((o) => ({ oracle_id: o })) }
      if (q.table === 'ref_printings') return { data: inList(q).map((id) => ({ scryfall_id: id, oracle_id: `o-${idx(id)}` })) }
      if (q.table === 'ref_card_tags') return { data: inList(q).flatMap((id) => ['ramp', 'token_generator', 'direct_damage'].map((k) => ({ oracle_id: id, tag_key: k }))) }
      return { data: [] }
    }).db
  }
  type Big = { mainboard: { returned: number; total: number; truncated: boolean; note?: string; items: Item[] } }
  it('a 100-card deck with rarity, Pauper legality and Tags on every card still comes back whole in one page', async () => {
    const r = (await getDeck({ db: bigDeck(null), userId: U }, getDeckInput.parse({ deck_id: 1 }))) as never as Big
    expect(r.mainboard.items[0]).toMatchObject({ rarity: 'uncommon', pauperLegal: true })
    expect(r.mainboard.returned).toBe(100)
    expect(r.mainboard.truncated).toBe(false)
  })
  it('when every card also has a long Why, the answer pages and says so instead of silently dropping cards', async () => {
    const r = (await getDeck({ db: bigDeck('x'.repeat(200)), userId: U }, getDeckInput.parse({ deck_id: 1 }))) as never as Big
    expect(r.mainboard.truncated).toBe(true)
    expect(r.mainboard.note).toMatch(/offset/)
    expect(r.mainboard.total).toBe(100)
  })
})
