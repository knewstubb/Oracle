import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve({ id: 'user-1', email: 'a@b.c' }),
}))
vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({ rpc: h.rpc }),
}))

import { PUT } from './route'

function call(body: unknown, id = '7') {
  const req = new NextRequest('http://localhost/api/decks/7/command-zone', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  return PUT(req, { params: Promise.resolve({ id }) })
}

describe('PUT /api/decks/[id]/command-zone', () => {
  beforeEach(() => h.rpc.mockReset())

  it('calls the one RPC with the deck, the user and the card ids', async () => {
    h.rpc.mockResolvedValue({ data: { deck_id: 7 }, error: null })
    const res = await call({ primaryCardId: 1, companionCardId: 3 })
    expect(res.status).toBe(200)
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.rpc).toHaveBeenCalledWith('set_deck_command_zone', {
      p_deck_id: 7,
      p_user_id: 'user-1',
      p_primary_card_id: 1,
      p_second_card_id: null,
      p_second_role: null,
      p_companion_card_id: 3,
    })
    expect(await res.json()).toMatchObject({ ok: true, deckId: 7, companionCardId: 3 })
  })

  it('refuses a bad body without calling the database', async () => {
    const res = await call({ primaryCardId: 'x' })
    expect(res.status).toBe(400)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('refuses a second commander with no role', async () => {
    const res = await call({ primaryCardId: 1, secondCardId: 2 })
    expect(res.status).toBe(400)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('refuses a non-numeric deck id', async () => {
    const res = await call({ primaryCardId: 1 }, 'abc')
    expect(res.status).toBe(400)
  })

  it('tells the user to remove the existing companion first (409), plain words', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'companion_must_be_removed_first' } })
    const res = await call({ primaryCardId: 1 })
    expect(res.status).toBe(409)
    const j = await res.json()
    expect(j.code).toBe('companion_must_be_removed_first')
    expect(j.error).not.toMatch(/_/)
  })

  it('maps a deck that is not yours to 404', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'deck_not_found' } })
    expect((await call({ primaryCardId: 1 })).status).toBe(404)
  })

  it('maps a table-rule violation to 409', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'duplicate key value violates unique constraint "uq_deck_cards_one_companion"' } })
    expect((await call({ primaryCardId: 1, companionCardId: 3 })).status).toBe(409)
  })

  it('an unexpected RPC reply is an error, not success', async () => {
    h.rpc.mockResolvedValue({ data: {}, error: null })
    expect((await call({ primaryCardId: 1 })).status).toBe(500)
  })
})
