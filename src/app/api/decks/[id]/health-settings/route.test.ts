/* eslint-disable @typescript-eslint/no-explicit-any -- a small fake database */
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve({ id: 'test-user-id', email: 'test@example.com' }),
}))
import { NextRequest } from 'next/server'

// A fake database. `tables` false = the owner has not applied the stored-data change yet.
let state: { tables: boolean; decks: any[]; settings: any[]; cats: any[]; nextId: number }
const MISSING = { code: '42P01', message: 'relation "public.deck_health_settings" does not exist' }

function fake() {
  return {
    from(table: string) {
      const filters: [string, unknown][] = []
      const isNull: string[] = []
      let op: 'select' | 'delete' | 'update' | 'insert' | 'upsert' = 'select'
      let payload: any = null
      const rows = () => (table === 'decks' ? state.decks : table === 'deck_health_settings' ? state.settings : state.cats)
      const match = (r: any) => filters.every(([k, v]) => r[k] === v) && isNull.every((k) => r[k] === null || r[k] === undefined)
      const run = (): { data: any; error: any } => {
        if (table !== 'decks' && !state.tables) return { data: null, error: MISSING }
        const list = rows()
        if (op === 'select') return { data: list.filter(match), error: null }
        if (op === 'delete') {
          const keep = list.filter((r) => !match(r))
          list.splice(0, list.length, ...keep)
          return { data: null, error: null }
        }
        if (op === 'update') {
          for (const r of list.filter(match)) Object.assign(r, payload)
          return { data: null, error: null }
        }
        if (op === 'insert') {
          if (list.some((r) => r.deck_id === payload.deck_id && String(r.name).toLowerCase() === String(payload.name).toLowerCase())) return { data: null, error: { code: '23505', message: 'duplicate' } }
          list.push({ id: state.nextId++, kind: null, proposed_min: null, proposed_max: null, ...payload })
          return { data: null, error: null }
        }
        const i = list.findIndex((r) => (table === 'deck_health_settings' ? r.deck_id === payload.deck_id : r.deck_id === payload.deck_id && r.kind === payload.kind))
        if (i >= 0) Object.assign(list[i], payload)
        else list.push({ id: state.nextId++, ...payload })
        return { data: null, error: null }
      }
      const b: any = {
        select() { return b },
        delete() { op = 'delete'; return b },
        update(p: any) { op = 'update'; payload = p; return b },
        insert(p: any) { op = 'insert'; payload = p; return b },
        upsert(p: any) { op = 'upsert'; payload = p; return b },
        eq(k: string, v: unknown) { filters.push([k, v]); return b },
        is(k: string) { isNull.push(k); return b },
        maybeSingle() { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }) },
        then(res: any, rej: any) { return Promise.resolve(run()).then(res, rej) },
      }
      return b
    },
  }
}
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => fake() }))

import { GET, PUT } from './route'
const params = (id = '1') => ({ params: Promise.resolve({ id }) })
const put = (body: unknown, id = '1') => PUT(new NextRequest(`http://x/api/decks/${id}/health-settings`, { method: 'PUT', body: JSON.stringify(body) }), params(id))
const get = (id = '1') => GET(new NextRequest(`http://x/api/decks/${id}/health-settings`), params(id))

beforeEach(() => {
  state = { tables: true, decks: [{ id: 1, user_id: 'test-user-id' }, { id: 2, user_id: 'someone-else' }], settings: [], cats: [], nextId: 1 }
})

