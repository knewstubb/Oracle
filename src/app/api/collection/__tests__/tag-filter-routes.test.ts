import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// A small in-memory database: the view connector_collection_copies and a few tables, answering by what was asked.
type Row = Record<string, unknown>
let viewRows: Row[]
let userCards: Row[]
let calls: { table: string; select: string; filters: { op: string; args: unknown[] }[] }[]

function chainFor(table: string, select: string) {
  const rec = { table, select, filters: [] as { op: string; args: unknown[] }[] }
  calls.push(rec)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {}
  for (const op of ['eq', 'in', 'ilike', 'or', 'order', 'range', 'not']) {
    chain[op] = (...args: unknown[]) => {
      rec.filters.push({ op, args })
      return chain
    }
  }
  chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
    let rows: Row[] = []
    if (table === 'connector_collection_copies') {
      rows = viewRows
      for (const f of rec.filters) {
        if (f.op === 'eq' && f.args[0] === 'is_proxy') rows = rows.filter((r) => r.is_proxy === f.args[1])
        if (f.op === 'in') rows = rows.filter((r) => (f.args[1] as unknown[]).includes(r[f.args[0] as string]))
      }
      const range = rec.filters.find((f) => f.op === 'range')
      const total = rows.length
      if (range) rows = rows.slice(range.args[0] as number, (range.args[1] as number) + 1)
      return Promise.resolve({ data: rows, error: null, count: total }).then(ok, bad)
    }
    if (table === 'user_cards') {
      rows = userCards
      const inF = rec.filters.find((f) => f.op === 'in')
      if (inF) rows = rows.filter((r) => (inF.args[1] as unknown[]).includes(r[inF.args[0] as string]))
      return Promise.resolve({ data: rows, error: null, count: rows.length }).then(ok, bad)
    }
    return Promise.resolve({ data: [], error: null, count: 0 }).then(ok, bad)
  }
  return chain
}
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => ({ from: (t: string) => ({ select: (s: string) => chainFor(t, s) }) }) }))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }) }))
vi.mock('@/lib/price-store', () => ({ getLastRefreshTimestamp: async () => null, isPriceDataStale: async () => false }))

let tagged: Set<string> | Error
const loadTagged = vi.fn(async () => {
  if (tagged instanceof Error) throw tagged
  return tagged
})
vi.mock('@/lib/collection-tag-filter', async (orig) => ({ ...(await orig<typeof import('@/lib/collection-tag-filter')>()), loadTagFilterOracleIds: () => loadTagged() }))

import { GET as rollup } from '../rollup/route'
import { GET as printings } from '../printings/route'

const get = (handler: (r: NextRequest) => Promise<Response>, path: string, params: Record<string, string>) => {
  const url = new URL(`http://localhost:3000/api/collection/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return handler(new NextRequest(url))
}

beforeEach(() => {
  calls = []
  loadTagged.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  tagged = new Set(['o-sol', 'o-warren'])
  viewRows = [
    { copy_id: 1, card_id: 10, oracle_id: 'o-sol', card_name: 'Sol Ring', printing_id: null, finish: 'nonfoil', is_proxy: false },
    { copy_id: 2, card_id: 11, oracle_id: 'o-forest', card_name: 'Forest', printing_id: null, finish: 'nonfoil', is_proxy: false },
    { copy_id: 3, card_id: 12, oracle_id: 'o-warren', card_name: 'Warren Soultrader', printing_id: null, finish: 'nonfoil', is_proxy: false },
    { copy_id: 4, card_id: 10, oracle_id: 'o-sol', card_name: 'Sol Ring', printing_id: null, finish: 'foil', is_proxy: false },
  ]
  userCards = [
    { id: 10, card_name: 'Sol Ring', oracle_id: 'o-sol', color_identity: null, type_line: null },
    { id: 12, card_name: 'Warren Soultrader', oracle_id: 'o-warren', color_identity: null, type_line: null },
  ]
})

describe('collection rollup (grid) with a Tag filter', () => {
  it('lists only the cards that carry the Tags, counts them, and asks the Tag read once', async () => {
    const res = await get(rollup, 'rollup', { tags: 'sacrifice_outlet,ramp', tagsMatch: 'any' })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.totalCount).toBe(2)
    expect(body.rows.map((r: { cardName: string }) => r.cardName)).toEqual(['Sol Ring', 'Warren Soultrader'])
    expect(loadTagged).toHaveBeenCalledTimes(1)
    expect(calls.find((c) => c.table === 'connector_collection_copies')!.select).toContain('oracle_id')
  })
  it('accepts the Tag by its screen name too', async () => {
    const res = await get(rollup, 'rollup', { tags: 'Sacrifice outlet' })
    expect(res.status).toBe(200)
  })
  it('does not read Tags when none are asked for', async () => {
    await get(rollup, 'rollup', {})
    expect(loadTagged).not.toHaveBeenCalled()
  })
  it('a name that is not one of the 40 Tags is a 400, not an empty list', async () => {
    const res = await get(rollup, 'rollup', { tags: 'removal_spell' })
    expect(res.status).toBe(400)
  })
  it('a failed Tag read is an error answer (the screen shows its load failure), never "no cards"', async () => {
    tagged = new Error('Could not read the Tags')
    const res = await get(rollup, 'rollup', { tags: 'ramp' })
    expect(res.status).toBe(500)
    expect((await res.json()).rows).toBeUndefined()
  })
  it('no card has the Tags: an empty list with a count of 0', async () => {
    tagged = new Set(['nothing'])
    const body = await (await get(rollup, 'rollup', { tags: 'ramp' })).json()
    expect(body.totalCount).toBe(0)
    expect(body.rows).toEqual([])
  })
})

describe('collection printings (list) with a Tag filter', () => {
  it('pages only the copies of tagged cards: 3 copies of 2 cards here, counted exactly', async () => {
    const res = await get(printings, 'printings', { tags: 'ramp', pageSize: '2' })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.totalCount).toBe(3)
    const pageRead = calls.filter((c) => c.table === 'connector_collection_copies' && c.filters.some((f) => f.op === 'in' && f.args[0] === 'copy_id'))
    expect(pageRead).toHaveLength(1)
    expect(pageRead[0].filters.find((f) => f.op === 'in')!.args[1]).toEqual([1, 3]) // page 1 of size 2, in name order
  })
  it('page 2 continues the same filtered list', async () => {
    const body = await (await get(printings, 'printings', { tags: 'ramp', pageSize: '2', page: '2' })).json()
    expect(body.totalCount).toBe(3)
    const pageRead = calls.filter((c) => c.filters.some((f) => f.op === 'in' && f.args[0] === 'copy_id'))
    expect(pageRead[0].filters.find((f) => f.op === 'in')!.args[1]).toEqual([4])
  })
  it('a Tag filter nobody matches is an empty list with a count of 0', async () => {
    tagged = new Set(['nothing'])
    const body = await (await get(printings, 'printings', { tags: 'ramp' })).json()
    expect(body.totalCount).toBe(0)
    expect(body.rows).toEqual([])
  })
  it('a failed Tag read is a 500, not an empty list', async () => {
    tagged = new Error('x')
    expect((await get(printings, 'printings', { tags: 'ramp' })).status).toBe(500)
  })
  it('an unknown Tag is a 400', async () => {
    expect((await get(printings, 'printings', { tags: 'nope' })).status).toBe(400)
  })
})
