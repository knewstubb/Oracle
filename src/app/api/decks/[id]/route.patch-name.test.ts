import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase } from '@/test/fake-supabase'

const h = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('@/test/fake-supabase').fakeSupabase> }))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }), getAuthUser: () => Promise.resolve({ id: 'user-1' }) }))
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => h.db.client }))

import { PATCH } from './route'

const call = (body: unknown, id = '7') =>
  PATCH(new NextRequest(`http://localhost/api/decks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  })

describe('PATCH /api/decks/[id] renaming a deck', () => {
  beforeEach(() => {
    h.db = fakeSupabase({
      decks: [
        { id: 7, user_id: 'user-1', name: 'Korvold', folder_id: 3 },
        { id: 8, user_id: 'user-1', name: 'Prosper' },
        { id: 9, user_id: 'user-2', name: 'Atraxa' },
      ],
    })
  })

  it('saves the trimmed name and changes nothing else', async () => {
    const res = await call({ name: '  Korvold Reborn  ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, name: 'Korvold Reborn' })
    expect(h.db.tables.decks[0]).toMatchObject({ name: 'Korvold Reborn', folder_id: 3 })
    expect(h.db.writes).toEqual([{ table: 'decks', payload: { name: 'Korvold Reborn' } }])
  })

  it('refuses an empty name and saves nothing', async () => {
    const res = await call({ name: '   ' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'name_empty' })
    expect(h.db.writes).toEqual([])
  })

  it('refuses a name over 100 characters', async () => {
    const res = await call({ name: 'a'.repeat(101) })
    expect(await res.json()).toEqual({ error: 'name_too_long' })
    expect(h.db.writes).toEqual([])
  })

  it('refuses a name another deck uses, ignoring capitals', async () => {
    const res = await call({ name: 'prosper' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'name_taken' })
    expect(h.db.tables.decks[0].name).toBe('Korvold')
  })

  it('allows changing only the capitals of the deck\'s own name', async () => {
    const res = await call({ name: 'KORVOLD' })
    expect(res.status).toBe(200)
    expect(h.db.tables.decks[0].name).toBe('KORVOLD')
  })

  it('does not count another user\'s deck as a clash', async () => {
    const res = await call({ name: 'Atraxa' })
    expect(res.status).toBe(200)
  })

  it('answers not_found for a deck that is not the owner\'s', async () => {
    const res = await call({ name: 'Anything' }, '9')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(h.db.writes).toEqual([])
  })
})
