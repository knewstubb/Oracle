import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Table-driven Supabase mock
//
// card-data's owned-printing helpers run three sequential reads:
//   1. user_cards      -> select(id, card_name)   eq(user_id) .in(card_name)
//   2. user_copies     -> select(card_id, printing_id) eq(user_id) eq(is_proxy) .in(card_id) .not(printing_id, is, null)
//   3. ref_printings   -> select(scryfall_id, released_at) .in(scryfall_id)
//
// The mock reproduces eq / in / not filters and `.maybeSingle()`.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>
type Filter = { op: 'eq' | 'in' | 'not'; field: string; value: unknown }

let mockTables: Record<string, Row[]> = {}

function matchesFilters(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const value = row[filter.field]
    if (filter.op === 'eq') return value === filter.value
    if (filter.op === 'in') return Array.isArray(filter.value) && (filter.value as unknown[]).includes(value)
    // only `not(field, 'is', null)` is used
    return filter.value === null ? value !== null && value !== undefined : true
  })
}

function createQueryMock(table: string) {
  const filters: Filter[] = []
  let limitCount: number | null = null

  const run = (): Row[] => {
    let rows = (mockTables[table] ?? []).filter((row) => matchesFilters(row, filters))
    if (limitCount !== null) rows = rows.slice(0, limitCount)
    return rows
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = {
    select: () => query,
    eq: (field: string, value: unknown) => {
      filters.push({ op: 'eq', field, value })
      return query
    },
    in: (field: string, value: unknown[]) => {
      filters.push({ op: 'in', field, value })
      return query
    },
    not: (field: string, _op: string, value: unknown) => {
      filters.push({ op: 'not', field, value })
      return query
    },
    order: () => query,
    limit: (count: number) => {
      limitCount = count
      return query
    },
    maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
      Promise.resolve({ data: run(), error: null }).then(resolve, reject),
  }

  return query
}

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => createQueryMock(table),
  }),
}))

import {
  selectPreferredOwnedPrinting,
  getOwnedPrintingsByNames,
  getOwnedPrintingForCard,
  getPrintingById,
} from '../card-data'

describe('selectPreferredOwnedPrinting', () => {
  it('returns null when no printings are owned', () => {
    expect(selectPreferredOwnedPrinting([])).toBeNull()
  })

  it('returns the only owned printing', () => {
    expect(
      selectPreferredOwnedPrinting([{ scryfall_id: 'print-a', released_at: '2020-01-01' }])
    ).toBe('print-a')
  })

  it('prefers the most recently released owned printing', () => {
    expect(
      selectPreferredOwnedPrinting([
        { scryfall_id: 'old', released_at: '2019-01-01' },
        { scryfall_id: 'new', released_at: '2024-01-01' },
        { scryfall_id: 'mid', released_at: '2021-01-01' },
      ])
    ).toBe('new')
  })

  it('breaks ties deterministically by printing id', () => {
    expect(
      selectPreferredOwnedPrinting([
        { scryfall_id: 'bbb', released_at: '2024-01-01' },
        { scryfall_id: 'aaa', released_at: '2024-01-01' },
      ])
    ).toBe('aaa')
  })

  it('treats a missing release date as oldest but still returns a printing', () => {
    expect(
      selectPreferredOwnedPrinting([
        { scryfall_id: 'known', released_at: '2019-01-01' },
        { scryfall_id: 'unknown', released_at: null },
      ])
    ).toBe('known')
  })
})

