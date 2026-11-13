import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  rpc: null as unknown as Mock<(...a: unknown[]) => Promise<unknown>>,
}))

vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }) }))
vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    rpc: (...a: unknown[]) => h.rpc(...a),
    from: (table: string) => {
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'is', 'limit']) b[m] = () => b
      b.maybeSingle = () => Promise.resolve({ data: h.tables[table] ?? null, error: null })
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: h.tables[table] ?? [], error: null }).then(res)
      return b
    },
  }),
}))

import { POST } from './route'

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/decks/7/move-here', { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: '7' }),
  })

const copyIn = (deckId: number, over: Record<string, unknown> = {}) => ({
  id: 11,
  is_proxy: false,
  missing: false,
  deck_cards: [{ id: 500, deck_id: deckId, decks: { name: 'Prosper' } }],
  ...over,
})
const body = { copyId: 11, cardName: 'Cultivate', expectedSourceDeckId: 3 }

describe('POST /api/decks/[id]/move-here', () => {
  beforeEach(() => {
    h.tables = { user_copies: copyIn(3), deck_cards: [] }
    h.rpc = vi.fn().mockResolvedValue({ data: { success: true, source_deck_card_id: 500, target_deck_card_id: 900 }, error: null })
  })

  it('moves the chosen copy once, as a manual placement, and returns what the toast and Undo need', async () => {
    const res = await post(body)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.rpc).toHaveBeenCalledWith('reassign_to_deck', { p_copy_id: 11, p_target_deck_id: 7, p_card_name: 'Cultivate', p_user_id: 'user-1', p_source: 'manual' })
    expect(json).toMatchObject({
      copyId: 11,
      sourceDeckId: 3,
      sourceDeckName: 'Prosper',
      sourceDeckCardId: 500,
      targetDeckCardId: 900,
      sourceDeckNowShort: true,
      undo: { deckCardsId: 900, physicalCopyId: 11, restoreTo: { deckCardsId: 500 } },
    })
  })

  it('refuses a copy already in the deck it would move into, and does not touch anything', async () => {
    h.tables.user_copies = copyIn(7)
    const res = await post(body)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('already_in_this_deck')
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('refuses when the copy is no longer in the deck the screen showed (stale screen or double click)', async () => {
    h.tables.user_copies = copyIn(4)
    const res = await post(body)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('source_changed')
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('refuses a copy that is in no deck any more', async () => {
    h.tables.user_copies = copyIn(3, { deck_cards: [] })
    expect((await post(body)).status).toBe(409)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('refuses a missing copy', async () => {
    h.tables.user_copies = copyIn(3, { missing: true })
    const res = await post(body)
    expect((await res.json()).error).toBe('copy_missing')
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('says so when this deck has no open slot, in a plain sentence', async () => {
    h.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'no_open_slot' } })
    const res = await post(body)
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe('no_open_slot')
    expect(json.message).toMatch(/Add it to the deck first/)
  })

  it('puts the copy straight back if it turns out to have come from a different slot than the one checked', async () => {
    h.rpc = vi.fn().mockImplementation((fn: string) =>
      Promise.resolve(fn === 'reassign_to_deck' ? { data: { success: true, source_deck_card_id: 777, target_deck_card_id: 900 }, error: null } : { data: { success: true }, error: null })
    )
    const res = await post(body)
    expect((await res.json()).error).toBe('source_changed')
    expect(h.rpc).toHaveBeenLastCalledWith('undo_copy_move', expect.objectContaining({ p_current_deck_card_id: 900, p_restore_deck_card_id: 777, p_copy_id: 11 }))
  })

  it('reports a Playable source so the toast can say it is now Assembling', async () => {
    // 100 slots, all with copies = Playable before; the fake returns the same rows after, so only the "before" flag is asserted.
    h.tables.deck_cards = Array.from({ length: 100 }, (_, i) => ({ deck_id: 3, copy_id: i + 1, is_generic: false, generic_sleeved: null }))
    const json = await (await post(body)).json()
    expect(json.sourceWasPlayable).toBe(true)
  })

  it('rejects a body without a named copy (the server never guesses)', async () => {
    const res = await post({ cardName: 'Cultivate', expectedSourceDeckId: 3 })
    expect(res.status).toBe(400)
    expect(h.rpc).not.toHaveBeenCalled()
  })
})
