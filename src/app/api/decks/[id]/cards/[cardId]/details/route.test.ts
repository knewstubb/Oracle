import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeClient, type FakeCall, type FakeResult } from '@/lib/card-details/fake-client'
import { resetWhyColumnCache } from '@/lib/card-details/why-column'
import { clearRefCaches } from '@/lib/card-details/ref-cache'
import { clearCardTagCaches } from '@/lib/card-tags-read'

let handler: (c: FakeCall) => FakeResult
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => fakeClient((c) => handler(c)) }))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }) }))
import { GET } from './route'

const get = (query = '') =>
  GET(new NextRequest(`http://localhost/api/decks/5/cards/1/details${query}`), { params: Promise.resolve({ id: '5', cardId: '1' }) })
const ok = (data: unknown): FakeResult => ({ data, error: null })
const has = (c: FakeCall, col: string, val: unknown) => c.filters.some(([, k, v]) => k === col && v === val)

function happy(opts: { whyColumn: boolean; deckOwner?: boolean } = { whyColumn: true }): (c: FakeCall) => FakeResult {
  return (c) => {
    switch (c.table) {
      case 'decks':
        if (c.columns === 'name') return ok(opts.deckOwner === false ? null : { name: 'Rocco' })
        return ok([{ id: 5, name: 'Rocco', format: 'commander' }])
      case 'deck_cards':
        if (c.columns?.startsWith('id, card_name')) {
          if (c.columns.includes('why_here') && !opts.whyColumn) return { data: null, error: { message: 'no column', code: '42703' } }
          const slot = { id: 1, card_name: 'Elvish Archdruid', scryfall_id: 'sf1', set_code: 'aaa', copy_id: null, requested_finish: 'nonfoil' }
          return ok(c.columns.includes('why_here') ? { ...slot, why_here: 'Lord and mana engine' } : slot)
        }
        if (c.columns === 'copy_id, scryfall_id') return ok({ copy_id: null, scryfall_id: 'sf1' })
        if (c.columns === 'id') return ok({ id: 1 })
        return ok([])
      case 'ref_printings':
        if (c.columns === 'oracle_id') return ok({ oracle_id: 'o1' })
        return ok([
          { oracle_id: 'o1', scryfall_id: 'sf1', set_code: 'aaa', set_name: 'A', collector_number: '45', rarity: 'rare', finishes: ['nonfoil', 'foil'], price_usd: '2.10', price_usd_foil: null, released_at: '2020-01-01', image_uri_small: null, image_uri_normal: null, legality_commander: 'legal' },
        ])
      case 'ref_cards':
        return ok([{ name: 'Elvish Archdruid', oracle_text: 'Lord', type_line: 'Creature', mana_cost: '{1}{G}{G}', mana_value: 3, color_identity: 'G', power: '2', toughness: '2' }])
      case 'ref_card_tags':
        return ok([{ oracle_id: 'o1', tag_key: 'ramp' }])
      case 'ref_tag_list':
        return ok([{ key: 'ramp', display_name: 'Ramp', kind: 'broad', display_order: 3 }])
      case 'user_copies':
        return ok([{ id: 100, is_proxy: false, missing: false, condition: 'LP', finish: 'nonfoil', printing_id: 'sf1', location_id: 3, deck_cards: null, user_cards: { oracle_id: 'o1', card_name: 'Elvish Archdruid' } }])
      case 'user_locations':
        return ok([{ id: 3, name: 'Binder 2' }])
      case 'ref_rulings':
        return ok([{ published_at: '2007-10-01', comment: 'A ruling.' }])
    }
    return ok([])
  }
}

