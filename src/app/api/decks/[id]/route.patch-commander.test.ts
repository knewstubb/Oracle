import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ update: vi.fn(), refCard: { name: 'Rocco, Cabaretti Caterer', can_be_commander: true, color_identity: 'G, R, W' } as unknown }))

vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }), getAuthUser: () => Promise.resolve({ id: 'user-1' }) }))
vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.limit = () => chain
      chain.maybeSingle = async () =>
        table === 'decks' ? { data: { id: 7, format: 'commander' }, error: null } : { data: h.refCard, error: null }
      chain.update = (payload: unknown) => {
        h.update(payload)
        return { eq: () => ({ eq: async () => ({ error: null }) }) }
      }
      return chain
    },
  }),
}))

import { PATCH } from './route'

const call = (body: unknown) =>
  PATCH(new NextRequest('http://localhost/api/decks/7', { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: '7' }),
  })

describe('PATCH /api/decks/[id] choosing a commander', () => {
  beforeEach(() => h.update.mockReset())

  it('saves the commander and the deck colour identity the legality check reads', async () => {
    const res = await call({ commander_name: 'Rocco, Cabaretti Caterer', commander_scryfall_id: 'abc' })
    expect(res.status).toBe(200)
    expect(h.update).toHaveBeenCalledWith({
      commander_name: 'Rocco, Cabaretti Caterer',
      commander_id: null,
      commander_scryfall_id: 'abc',
      colour_identity: 'WRG',
    })
  })
})
