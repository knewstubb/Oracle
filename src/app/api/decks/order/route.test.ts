import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }) }))
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => ({ rpc: h.rpc }) }))
import { PUT } from './route'

const call = (body: unknown) => PUT(new Request('http://localhost/api/decks/order', { method: 'PUT', body: JSON.stringify(body) }))

describe('PUT /api/decks/order', () => {
  beforeEach(() => h.rpc.mockReset())
  it('saves the whole list for the signed-in user', async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, count: 3 }, error: null })
    const res = await call({ deckIds: [3, 1, 2] })
    expect(await res.json()).toEqual({ ok: true, count: 3 })
    expect(h.rpc).toHaveBeenCalledWith('move_decks', { p_user_id: 'user-1', p_deck_ids: [3, 1, 2] })
  })
  it('refuses an empty or malformed list without calling the database', async () => {
    expect((await call({ deckIds: [] })).status).toBe(400)
    expect((await call({})).status).toBe(400)
    expect(await (await call({ deckIds: [1, 'x'] })).json()).toEqual({ error: 'deck_order_mismatch' })
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('passes a refused list back as its own error', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'deck_order_mismatch' } })
    const res = await call({ deckIds: [1, 2] })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'deck_order_mismatch' })
  })
  it('reports any other failure as save_failed', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await call({ deckIds: [1] })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'save_failed' })
  })
})