describe('GET /api/decks/[id]/cards/[cardId]/details', () => {
  beforeEach(() => {
    resetWhyColumnCache()
    clearCardTagCaches()
    clearRefCaches()
  })

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
  describe('in parts', () => {
    it('answers the Overview without printings, copies or rulings and without reading them', async () => {
      const seen: FakeCall[] = []
      const base = happy({ whyColumn: true })
      handler = (c) => (seen.push(c), base(c))
      const res = await get('?part=overview')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({ cardName: 'Elvish Archdruid', oracleId: 'o1', deckName: 'Rocco', whyAvailable: true, why: 'Lord and mana engine', commanderLegality: 'legal' })
      expect(body.facts.manaCost).toBe('{1}{G}{G}')
      expect(body.tags).toHaveLength(1)
      expect(body.slotPrintings.map((p: { finish: string }) => p.finish)).toEqual(['nonfoil', 'foil'])
      expect(body.copies).toBeUndefined()
      expect(body.rulings).toBeUndefined()
      const tables = seen.map((c) => c.table)
      for (const t of ['user_copies', 'user_locations', 'ref_rulings']) expect(tables).not.toContain(t)
      // Each table is read once: the deck once (not three times), the printing once.
      expect(tables.filter((t) => t === 'decks')).toHaveLength(1)
      expect(tables.filter((t) => t === 'ref_printings')).toHaveLength(1)
    })
    it('skips the probe for the Why column: one slot read when the column exists, a second without it when it does not', async () => {
      const seen: FakeCall[] = []
      const base = happy({ whyColumn: false })
      handler = (c) => (seen.push(c), base(c))
      const body = await (await get('?part=overview')).json()
      expect(body.whyAvailable).toBe(false)
      expect(body.why).toBeNull()
      expect(seen.filter((c) => c.table === 'deck_cards')).toHaveLength(2)
      // The next open within a minute knows the column is missing and reads the slot once.
      seen.length = 0
      await get('?part=overview')
      expect(seen.filter((c) => c.table === 'deck_cards')).toHaveLength(1)
    })
    it('answers the collection part with printings (owned counts) and copies, and the rulings part with rulings', async () => {
      handler = happy({ whyColumn: true })
      const col = await (await get('?part=collection&oracleId=o1')).json()
      expect(col.printings.map((p: { finish: string; owned: number }) => [p.finish, p.owned])).toEqual([['nonfoil', 1], ['foil', 0]])
      expect(col.copies[0]).toMatchObject({ copyId: 100, state: 'open', where: { kind: 'storage', name: 'Binder 2' } })
      const rul = await (await get('?part=rulings&oracleId=o1')).json()
      expect(rul).toEqual({ rulings: [{ publishedAt: '2007-10-01', comment: 'A ruling.' }] })
    })
    it('reads the copies in one query filtered by the card and the user', async () => {
      const seen: FakeCall[] = []
      const base = happy({ whyColumn: true })
      handler = (c) => (seen.push(c), base(c))
      await get('?part=collection&oracleId=o1')
      const copies = seen.filter((c) => c.table === 'user_copies')
      expect(copies).toHaveLength(1)
      expect(has(copies[0], 'user_cards.oracle_id', 'o1')).toBe(true)
      expect(has(copies[0], 'user_id', 'user-1')).toBe(true)
      expect(seen.some((c) => c.table === 'user_cards')).toBe(false)
    })
    it("answers 404 for another user's deck in every part", async () => {
      handler = happy({ whyColumn: true, deckOwner: false })
      for (const q of ['?part=overview', '?part=collection&oracleId=o1', '?part=rulings&oracleId=o1']) expect((await get(q)).status).toBe(404)
    })
    it('answers 400 for an unknown part or a missing oracle id', async () => {
      handler = happy({ whyColumn: true })
      expect((await get('?part=nope')).status).toBe(400)
      expect((await get('?part=collection')).status).toBe(400)
      expect((await get('?part=rulings')).status).toBe(400)
    })
    it('answers 500 when a part fails', async () => {
      const base = happy({ whyColumn: true })
      handler = (c) => (c.table === 'user_copies' ? { data: null, error: { message: 'down' } } : base(c))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      expect((await get('?part=collection&oracleId=o1')).status).toBe(500)
    })
  })
})
