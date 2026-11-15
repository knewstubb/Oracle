import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeOwnedDb } from '@/test/fake-owned-db'

const h = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('@/test/fake-owned-db').fakeOwnedDb>, user: 'user-b' }))

vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: h.user }) }))
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => h.db.client }))

import { PATCH } from './route'

const call = (status: string) =>
  PATCH(new NextRequest('http://localhost/api/decks/7/status', { method: 'PATCH', body: JSON.stringify({ status }) }), {
    params: Promise.resolve({ id: '7' }),
  })

describe('PATCH /api/decks/[id]/status owner check', () => {
  beforeEach(() => {
    h.db = fakeOwnedDb({ decks: [{ id: 7, user_id: 'user-a', name: 'Korvold', status: 'brewing' }] })
  })

  it("returns 404 and leaves the row unchanged when another user's deck is targeted", async () => {
    h.user = 'user-b'
    const res = await call('in_rotation')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Deck not found' })
    expect(h.db.tables.decks[0].status).toBe('brewing')
  })

  it('updates the status for the owner', async () => {
    h.user = 'user-a'
    const res = await call('in_rotation')
    expect(res.status).toBe(200)
    expect(h.db.tables.decks[0].status).toBe('in_rotation')
  })
})