describe('getOwnedPrintingsByNames', () => {
  beforeEach(() => {
    mockTables = {}
  })

  it('returns an empty map when the owner has no user_cards row', async () => {
    mockTables['user_cards'] = []
    const result = await getOwnedPrintingsByNames(['Sol Ring'], 'user-1')
    expect(result.size).toBe(0)
  })

  it('returns the owned printing for a card', async () => {
    mockTables['user_cards'] = [{ id: 10, card_name: 'Sol Ring', user_id: 'user-1' }]
    mockTables['user_copies'] = [
      { card_id: 10, printing_id: 'printing-owned', is_proxy: false, user_id: 'user-1' },
    ]
    mockTables['ref_printings'] = [
      { scryfall_id: 'printing-owned', released_at: '2021-01-01' },
    ]

    const result = await getOwnedPrintingsByNames(['Sol Ring'], 'user-1')
    expect(result.get('Sol Ring')).toBe('printing-owned')
  })

  it('ignores proxies when choosing an owned printing', async () => {
    mockTables['user_cards'] = [{ id: 10, card_name: 'Sol Ring', user_id: 'user-1' }]
    mockTables['user_copies'] = [
      { card_id: 10, printing_id: 'proxy-printing', is_proxy: true, user_id: 'user-1' },
    ]
    mockTables['ref_printings'] = [
      { scryfall_id: 'proxy-printing', released_at: '2024-01-01' },
    ]

    const result = await getOwnedPrintingsByNames(['Sol Ring'], 'user-1')
    expect(result.has('Sol Ring')).toBe(false)
  })

  it('picks the most recent when several printings are owned', async () => {
    mockTables['user_cards'] = [{ id: 10, card_name: 'Sol Ring', user_id: 'user-1' }]
    mockTables['user_copies'] = [
      { card_id: 10, printing_id: 'old-printing', is_proxy: false, user_id: 'user-1' },
      { card_id: 10, printing_id: 'new-printing', is_proxy: false, user_id: 'user-1' },
    ]
    mockTables['ref_printings'] = [
      { scryfall_id: 'old-printing', released_at: '2019-01-01' },
      { scryfall_id: 'new-printing', released_at: '2024-01-01' },
    ]

    const result = await getOwnedPrintingsByNames(['Sol Ring'], 'user-1')
    expect(result.get('Sol Ring')).toBe('new-printing')
  })

  it('uses an owned printing even when ref_printings has no release date', async () => {
    mockTables['user_cards'] = [{ id: 10, card_name: 'Sol Ring', user_id: 'user-1' }]
    mockTables['user_copies'] = [
      { card_id: 10, printing_id: 'unsynced-printing', is_proxy: false, user_id: 'user-1' },
    ]
    mockTables['ref_printings'] = []

    const result = await getOwnedPrintingsByNames(['Sol Ring'], 'user-1')
    expect(result.get('Sol Ring')).toBe('unsynced-printing')
  })

  it('only returns printings for the requested owner', async () => {
    mockTables['user_cards'] = [
      { id: 10, card_name: 'Sol Ring', user_id: 'user-1' },
      { id: 20, card_name: 'Sol Ring', user_id: 'other-user' },
    ]
    mockTables['user_copies'] = [
      { card_id: 20, printing_id: 'other-printing', is_proxy: false, user_id: 'other-user' },
    ]
    mockTables['ref_printings'] = [
      { scryfall_id: 'other-printing', released_at: '2024-01-01' },
    ]

    const result = await getOwnedPrintingsByNames(['Sol Ring'], 'user-1')
    expect(result.has('Sol Ring')).toBe(false)
  })

  it('accepts the convenience single-card wrapper', async () => {
    mockTables['user_cards'] = [{ id: 10, card_name: 'Sol Ring', user_id: 'user-1' }]
    mockTables['user_copies'] = [
      { card_id: 10, printing_id: 'printing-owned', is_proxy: false, user_id: 'user-1' },
    ]
    mockTables['ref_printings'] = [{ scryfall_id: 'printing-owned', released_at: '2021-01-01' }]

    await expect(getOwnedPrintingForCard('Sol Ring', 'user-1')).resolves.toBe('printing-owned')
  })
})

describe('getPrintingById', () => {
  beforeEach(() => {
    mockTables = {}
  })

  it('returns printing data for an exact scryfall_id', async () => {
    mockTables['ref_printings'] = [
      {
        scryfall_id: 'printing-1',
        oracle_id: 'oracle-1',
        name: 'Sol Ring',
        set_code: 'c21',
        type_line: 'Artifact',
        released_at: '2021-01-01',
      },
    ]

    const result = await getPrintingById('printing-1')
    expect(result?.scryfall_id).toBe('printing-1')
    expect(result?.name).toBe('Sol Ring')
  })

  it('returns null for an unknown printing id', async () => {
    mockTables['ref_printings'] = []
    await expect(getPrintingById('missing')).resolves.toBeNull()
  })

  it('returns null for an empty printing id (never resolves oracle ids)', async () => {
    await expect(getPrintingById('')).resolves.toBeNull()
  })
})
