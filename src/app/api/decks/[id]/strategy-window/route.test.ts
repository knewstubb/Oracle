/* eslint-disable @typescript-eslint/no-explicit-any -- a small fake database */
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve({ id: 'test-user-id', email: 'test@example.com' }),
}))
import { NextRequest } from 'next/server'
// A fake database. `newColumns` false = the owner has not applied the stored-data change yet.
// `oldBracketCheck` true = a live check that stops at 4.
let state: { newColumns: boolean; oldBracketCheck: boolean; decks: any[]; strategy: any[]; writes: any[] }
const NEW = ['summary', 'updated_by']
function fake() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      let cols = '*'
      const b: any = {
        select(c: string) { cols = c; return b },
        eq(k: string, v: unknown) { filters[k] = v; return b },
        maybeSingle() {
          const rows = (table === 'decks' ? state.decks : state.strategy).filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v))
          if (table === 'deck_strategy' && !state.newColumns && NEW.some((c) => cols.includes(c))) {
            return Promise.resolve({ data: null, error: { code: '42703', message: 'column deck_strategy.summary does not exist' } })
          }
          const row = rows[0] ?? null
          if (row && table === 'deck_strategy' && !state.newColumns) for (const c of NEW) delete (row as any)[c]
          return Promise.resolve({ data: row, error: null })
        },
        upsert(data: any) {
          state.writes.push(data)
          if (!state.newColumns && NEW.some((c) => c in data)) return Promise.resolve({ error: { code: 'PGRST204', message: "Could not find the 'summary' column of 'deck_strategy' in the schema cache" } })
          if (state.oldBracketCheck && data.bracket === 5) return Promise.resolve({ error: { code: '23514', message: 'new row for relation "deck_strategy" violates check constraint "deck_strategy_bracket_check"' } })
          const i = state.strategy.findIndex((r) => r.deck_id === data.deck_id)
          if (i >= 0) state.strategy[i] = { ...state.strategy[i], ...data } // only the sent columns change
          else state.strategy.push(data)
          return Promise.resolve({ error: null })
        },
      }
      return b
    },
  }
}
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => fake() }))
import { GET, PUT } from './route'
const params = (id = '1') => ({ params: Promise.resolve({ id }) })
const put = (body: unknown) => PUT(new NextRequest('http://x/api/decks/1/strategy-window', { method: 'PUT', body: JSON.stringify(body) }), params())
const get = () => GET(new NextRequest('http://x/api/decks/1/strategy-window'), params())
beforeEach(() => {
  state = { newColumns: true, oldBracketCheck: false, decks: [{ id: 1, user_id: 'test-user-id' }, { id: 2, user_id: 'someone-else' }], strategy: [], writes: [] }
})
describe('strategy window route', () => {
  it('an empty deck reads as not set and the new fields can be stored', async () => {
    const r = await get()
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ configured: false, bracket: null, summary: '', strategy: '', playgroup: '', updatedBy: null, canStoreNewFields: true, implied: null })
  })
  it('another owner\'s deck is not found', async () => {
    expect((await GET(new NextRequest('http://x'), params('2'))).status).toBe(404)
    expect((await PUT(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ bracket: 3 }) }), params('2'))).status).toBe(404)
  })
  it('saves bracket 5, the summary, the Strategy and the playgroup and says the owner changed it', async () => {
    const r = await put({ bracket: 5, summary: 'Plants', strategy: 'Eat lands.', playgroup: 'Friday' })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ bracket: 5, summary: 'Plants', strategy: 'Eat lands.', playgroup: 'Friday', updatedBy: 'owner', notSaved: [] })
  })
  it('saves only what the window sent: win condition and budget stay as they were', async () => {
    state.strategy.push({ deck_id: 1, user_id: 'test-user-id', win_condition: 'Combo', budget_mode: 'budget', budget_ceiling: 200, format_rules: '{"a":1}' })
    await put({ bracket: 3, summary: '', strategy: '', playgroup: '' })
    expect(state.strategy[0]).toMatchObject({ win_condition: 'Combo', budget_mode: 'budget', budget_ceiling: 200, format_rules: '{"a":1}', bracket: 3 })
    expect(Object.keys(state.writes[0]).sort()).toEqual(['bracket', 'deck_id', 'strategy_notes', 'summary', 'table_context', 'updated_at', 'updated_by', 'user_id'])
  })
  it('refuses a bad bracket and a long summary in plain words and writes nothing', async () => {
    expect((await put({ bracket: 6 })).status).toBe(400)
    const r = await put({ summary: 'x'.repeat(121) })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/at most 120/)
    expect(state.writes).toHaveLength(0)
  })
  it('before the stored-data update: reads work, the older fields save, and a typed summary is reported as not saved', async () => {
    state.newColumns = false
    const g = await get()
    expect(g.status).toBe(200)
    expect(await g.json()).toMatchObject({ canStoreNewFields: false, bracket: null })
    const r = await put({ bracket: 3, summary: 'Plants', strategy: 'Eat lands.', playgroup: '' })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body).toMatchObject({ bracket: 3, strategy: 'Eat lands.', summary: '', canStoreNewFields: false, notSaved: ['summary'] })
  })
  it('before the stored-data update an empty summary is not a loss', async () => {
    state.newColumns = false
    const body = await (await put({ bracket: 2, summary: '', strategy: '', playgroup: '' })).json()
    expect(body.notSaved).toEqual([])
  })
  it('bracket 5 while the stored data still stops at 4: refused in plain words, nothing saved', async () => {
    state.oldBracketCheck = true
    const r = await put({ bracket: 5 })
    expect(r.status).toBe(422)
    const body = await r.json()
    expect(body.code).toBe('bracket_5_not_stored_yet')
    expect(body.error).toMatch(/Bracket 5 can't be saved yet/)
    expect(state.strategy).toHaveLength(0)
    expect((await put({ bracket: 4 })).status).toBe(200)
  })
})
