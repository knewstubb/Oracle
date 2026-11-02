import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase } from '@/test/fake-supabase'

const h = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('@/test/fake-supabase').fakeSupabase> }))

vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }), getAuthUser: () => Promise.resolve({ id: 'user-1' }) }))
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => h.db.client }))

import { PATCH } from './route'

const call = (body: unknown) =>
  PATCH(new NextRequest('http://localhost/api/decks/7', { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: '7' }),
  })

const refs = [
  { name: 'Rocco, Cabaretti Caterer', can_be_commander: true, color_identity: 'G, R, W' },
  { name: 'Tymna the Weaver', can_be_commander: true, color_identity: 'W, B' },
  { name: 'Thrasios, Triton Hero', can_be_commander: true, color_identity: 'G, U' },
]

const deckRow = () => ({ id: 7, user_id: 'user-1', format: 'commander', commander_name: null, colour_identity: '' })

describe('PATCH /api/decks/[id] choosing a commander', () => {
  beforeEach(() => {
    h.db = fakeSupabase({ decks: [deckRow()], ref_cards: refs.map((r) => ({ ...r })), deck_cards: [] })
  })

  it('saves the commander and the deck colour identity the legality check reads', async () => {
    const res = await call({ commander_name: 'Rocco, Cabaretti Caterer', commander_scryfall_id: 'abc' })
    expect(res.status).toBe(200)
    expect(h.db.tables.decks[0]).toMatchObject({ commander_name: 'Rocco, Cabaretti Caterer', colour_identity: 'WRG' })
  })

  it('keeps BOTH commanders colours when the first commander is picked again beside a partner', async () => {
    h.db.tables.deck_cards.push(
      { id: 1, deck_id: 7, user_id: 'user-1', card_name: 'Tymna the Weaver', categories: '["Creature"]', is_commander: true, command_zone_role: null },
      { id: 2, deck_id: 7, user_id: 'user-1', card_name: 'Thrasios, Triton Hero', categories: '["Creature"]', is_commander: true, command_zone_role: 'partner' }
    )
    // Command-zone route already stored the union ...
    h.db.tables.decks[0].colour_identity = 'WUBG'
    // ... then the owner re-picks Tymna with the header picker: the union must survive.
    const res = await call({ commander_name: 'Tymna the Weaver', commander_scryfall_id: 'abc' })
    expect(res.status).toBe(200)
    expect(h.db.tables.decks[0].colour_identity).toBe('WUBG')
  })

  it('replacing the commander keeps the partner colours (old behaviour overwrote with one commander)', async () => {
    h.db.tables.deck_cards.push(
      { id: 1, deck_id: 7, user_id: 'user-1', card_name: 'Tymna the Weaver', categories: '["Creature"]', is_commander: true, command_zone_role: null },
      { id: 2, deck_id: 7, user_id: 'user-1', card_name: 'Thrasios, Triton Hero', categories: '["Creature"]', is_commander: true, command_zone_role: 'partner' },
      { id: 3, deck_id: 7, user_id: 'user-1', card_name: 'Rocco, Cabaretti Caterer', categories: '["Creature"]', is_commander: false, command_zone_role: null }
    )
    await call({ commander_name: 'Rocco, Cabaretti Caterer', commander_scryfall_id: 'abc' })
    // Rocco (GRW) + Thrasios (GU): Tymna lost the flag, Thrasios stays a commander.
    expect(h.db.tables.decks[0].colour_identity).toBe('WURG')
  })
})
