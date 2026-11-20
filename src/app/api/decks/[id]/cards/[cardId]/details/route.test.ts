import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeClient, type FakeCall, type FakeResult } from '@/lib/card-details/fake-client'
import { resetWhyColumnCache } from '@/lib/card-details/why-column'

let handler: (c: FakeCall) => FakeResult
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => fakeClient((c) => handler(c)) }))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }) }))
import { GET } from './route'

const get = () =>
  GET(new NextRequest('http://localhost/api/decks/5/cards/1/details'), { params: Promise.resolve({ id: '5', cardId: '1' }) })
const ok = (data: unknown): FakeResult => ({ data, error: null })
const has = (c: FakeCall, col: string, val: unknown) => c.filters.some(([, k, v]) => k === col && v === val)

function happy(opts: { whyColumn: boolean; deckOwner?: boolean } = { whyColumn: true }): (c: FakeCall) => FakeResult {
  return (c) => {
    switch (c.table) {
      case 'decks':
        if (c.columns === 'id') return ok(opts.deckOwner === false ? null : { id: 5 })
        if (c.columns === 'name') return ok({ name: 'Rocco' })
        return ok([{ id: 5, name: 'Rocco', format: 'commander' }])
      case 'deck_cards':
        if (c.columns === 'why_here') return opts.whyColumn ? ok([]) : { data: null, error: { message: 'no column', code: '42703' } }
        if (c.columns?.startsWith('id,'))
          return ok({ id: 1, card_name: 'Elvish Archdruid', scryfall_id: 'sf1', set_code: 'aaa', copy_id: null, requested_finish: 'nonfoil', why_here: 'Lord and mana engine' })
        return ok([])
      case 'ref_printings':
        if (c.columns === 'oracle_id') return ok({ oracle_id: 'o1' })
        return ok([
          { scryfall_id: 'sf1', set_code: 'aaa', set_name: 'A', collector_number: '45', rarity: 'rare', finishes: ['nonfoil', 'foil'], price_usd: '2.10', price_usd_foil: null, released_at: '2020-01-01', image_uri_small: null, image_uri_normal: null },
        ])
      case 'ref_cards':
        return ok([{ name: 'Elvish Archdruid', oracle_text: 'Lord', type_line: 'Creature', mana_cost: '{1}{G}{G}', mana_value: 3, color_identity: 'G', power: '2', toughness: '2' }])
      case 'ref_card_tags':
        return ok([{ tag_key: 'ramp' }])
      case 'ref_tag_list':
        return ok([{ key: 'ramp', display_name: 'Ramp', kind: 'broad', display_order: 3 }])
      case 'user_cards':
        return ok([{ id: 11 }])
      case 'user_copies':
        return ok([{ id: 100, is_proxy: false, missing: false, condition: 'LP', finish: 'nonfoil', printing_id: 'sf1', location_id: 3, deck_cards: null }])
      case 'user_locations':
        return ok([{ id: 3, name: 'Binder 2' }])
      case 'ref_rulings':
        return ok([{ published_at: '2007-10-01', comment: 'A ruling.' }])
    }
    return ok([])
  }
}

describe('GET /api/decks/[id]/cards/[cardId]/details', () => {
  beforeEach(() => resetWhyColumnCache())

  it('returns facts, tags, printings, copies, rulings and the Why line', async () => {
    handler = happy({ whyColumn: true })
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.facts).toMatchObject({ name: 'Elvish Archdruid', manaValue: 3, power: '2' })
    expect(body.tags).toEqual([{ key: 'ramp', displayName: 'Ramp', kind: 'broad' }])
    expect(body.printings.map((p: { finish: string; priceUsd: number | null; owned: number }) => [p.finish, p.priceUsd, p.owned])).toEqual([
      ['nonfoil', 2.1, 1],
      ['foil', null, 0],
    ])
    expect(body.copies[0]).toMatchObject({ copyId: 100, state: 'open', action: 'sleeve_here', where: { kind: 'storage', name: 'Binder 2' } })
    expect(body.rulings).toEqual([{ publishedAt: '2007-10-01', comment: 'A ruling.' }])
    expect(body.whyAvailable).toBe(true)
    expect(body.why).toBe('Lord and mana engine')
  })

  it('hides Why when the column is missing', async () => {
    handler = happy({ whyColumn: false })
    const body = await (await get()).json()
    expect(body.whyAvailable).toBe(false)
    expect(body.why).toBeNull()
  })

  it("answers 404 for another user's deck", async () => {
    handler = happy({ whyColumn: true, deckOwner: false })
    expect((await get()).status).toBe(404)
  })

  it('answers 500, not an empty list, when a lookup fails', async () => {
    const base = happy({ whyColumn: true })
    handler = (c) => (c.table === 'ref_rulings' ? { data: null, error: { message: 'down' } } : base(c))
    const res = await get()
    expect(res.status).toBe(500)
  })

  it('looks rulings up by oracle_id', async () => {
    const seen: FakeCall[] = []
    const base = happy({ whyColumn: true })
    handler = (c) => (seen.push(c), base(c))
    await get()
    const r = seen.find((c) => c.table === 'ref_rulings')!
    expect(has(r, 'oracle_id', 'o1')).toBe(true)
  })
})
