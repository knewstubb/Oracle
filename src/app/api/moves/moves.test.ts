import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ rpc: null as unknown as Mock<(...a: unknown[]) => Promise<unknown>> }))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }) }))
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => ({ rpc: (...a: unknown[]) => h.rpc(...a) }) }))

import { POST as lists } from './lists/route'
import { POST as turnedUp } from './missing/[copyId]/turned-up/route'
import { POST as lookedHere } from './items/[id]/looked-here/route'
import { POST as undo } from './items/[id]/undo/route'
import { POST as cancel } from './items/[id]/cancel/route'

const req = (body: unknown) => new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify(body) })

describe('move routine routes', () => {
  beforeEach(() => { h.rpc = vi.fn().mockResolvedValue({ data: { success: true, item_id: 5, state: 'to_find', unchanged: false, state_: 1 }, error: null }) })

  it('lists: passes the signed-in user, ignores a body userId, and explains skips', async () => {
    h.rpc = vi.fn().mockResolvedValue({ data: { success: true, list_id: 'L', created: [{ itemId: 1, copyId: 9, state: 'to_find' }], unchanged: [], skipped: [{ index: 1, copyId: 10, reason: 'copy_missing' }] }, error: null })
    const res = await lists(req({ userId: 'x', items: [{ copyId: 9, to: { kind: 'location', locationId: 3 } }, { copyId: 10, cardName: 'Sol Ring', to: { kind: 'location', locationId: 3 } }] }))
    expect(h.rpc).toHaveBeenCalledWith('create_move_list', { p_user_id: 'user-1', p_items: [{ copyId: 9, to: { kind: 'location', locationId: 3 } }, { copyId: 10, to: { kind: 'location', locationId: 3 } }] })
    const json = await res.json()
    expect(json.skipped[0].message).toBe('Sol Ring is marked Missing')
  })

  it('lists: rejects empty, oversize and malformed bodies without calling the database', async () => {
    expect((await lists(req({ items: [] }))).status).toBe(400)
    expect((await lists(req({ items: Array.from({ length: 501 }, () => ({ copyId: 1, to: { kind: 'location', locationId: 1 } })) }))).status).toBe(400)
    expect((await lists(req({ items: [{ copyId: 'a' }] }))).status).toBe(400)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('turned-up: sends the chosen place and rejects a missing choice', async () => {
    h.rpc = vi.fn().mockResolvedValue({ data: { success: true, unchanged: false, state: 'in_hand' }, error: null })
    const res = await turnedUp(req({ to: { kind: 'in_hand' } }), { params: Promise.resolve({ copyId: '7' }) })
    expect(h.rpc).toHaveBeenCalledWith('resolve_missing_copy', { p_user_id: 'user-1', p_copy_id: 7, p_to: { kind: 'in_hand' } })
    expect((await res.json()).state).toBe('in_hand')
    expect((await turnedUp(req({}), { params: Promise.resolve({ copyId: '7' }) })).status).toBe(400)
  })

  it('looked-here: records a place, refuses a bad one', async () => {
    h.rpc = vi.fn().mockResolvedValue({ data: { success: true, item_id: 5, unchanged: false, looked_in: [{ kind: 'deck', id: 2 }] }, error: null })
    const res = await lookedHere(req({ place: { kind: 'deck', id: 2 } }), { params: Promise.resolve({ id: '5' }) })
    expect((await res.json()).lookedIn).toHaveLength(1)
    expect((await lookedHere(req({ place: { kind: 'x', id: 2 } }), { params: Promise.resolve({ id: '5' }) })).status).toBe(400)
  })

  it('undo: needs expectedState and maps refusals to 409', async () => {
    expect((await undo(req({}), { params: Promise.resolve({ id: '5' }) })).status).toBe(400)
    h.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'moved_since' } })
    const res = await undo(req({ expectedState: 'placed', cardName: 'Sol Ring' }), { params: Promise.resolve({ id: '5' }) })
    expect(res.status).toBe(409)
    expect((await res.json()).message).toContain('Sol Ring')
  })

  it('cancel: cancels, and reports a missing step as 404', async () => {
    h.rpc = vi.fn().mockResolvedValue({ data: { success: true, item_id: 5, state: 'cancelled', unchanged: false }, error: null })
    expect((await (await cancel(req({}), { params: Promise.resolve({ id: '5' }) })).json()).state).toBe('cancelled')
    h.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'item_not_found' } })
    expect((await cancel(req({}), { params: Promise.resolve({ id: '5' }) })).status).toBe(404)
  })

  it('an unexpected failure is a 500 and changes nothing', async () => {
    h.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect((await cancel(req({}), { params: Promise.resolve({ id: '5' }) })).status).toBe(500)
  })
})
