import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>
let rows: Row[] = []
let failWith: { code?: string; message?: string } | null = null
const writes: string[] = []

function fakeClient() {
  return {
    from() {
      let id: string | null = null
      const b: Record<string, unknown> = {
        select: () => b,
        not: () => b,
        order: () => b,
        limit: () => b,
        or: () => b,
        eq: (_k: string, v: string) => ((id = v), b),
        maybeSingle: () =>
          Promise.resolve(
            failWith ? { data: null, error: failWith } : { data: rows.find((r) => r.id === id) ?? null, error: null }
          ),
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve(failWith ? { data: null, error: failWith } : { data: rows, error: null }).then(res),
      }
      for (const w of ['insert', 'update', 'delete', 'upsert']) {
        b[w] = () => {
          writes.push(w)
          throw new Error('WRITE ATTEMPTED')
        }
      }
      return b
    },
  }
}

vi.mock('@/lib/supabase', () => ({ createAdminClient: () => fakeClient() }))
vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn(() => Promise.resolve({ id: 'me' })) }))

import { GET as list } from './route'
import { GET as one } from './[id]/route'
import { requireAuth } from '@/lib/auth'

const ID = '11111111-2222-3333-4444-555555555555'
const req = (path: string) => new NextRequest(new URL(path, 'http://localhost:3000'))
const row = {
  id: ID,
  name: 'Eldrazi Unbound',
  set_code: 'c24',
  set_name: 'Commander 2024',
  commander_name: 'Ulalek',
  commander_scryfall_id: 'abcdef',
  color_identity: 'C',
  release_date: '2024-01-01',
  card_count: 100,
  cards: [{ name: 'Sol Ring', set_code: 'c24', number: '1', foil: false, count: 1, commander: false }],
}

beforeEach(() => {
  rows = [row]
  failWith = null
  writes.length = 0
  vi.mocked(requireAuth).mockResolvedValue({ id: 'me' } as never)
})

describe('GET /api/precons', () => {
  it('lists precons without the card lists', async () => {
    const res = await list(req('/api/precons?limit=5'))
    const body = await res.json()
    expect(body.setup).toBe(true)
    expect(body.precons[0]).toMatchObject({ id: ID, name: 'Eldrazi Unbound', commander_name: 'Ulalek' })
    expect(body.precons[0].cards).toBeUndefined()
    expect(body.precons[0].commander_image).toContain('cards.scryfall.io')
  })
  it('says not set up (not an error) when the cards column is missing', async () => {
    failWith = { code: '42703', message: 'column ref_precons.cards does not exist' }
    const res = await list(req('/api/precons'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ precons: [], setup: false })
  })
  it('says not set up when nothing has been synced yet', async () => {
    rows = []
    expect((await (await list(req('/api/precons'))).json()).setup).toBe(false)
  })
  it('requires sign-in', async () => {
    vi.mocked(requireAuth).mockResolvedValue(new Response('no', { status: 401 }) as never)
    expect((await list(req('/api/precons'))).status).toBe(401)
  })
})

describe('GET /api/precons/[id]', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
  it('returns one precon with its cards, and never writes', async () => {
    const res = await one(req(`/api/precons/${ID}`), ctx(ID))
    const body = await res.json()
    expect(body.precon.cards).toHaveLength(1)
    expect(body.precon.card_count).toBe(1)
    expect(writes).toEqual([])
  })
  it('400 for a bad id, 404 when missing, 503 when not set up', async () => {
    expect((await one(req('/api/precons/x'), ctx('x'))).status).toBe(400)
    rows = []
    expect((await one(req(`/api/precons/${ID}`), ctx(ID))).status).toBe(404)
    rows = [{ ...row, cards: null }]
    const res = await one(req(`/api/precons/${ID}`), ctx(ID))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('precons_not_set_up')
    failWith = { code: '42703' }
    expect((await one(req(`/api/precons/${ID}`), ctx(ID))).status).toBe(503)
  })
})
