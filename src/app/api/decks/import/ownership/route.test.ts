import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}
const calls: { table: string; eq: [string, unknown][]; op: string }[] = []

/** Minimal chainable fake: select/eq/in/order/range. Anything else (insert, update, delete) throws. */
function fakeClient() {
  return {
    from(table: string) {
      const eqs: [string, unknown][] = []
      const ins: [string, unknown[]][] = []
      let range: [number, number] | null = null
      const run = () => {
        let rows = (tables[table] ?? []).filter(
          (r) => eqs.every(([k, v]) => r[k] === v) && ins.every(([k, vs]) => vs.includes(r[k]))
        )
        if (range) rows = rows.slice(range[0], range[1] + 1)
        return { data: rows, error: null }
      }
      const b: Record<string, unknown> = {
        select: () => (calls.push({ table, eq: eqs, op: 'select' }), b),
        eq: (k: string, v: unknown) => (eqs.push([k, v]), b),
        in: (k: string, vs: unknown[]) => (ins.push([k, vs]), b),
        order: () => b,
        range: (a: number, z: number) => ((range = [a, z]), b),
        then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
      }
      for (const w of ['insert', 'update', 'delete', 'upsert', 'rpc']) {
        b[w] = () => {
          throw new Error(`WRITE ATTEMPTED: ${w}`)
        }
      }
      return b
    },
    rpc: () => {
      throw new Error('WRITE ATTEMPTED: rpc')
    },
  }
}

vi.mock('@/lib/supabase', () => ({ createAdminClient: () => fakeClient() }))
vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn(() => Promise.resolve({ id: 'me' })) }))

import { POST } from './route'
import { requireAuth } from '@/lib/auth'

function req(body: unknown) {
  return new NextRequest(new URL('/api/decks/import/ownership', 'http://localhost:3000'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const card = { rowKey: 'k1', oracleId: 'o-sol', printingId: 'p-clb', qty: 1 }

beforeEach(() => {
  calls.length = 0
  for (const k of Object.keys(tables)) delete tables[k]
  tables.user_cards = [
    { id: 1, user_id: 'me', oracle_id: 'o-sol' },
    { id: 2, user_id: 'someone-else', oracle_id: 'o-sol' },
  ]
  tables.user_copies = [
    { id: 10, user_id: 'me', card_id: 1, printing_id: 'p-clb', finish: 'nonfoil', is_proxy: false, missing: false },
    { id: 11, user_id: 'me', card_id: 1, printing_id: 'p-clb', finish: 'nonfoil', is_proxy: false, missing: false },
    { id: 12, user_id: 'me', card_id: 1, printing_id: 'p-cmm', finish: 'foil', is_proxy: true, missing: false },
    { id: 13, user_id: 'me', card_id: 1, printing_id: 'p-clb', finish: 'nonfoil', is_proxy: false, missing: true },
    { id: 99, user_id: 'someone-else', card_id: 2, printing_id: 'p-clb', finish: 'nonfoil', is_proxy: false, missing: false },
  ]
  tables.deck_cards = [
    { id: 1, user_id: 'me', copy_id: 11, deck_id: 5 },
    { id: 2, user_id: 'someone-else', copy_id: 99, deck_id: 6 },
  ]
  tables.decks = [
    { id: 5, user_id: 'me', name: 'Korvold' },
    { id: 6, user_id: 'someone-else', name: 'Not mine' },
  ]
  tables.ref_printings = [
    { scryfall_id: 'p-clb', set_code: 'clb', collector_number: '351' },
    { scryfall_id: 'p-cmm', set_code: 'cmm', collector_number: '410' },
  ]
})

describe('POST /api/decks/import/ownership', () => {
  it('splits free and held copies, leaves out missing copies, and names the holder deck', async () => {
    const res = await POST(req({ cards: [card] }))
    expect(res.status).toBe(200)
    const { rows } = await res.json()
    expect(rows).toHaveLength(1)
    expect(rows[0].free).toEqual([
      { printingId: 'p-clb', setCode: 'clb', collectorNumber: '351', finish: 'nonfoil', isProxy: false, count: 1 },
      { printingId: 'p-cmm', setCode: 'cmm', collectorNumber: '410', finish: 'foil', isProxy: true, count: 1 },
    ])
    expect(rows[0].held).toEqual([
      { printingId: 'p-clb', setCode: 'clb', collectorNumber: '351', finish: 'nonfoil', isProxy: false, count: 1, deckId: 5, deckName: 'Korvold' },
    ])
  })

  it('returns no copy ids and nothing from another user', async () => {
    const res = await POST(req({ cards: [card] }))
    const text = JSON.stringify(await res.json())
    expect(text).not.toMatch(/"(id|copyId|copy_id)"/)
    expect(text).not.toContain('Not mine')
    // Every table the route reads that has an owner was filtered by the signed-in user.
    for (const c of calls.filter((c) => ['user_cards', 'user_copies', 'deck_cards', 'decks'].includes(c.table))) {
      expect(c.eq).toContainEqual(['user_id', 'me'])
    }
  })

  it('only reads: no write was attempted', async () => {
    const res = await POST(req({ cards: [card] }))
    expect(res.status).toBe(200)
    expect(calls.every((c) => c.op === 'select')).toBe(true)
  })

  it('gives an empty result for a card the owner does not have', async () => {
    const res = await POST(req({ cards: [{ ...card, rowKey: 'k2', oracleId: 'o-other' }] }))
    expect((await res.json()).rows).toEqual([{ rowKey: 'k2', oracleId: 'o-other', free: [], held: [] }])
  })

  it('rejects bad bodies with 400', async () => {
    expect((await POST(req({}))).status).toBe(400)
    expect((await POST(req({ cards: [{ rowKey: 'x' }] }))).status).toBe(400)
    expect((await POST(req({ cards: [card, card] }))).status).toBe(400)
    const many = Array.from({ length: 1001 }, (_, i) => ({ ...card, rowKey: `k${i}` }))
    expect((await POST(req({ cards: many }))).status).toBe(400)
  })

  it('requires sign-in', async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await POST(req({ cards: [card] }))).status).toBe(401)
  })
})
