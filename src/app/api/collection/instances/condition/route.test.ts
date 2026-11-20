import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeClient, type FakeCall, type FakeResult } from '@/lib/card-details/fake-client'

let authed = true
let log: FakeCall[]
let copy: unknown
vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => fakeClient((c): FakeResult => ({ data: c.op === 'select' ? copy : null, error: null }), log),
}))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve(authed ? { id: 'user-1' } : Response.json({ error: 'Unauthorized' }, { status: 401 })) }))
import { PATCH } from './route'

const patch = (body: unknown) =>
  PATCH(new NextRequest('http://localhost/api/collection/instances/condition', { method: 'PATCH', body: JSON.stringify(body) }))

describe('PATCH /api/collection/instances/condition', () => {
  beforeEach(() => { authed = true; log = []; copy = { id: 10, is_proxy: false, missing: false } })
  it('401 when not signed in', async () => {
    authed = false
    expect((await patch({ copyId: 10, condition: 'damaged' })).status).toBe(401)
  })
  it('400 for a word that is not a stored condition, and writes nothing', async () => {
    expect((await patch({ copyId: 10, condition: 'LP' })).status).toBe(400)
    expect((await patch({ copyId: 'x', condition: 'damaged' })).status).toBe(400)
    expect(log.filter((l) => l.op === 'update')).toHaveLength(0)
  })
  it("404 for another user's copy (no row for this user)", async () => {
    copy = null
    expect((await patch({ copyId: 10, condition: 'damaged' })).status).toBe(404)
    const read = log.find((l) => l.op === 'select')!
    expect(read.filters).toContainEqual(['eq', 'user_id', 'user-1'])
    expect(log.filter((l) => l.op === 'update')).toHaveLength(0)
  })
  it('409 for a Proxy or a Missing copy', async () => {
    copy = { id: 10, is_proxy: true, missing: false }
    expect((await patch({ copyId: 10, condition: 'damaged' })).status).toBe(409)
    copy = { id: 10, is_proxy: false, missing: true }
    expect((await patch({ copyId: 10, condition: 'damaged' })).status).toBe(409)
    expect(log.filter((l) => l.op === 'update')).toHaveLength(0)
  })
  it('writes only the condition column, scoped to the user', async () => {
    const res = await patch({ copyId: 10, condition: 'heavily_played' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ copyId: 10, condition: 'heavily_played' })
    const upd = log.find((l) => l.op === 'update')!
    expect(upd.table).toBe('user_copies')
    expect(upd.values).toEqual({ condition: 'heavily_played' })
    expect(upd.filters).toEqual(expect.arrayContaining([['eq', 'id', 10], ['eq', 'user_id', 'user-1']]))
  })
})
