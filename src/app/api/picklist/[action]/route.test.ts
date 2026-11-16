import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ rpc: null as unknown as Mock<(...a: unknown[]) => Promise<unknown>> }))

vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }) }))
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => ({ rpc: (...a: unknown[]) => h.rpc(...a) }) }))

import { POST } from './route'

const call = (segment: string, body: unknown) =>
  POST(new NextRequest(`http://localhost/api/picklist/${segment}`, { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ action: segment }),
  })
const body = { copyId: 11, cardName: 'Sol Ring', to: { kind: 'deck', deckId: 7, deckCardId: 70 } }

describe('POST /api/picklist/[action]', () => {
  beforeEach(() => {
    h.rpc = vi.fn().mockResolvedValue({
      data: { success: true, item_id: 4, state: 'found', source_deck_now_short: [{ deckId: 3, deckName: 'Prosper', cardName: 'Sol Ring' }] },
      error: null,
    })
  })

  it('ticks Found it through the stored routine with the signed-in user only', async () => {
    const res = await call('found', { ...body, userId: 'someone-else' })
    expect(res.status).toBe(200)
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.rpc).toHaveBeenCalledWith('picklist_tick', {
      p_user_id: 'user-1', p_action: 'found', p_copy_id: 11, p_to: { kind: 'deck', deckId: 7, deckCardId: 70 },
    })
    expect(await res.json()).toMatchObject({ itemId: 4, state: 'found', unchanged: false, sourceDeckNowShort: [{ deckName: 'Prosper' }] })
  })

  it('maps the URL segments to the routine actions', async () => {
    await call('placed', body)
    await call('cant-find', body)
    expect((h.rpc.mock.calls[0][1] as Record<string, unknown>).p_action).toBe('placed')
    expect((h.rpc.mock.calls[1][1] as Record<string, unknown>).p_action).toBe('cant_find')
  })

  it('refuses an unknown action and a bad body without touching the database', async () => {
    expect((await call('delete', body)).status).toBe(404)
    expect((await call('found', { copyId: 'x', to: {} })).status).toBe(400)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['no_open_slot', 409, /no open slot/],
    ['copy_missing', 409, /Missing/],
    ['not_in_hand', 409, /Found it first/],
    ['copy_not_found', 404, /Couldn't find/],
    ['target_not_found', 404, /no longer exists/],
  ])('turns the refusal %s into a plain message and leaves everything unchanged', async (code, status, text) => {
    h.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: code } })
    const res = await call('placed', body)
    expect(res.status).toBe(status)
    const json = await res.json()
    expect(json.error).toBe(code)
    expect(json.message).toMatch(text)
    expect(json.message).toContain('Sol Ring')
  })

  it('reports an unexpected failure as a 500 with the safe sentence', async () => {
    h.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await call('found', body)
    expect(res.status).toBe(500)
    expect((await res.json()).message).toContain('still where Oracle had it')
  })

  it('treats a malformed routine answer as a failure', async () => {
    h.rpc = vi.fn().mockResolvedValue({ data: { success: false }, error: null })
    expect((await call('found', body)).status).toBe(500)
  })
})
