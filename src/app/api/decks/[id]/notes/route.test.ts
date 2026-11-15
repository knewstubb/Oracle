import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeOwnedDb } from '@/test/fake-owned-db'

const h = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('@/test/fake-owned-db').fakeOwnedDb>, user: 'user-b' }))

vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: h.user }) }))
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => h.db.client }))

import { GET } from './route'

const call = () =>
  GET(new NextRequest('http://localhost/api/decks/7/notes'), { params: Promise.resolve({ id: '7' }) })

describe('GET /api/decks/[id]/notes owner check', () => {
  beforeEach(() => {
    h.db = fakeOwnedDb({
      decks: [{ id: 7, user_id: 'user-a' }],
      deck_notes: [{ id: 1, deck_id: 7, user_id: 'user-a', content: 'secret', created_at: '2026-01-01' }],
    })
  })

  it("returns 404, not the notes, for another user's deck", async () => {
    h.user = 'user-b'
    const res = await call()
    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).not.toContain('secret')
  })

  it('returns the notes for the owner', async () => {
    h.user = 'user-a'
    const res = await call()
    expect(res.status).toBe(200)
    expect((await res.json()).notes).toHaveLength(1)
  })
})
