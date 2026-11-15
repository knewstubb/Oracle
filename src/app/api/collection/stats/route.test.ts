import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeOwnedDb } from '@/test/fake-owned-db'

const h = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('@/test/fake-owned-db').fakeOwnedDb> }))

vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-a' }) }))
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => h.db.client }))

import { GET } from './route'

describe('GET /api/collection/stats', () => {
  beforeEach(() => {
    h.db = fakeOwnedDb({
      user_copies: [{ id: 1, user_id: 'user-a' }, { id: 2, user_id: 'user-a' }, { id: 3, user_id: 'user-b' }],
      user_cards: [{ id: 1, user_id: 'user-a' }, { id: 2, user_id: 'user-b' }, { id: 3, user_id: 'user-b' }],
      sync_meta: [{ key: 'last_collection_import', value: '2026-01-01' }],
    })
  })

  it("counts only the signed-in user's cards and copies", async () => {
    const body = await (await GET()).json()
    expect(body.totalCards).toBe(2)
    expect(body.totalCopies).toBe(2)
    expect(body.uniqueNames).toBe(1)
  })
})
