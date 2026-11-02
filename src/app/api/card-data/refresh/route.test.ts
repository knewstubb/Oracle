import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createAdminClient: vi.fn(() => ({})) }))
vi.mock('@/lib/card-data-sync', () => ({ getLastSync: vi.fn(async () => '2026-10-19T00:00:00Z') }))
vi.mock('@/lib/card-data-refresh', () => ({
  startRefresh: vi.fn(),
  getRefreshState: vi.fn(() => ({ phase: 'idle', message: null, startedAt: null, finishedAt: null, processed: 0 })),
}))

import { GET, POST } from './route'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { startRefresh } from '@/lib/card-data-refresh'

const unauthorized = Response.json({ error: 'Unauthorized' }, { status: 401 })

beforeEach(() => {
  vi.mocked(requireAuth).mockResolvedValue({ id: 'u' } as never)
  vi.mocked(startRefresh).mockReset()
})

describe('card-data refresh route', () => {
  it('rejects unauthenticated requests without starting anything', async () => {
    vi.mocked(requireAuth).mockResolvedValue(unauthorized)
    expect((await POST()).status).toBe(401)
    expect((await GET()).status).toBe(401)
    expect(startRefresh).not.toHaveBeenCalled()
  })
  it('POST starts a refresh → 202', async () => {
    vi.mocked(startRefresh).mockReturnValue({ started: true, done: Promise.resolve() })
    const res = await POST()
    expect(res.status).toBe(202)
    expect((await res.json()).started).toBe(true)
  })
  it('POST while one is running → 409', async () => {
    vi.mocked(startRefresh).mockReturnValue({ started: false, done: Promise.resolve() })
    expect((await POST()).status).toBe(409)
  })
  it('GET returns last sync, staleness and count', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({ select: async () => ({ count: 118810, error: null }) }),
    } as never)
    const body = await (await GET()).json()
    expect(body).toMatchObject({ lastSyncedAt: '2026-10-19T00:00:00Z', totalPrintings: 118810 })
    expect(typeof body.isStale).toBe('boolean')
    expect(body.refresh.phase).toBe('idle')
  })
})