describe('health settings route', () => {
  it('GET with nothing stored gives the defaults', async () => {
    const res = await get()
    expect(await res.json()).toEqual({ available: true, mode: 'default', overrides: {}, categories: [] })
  })
  it('GET before the stored-data change is applied gives defaults and no error', async () => {
    state.tables = false
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ available: false, mode: 'default', overrides: {}, categories: [] })
  })
  it('PUT before the stored-data change is applied answers 503 with available:false', async () => {
    state.tables = false
    const res = await put({ action: 'set_mode', mode: 'custom' })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ available: false, mode: 'default' })
  })
  it("someone else's deck is not found", async () => {
    expect((await get('2')).status).toBe(404)
    expect((await put({ action: 'set_mode', mode: 'custom' }, '2')).status).toBe(404)
    expect(state.settings).toEqual([])
  })
  it('sets the mode and keeps custom categories when switching back', async () => {
    await put({ action: 'add_category', name: 'Mana Rocks', min: 2, max: 4 })
    expect((await (await put({ action: 'set_mode', mode: 'custom' })).json()).mode).toBe('custom')
    const back = await (await put({ action: 'set_mode', mode: 'default' })).json()
    expect(back.mode).toBe('default')
    expect(back.categories).toEqual([{ id: 1, name: 'Mana Rocks', min: 2, max: 4, proposed: null }])
    expect((await (await put({ action: 'set_mode', mode: 'custom' })).json()).categories).toHaveLength(1)
  })
  it('sets and clears a default range for this deck', async () => {
    const set = await (await put({ action: 'set_override', kind: 'ramp', min: 8, max: 14 })).json()
    expect(set.overrides).toEqual({ ramp: { min: 8, max: 14 } })
    const again = await (await put({ action: 'set_override', kind: 'ramp', min: 9, max: 13 })).json()
    expect(again.overrides).toEqual({ ramp: { min: 9, max: 13 } })
    expect(state.cats).toHaveLength(1)
    expect((await (await put({ action: 'clear_override', kind: 'ramp' })).json()).overrides).toEqual({})
  })
  it('adds, renames, sets a range on and removes a custom category', async () => {
    await put({ action: 'add_category', name: '  Tutors ' })
    let s = await (await put({ action: 'rename_category', id: 1, name: 'Tutors and Finders' })).json()
    expect(s.categories[0]).toMatchObject({ name: 'Tutors and Finders', min: null, max: null })
    s = await (await put({ action: 'set_range', id: 1, min: 3, max: 5 })).json()
    expect(s.categories[0]).toMatchObject({ min: 3, max: 5 })
    s = await (await put({ action: 'remove_category', id: 1 })).json()
    expect(s.categories).toEqual([])
  })
  it('confirms a proposal into the range and declines one without touching the range', async () => {
    state.cats.push({ id: 10, deck_id: 1, user_id: 'test-user-id', kind: null, name: 'Tutors', min_cards: null, max_cards: null, proposed_min: 3, proposed_max: 5, sort_order: 1 })
    state.cats.push({ id: 11, deck_id: 1, user_id: 'test-user-id', kind: null, name: 'Wincons', min_cards: 2, max_cards: 4, proposed_min: 6, proposed_max: 8, sort_order: 2 })
    let s = await (await put({ action: 'confirm_proposal', id: 10 })).json()
    expect(s.categories[0]).toMatchObject({ min: 3, max: 5, proposed: null })
    s = await (await put({ action: 'decline_proposal', id: 11 })).json()
    expect(s.categories[1]).toMatchObject({ min: 2, max: 4, proposed: null })
    expect((await put({ action: 'confirm_proposal', id: 10 })).status).toBe(409)
  })
  it('refuses bad numbers and names', async () => {
    for (const body of [
      { action: 'set_override', kind: 'ramp', min: 5, max: 4 },
      { action: 'set_override', kind: 'ramp', min: -1, max: 4 },
      { action: 'set_override', kind: 'ramp', min: 1, max: 101 },
      { action: 'set_override', kind: 'ramp', min: 1.5, max: 3 },
      { action: 'set_override', kind: 'game_plan', min: 1, max: 3 },
      { action: 'add_category', name: '' },
      { action: 'add_category', name: 'x'.repeat(61) },
      { action: 'add_category', name: 'Maybeboard' },
      { action: 'add_category', name: 'sideboard' },
      { action: 'add_category', name: 'Commander' },
      { action: 'add_category', name: 'Companion' },
      { action: 'set_mode', mode: 'both' },
      { action: 'nope' },
    ]) {
      expect((await put(body)).status, JSON.stringify(body)).toBe(400)
    }
    expect(state.cats).toEqual([])
  })
  it('allows one name per deck, ignoring case', async () => {
    await put({ action: 'add_category', name: 'Ramp Plus' })
    expect((await put({ action: 'add_category', name: 'ramp plus' })).status).toBe(409)
    await put({ action: 'add_category', name: 'Other' })
    expect((await put({ action: 'rename_category', id: 2, name: 'RAMP PLUS' })).status).toBe(409)
  })
  it('a category that is not on this deck is not found', async () => {
    state.cats.push({ id: 50, deck_id: 2, user_id: 'someone-else', kind: null, name: 'Theirs', min_cards: null, max_cards: null, sort_order: 1 })
    expect((await put({ action: 'remove_category', id: 50 })).status).toBe(404)
    expect(state.cats).toHaveLength(1)
  })
})
