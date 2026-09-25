import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Supabase — a tiny in-memory filterable table store
// ---------------------------------------------------------------------------

type Filter = { field: string; op: 'eq' | 'in'; value: unknown }

let mockTables: Record<string, Record<string, unknown>[]> = {}

function applyFilters(rows: Record<string, unknown>[], filters: Filter[]): Record<string, unknown>[] {
  let result = [...rows]
  for (const f of filters) {
    if (f.op === 'eq') {
      result = result.filter((r) => r[f.field] === f.value)
    } else {
      result = result.filter((r) => (f.value as unknown[]).includes(r[f.field]))
    }
  }
  return result
}

function createQueryMock(table: string) {
  const filters: Filter[] = []
  const rows = () => mockTables[table] || []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select() {
      return chain
    },
    eq(field: string, value: unknown) {
      filters.push({ field, op: 'eq', value })
      return chain
    },
    in(field: string, value: unknown[]) {
      filters.push({ field, op: 'in', value })
      return chain
    },
    then(
      onFulfilled: (val: { data: unknown[]; error: null }) => unknown,
      onRejected?: (err: unknown) => unknown
    ) {
      return Promise.resolve({ data: applyFilters(rows(), filters), error: null }).then(
        onFulfilled,
        onRejected
      )
    },
  }

  Object.defineProperty(chain, 'then', { value: chain.then, enumerable: false })
  return chain
}

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({ from: (table: string) => createQueryMock(table) }),
}))

import { fetchPhysicalCopyIdsForOracleId } from './collection-instance-ids'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchPhysicalCopyIdsForOracleId', () => {
  beforeEach(() => {
    mockTables = {}
  })

  it('returns the real user_copies ids for an oracle_id, not sequential placeholders', async () => {
    mockTables['user_cards'] = [
      { id: 7, oracle_id: 'oracle-sol-ring', user_id: 'user-1' },
    ]
    mockTables['user_copies'] = [
      { id: 101, card_id: 7, user_id: 'user-1' },
      { id: 205, card_id: 7, user_id: 'user-1' },
    ]

    const ids = await fetchPhysicalCopyIdsForOracleId('oracle-sol-ring', 'user-1')

    expect(ids).toEqual([101, 205])
    // Guard against a 1..N placeholder regression.
    expect(ids).not.toEqual([1, 2])
  })

  it('aggregates copies across every user_cards row sharing the oracle_id', async () => {
    mockTables['user_cards'] = [
      { id: 7, oracle_id: 'oracle-shared', user_id: 'user-1' },
      { id: 8, oracle_id: 'oracle-shared', user_id: 'user-1' },
    ]
    mockTables['user_copies'] = [
      { id: 10, card_id: 7, user_id: 'user-1' },
      { id: 11, card_id: 8, user_id: 'user-1' },
    ]

    const ids = await fetchPhysicalCopyIdsForOracleId('oracle-shared', 'user-1')

    expect(ids).toEqual([10, 11])
  })

  it('returns an empty array when the user owns no cards for the oracle_id', async () => {
    mockTables['user_cards'] = []
    mockTables['user_copies'] = [{ id: 999, card_id: 1, user_id: 'user-1' }]

    const ids = await fetchPhysicalCopyIdsForOracleId('oracle-missing', 'user-1')

    expect(ids).toEqual([])
  })

  it('scopes resolution to the given user', async () => {
    mockTables['user_cards'] = [
      { id: 7, oracle_id: 'oracle-sol-ring', user_id: 'user-1' },
    ]
    mockTables['user_copies'] = [
      { id: 101, card_id: 7, user_id: 'user-1' },
      { id: 202, card_id: 7, user_id: 'user-2' },
    ]

    const ids = await fetchPhysicalCopyIdsForOracleId('oracle-sol-ring', 'user-1')

    expect(ids).toEqual([101])
  })
})
