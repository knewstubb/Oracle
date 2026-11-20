import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeClient, type FakeCall, type FakeResult } from '@/lib/card-details/fake-client'
import { resetWhyColumnCache } from '@/lib/card-details/why-column'

let handler: (c: FakeCall) => FakeResult
let updates: unknown[] = []
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => fakeClient((c) => handler(c)) }))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }) }))
import { PUT } from './route'

const put = (body: unknown) =>
  PUT(
    new NextRequest('http://localhost/api/decks/5/cards/1/why', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: '5', cardId: '1' }) },
  )

function db(opts: { owner?: boolean; column?: boolean }): (c: FakeCall) => FakeResult {
  return (c) => {
    if (c.table === 'decks') return { data: opts.owner === false ? null : { id: 5 }, error: null }
    if (c.op === 'update') {
      updates.push(c.values)
      return { data: { id: 1 }, error: null }
    }
    if (c.columns === 'why_here') return opts.column === false ? { data: null, error: { message: 'x', code: '42703' } } : { data: [], error: null }
    return { data: [], error: null }
  }
}

describe('PUT /api/decks/[id]/cards/[cardId]/why', () => {
  beforeEach(() => {
    updates = []
    resetWhyColumnCache()
  })
  it('saves a trimmed line', async () => {
    handler = db({})
    const res = await put({ why: '  Mana engine  ' })
    expect(res.status).toBe(200)
    expect(updates).toEqual([{ why_here: 'Mana engine' }])
  })
  it('clears the line with null', async () => {
    handler = db({})
    expect((await put({ why: null })).status).toBe(200)
    expect(updates).toEqual([{ why_here: null }])
  })
  it('refuses over 200 characters and writes nothing', async () => {
    handler = db({})
    expect((await put({ why: 'x'.repeat(201) })).status).toBe(400)
    expect(updates).toEqual([])
  })
  it("answers 404 for another user's deck and writes nothing", async () => {
    handler = db({ owner: false })
    expect((await put({ why: 'hi' })).status).toBe(404)
    expect(updates).toEqual([])
  })
  it('answers 409 why_not_available when the column is missing', async () => {
    handler = db({ column: false })
    const res = await put({ why: 'hi' })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('why_not_available')
    expect(updates).toEqual([])
  })
})
