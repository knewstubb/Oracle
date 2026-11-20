import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let authed = true
let loader: () => Promise<unknown>
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve(authed ? { id: 'user-1' } : Response.json({ error: 'Unauthorized' }, { status: 401 })) }))
vi.mock('@/lib/card-details/load-collection', () => ({ loadCollectionCardDetails: () => loader() }))
import { GET } from './route'

const get = () => GET(new NextRequest('http://localhost/api/collection/instances/oid-1/details'), { params: Promise.resolve({ oracleId: 'oid-1' }) })

describe('GET /api/collection/instances/[oracleId]/details', () => {
  beforeEach(() => { authed = true; loader = async () => ({ oracleId: 'oid-1', copies: [] }) })
  it('401 when not signed in', async () => {
    authed = false
    expect((await get()).status).toBe(401)
  })
  it('200 with an empty copies list', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect((await res.json()).copies).toEqual([])
  })
  it('500 when a lookup fails', async () => {
    loader = async () => { throw new Error('copies lookup failed: down') }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await get()).status).toBe(500)
  })
})
