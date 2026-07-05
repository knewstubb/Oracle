import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Supabase Client
// ---------------------------------------------------------------------------

let mockTables: Record<string, unknown[]> = {}

function applyFilters(
  rows: unknown[],
  filters: Array<{ field: string; op: string; value: unknown }>
): unknown[] {
  let result = [...rows]
  for (const f of filters) {
    switch (f.op) {
      case 'eq':
        result = result.filter(
          (r) => (r as Record<string, unknown>)[f.field] === f.value
        )
        break
      case 'neq':
        result = result.filter(
          (r) => (r as Record<string, unknown>)[f.field] !== f.value
        )
        break
      case 'not_is':
        result = result.filter(
          (r) => (r as Record<string, unknown>)[f.field] != null
        )
        break
    }
  }
  return result
}

function createQueryMock(table: string) {
  const rows = () => mockTables[table] || []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    _filters: [] as Array<{ field: string; op: string; value: unknown }>,
    _selectFields: '*',
    _limit: undefined as number | undefined,
    _orderBy: [] as Array<{ col: string; opts: { ascending: boolean } }>,
    _head: false,
    _countMode: false,
    select(fields: string, opts?: { count?: string; head?: boolean }) {
      chain._selectFields = fields
      if (opts?.head) chain._head = true
      if (opts?.count === 'exact') chain._countMode = true
      return chain
    },
    eq(field: string, value: unknown) {
      chain._filters.push({ field, op: 'eq', value })
      return chain
    },
    neq(field: string, value: unknown) {
      chain._filters.push({ field, op: 'neq', value })
      return chain
    },
    not(field: string, op: string, _value: unknown) {
      chain._filters.push({ field, op: `not_${op}`, value: _value })
      return chain
    },
    limit(n: number) {
      chain._limit = n
      return chain
    },
    order(col: string, opts: { ascending: boolean }) {
      chain._orderBy.push({ col, opts })
      return chain
    },
    maybeSingle() {
      let filtered = applyFilters(rows(), chain._filters)
      // For deck_allocations queries with select that includes 'decks(name)',
      // enrich with the joined deck name
      if (table === 'deck_allocations' && chain._selectFields.includes('decks(name)')) {
        filtered = filtered.map((row) => {
          const r = row as Record<string, unknown>
          const deck = (mockTables['decks'] || []).find(
            (d) => (d as Record<string, unknown>).id === r.deck_id
          )
          return { ...r, decks: deck ? { name: (deck as Record<string, unknown>).name } : null }
        })
      }
      if (filtered.length === 0) {
        return Promise.resolve({ data: null, error: null })
      }
      return Promise.resolve({ data: filtered[0], error: null })
    },
    then(
      onFulfilled: (val: unknown) => unknown,
      onRejected?: (err: unknown) => unknown
    ) {
      let filtered = applyFilters(rows(), chain._filters)

      // Apply ordering — multi-column sort (first listed = primary)
      if (chain._orderBy.length > 0) {
        filtered.sort((a, b) => {
          for (const o of chain._orderBy) {
            const aVal = (a as Record<string, unknown>)[o.col]
            const bVal = (b as Record<string, unknown>)[o.col]
            if (aVal === bVal) continue
            const cmp = aVal! > bVal! ? 1 : -1
            return o.opts.ascending ? cmp : -cmp
          }
          return 0
        })
      }

      if (chain._limit !== undefined) {
        filtered = filtered.slice(0, chain._limit)
      }

      if (chain._countMode && chain._head) {
        return Promise.resolve({ data: null, error: null, count: filtered.length }).then(
          onFulfilled,
          onRejected
        )
      }

      return Promise.resolve({ data: filtered, error: null }).then(onFulfilled, onRejected)
    },
  }

  // Make chain thenable
  Object.defineProperty(chain, 'then', {
    value: chain.then,
    enumerable: false,
    configurable: true,
    writable: true,
  })

  return chain
}

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => createQueryMock(table),
  }),
}))

import { GET } from './route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function callGET(id: string) {
  const request = new NextRequest(`http://localhost/api/decks/${id}/upgrade`)
  return GET(request, { params: Promise.resolve({ id }) })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/decks/[id]/upgrade', () => {
  beforeEach(() => {
    mockTables = {}
  })

  it('returns 400 for non-integer deck ID', async () => {
    const response = await callGET('abc')
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid deck ID')
  })

  it('returns 400 for negative deck ID', async () => {
    const response = await callGET('-1')
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid deck ID')
  })

  it('returns 400 for zero deck ID', async () => {
    const response = await callGET('0')
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid deck ID')
  })

  it('returns 404 when deck does not exist', async () => {
    const response = await callGET('999')
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error).toBe('Deck not found')
  })

  it('returns empty candidates with change_log when no upgrade data exists', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]

    const response = await callGET('1')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.candidates).toEqual([])
    expect(body.change_log).toEqual([])
  })

  it('returns empty candidates but includes change_log entries when no upgrade data exists', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]
    mockTables['upgrade_change_log'] = [
      { id: 1, deck_id: 1, cut_card: 'Manalith', add_card: 'Arcane Signet', reason: 'Strictly better ramp', skipped: false, date: '2025-06-20' },
    ]

    const response = await callGET('1')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.candidates).toEqual([])
    expect(body.change_log).toHaveLength(1)
    expect(body.change_log[0].cut_card).toBe('Manalith')
    expect(body.change_log[0].add_card).toBe('Arcane Signet')
    expect(body.change_log[0].skipped).toBe(false)
  })

  it('returns enriched candidates with source field defaulting to analysis', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]
    mockTables['collection'] = [{ card_name: 'Spore Frog', quantity: 1 }]
    mockTables['deck_allocations'] = []
    mockTables['deck_cards'] = []

    const candidates = [
      {
        priority: 1,
        impact: 85,
        cut: { card_name: 'Manalith', reason: 'Redundant ramp' },
        add: { card_name: 'Spore Frog', reason: 'Recursion value', edhrec_percent: 72, price: 1.5 },
      },
    ]

    mockTables['deck_upgrades'] = [{ deck_id: 1, content: JSON.stringify(candidates) }]

    const response = await callGET('1')
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.candidates).toHaveLength(1)
    expect(body.candidates[0].source).toBe('analysis')
    expect(body.candidates[0].priority).toBe(1)
    expect(body.candidates[0].impact).toBe(85)
    expect(body.candidates[0].cut.card_name).toBe('Manalith')
    expect(body.candidates[0].cut.ownership_status).toBe('not_owned')
    expect(body.candidates[0].add.card_name).toBe('Spore Frog')
    expect(body.candidates[0].add.ownership_status).toBe('original')
    expect(body.candidates[0].add.edhrec_percent).toBe(72)
    expect(body.candidates[0].add.price).toBe(1.5)
  })

  it('preserves source field when already set to debrief', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]
    mockTables['collection'] = []
    mockTables['deck_allocations'] = []
    mockTables['deck_cards'] = []

    const candidates = [
      {
        priority: 1,
        impact: 90,
        source: 'debrief',
        cut: { card_name: 'Old Card', reason: 'Underperforming' },
        add: { card_name: 'New Card', reason: 'Better synergy' },
      },
    ]

    mockTables['deck_upgrades'] = [{ deck_id: 1, content: JSON.stringify(candidates) }]

    const response = await callGET('1')
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.candidates[0].source).toBe('debrief')
  })

  it('enriches add card with proxy ownership and holder deck name', async () => {
    mockTables['decks'] = [
      { id: 1, name: 'Test Deck' },
      { id: 2, name: 'Other Deck' },
    ]
    mockTables['collection'] = [{ card_name: 'Sol Ring', quantity: 1 }]
    mockTables['deck_allocations'] = [
      { card_name: 'Sol Ring', deck_id: 2, role: 'original' },
    ]
    mockTables['deck_cards'] = []

    const candidates = [
      {
        priority: 1,
        impact: 70,
        cut: { card_name: 'Worn Powerstone', reason: 'Slow ramp' },
        add: { card_name: 'Sol Ring', reason: 'Best ramp in format' },
      },
    ]

    mockTables['deck_upgrades'] = [{ deck_id: 1, content: JSON.stringify(candidates) }]

    const response = await callGET('1')
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.candidates[0].add.ownership_status).toBe('proxy')
    expect(body.candidates[0].add.holder_deck_name).toBe('Other Deck')
  })

  it('detects proxy conflict when add card is allocated as original elsewhere', async () => {
    mockTables['decks'] = [
      { id: 1, name: 'Test Deck' },
      { id: 2, name: 'Holder Deck' },
    ]
    mockTables['collection'] = [{ card_name: 'Cyclonic Rift', quantity: 1 }]
    mockTables['deck_allocations'] = [
      { card_name: 'Cyclonic Rift', deck_id: 2, role: 'original' },
    ]
    mockTables['deck_cards'] = [
      { deck_id: 2, card_name: 'Cyclonic Rift', quantity: 1 },
    ]

    const candidates = [
      {
        priority: 1,
        impact: 95,
        cut: { card_name: 'Devastation Tide', reason: 'Sorcery-speed bounce' },
        add: { card_name: 'Cyclonic Rift', reason: 'Best blue board wipe' },
      },
    ]

    mockTables['deck_upgrades'] = [{ deck_id: 1, content: JSON.stringify(candidates) }]

    const response = await callGET('1')
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.candidates[0].conflict).toBeDefined()
    expect(body.candidates[0].conflict.deck_name).toBe('Holder Deck')
  })

  it('returns change_log ordered by date DESC', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]
    mockTables['upgrade_change_log'] = [
      { id: 1, deck_id: 1, cut_card: 'Card A', add_card: 'Card B', reason: 'Upgrade', skipped: false, date: '2025-06-18' },
      { id: 2, deck_id: 1, cut_card: 'Card C', add_card: 'Card D', reason: 'Not needed', skipped: true, date: '2025-06-20' },
      { id: 3, deck_id: 1, cut_card: 'Card E', add_card: 'Card F', reason: 'Better option', skipped: false, date: '2025-06-19' },
    ]

    const response = await callGET('1')
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.change_log).toHaveLength(3)
    // Most recent first
    expect(body.change_log[0].date).toBe('2025-06-20')
    expect(body.change_log[0].skipped).toBe(true)
    expect(body.change_log[1].date).toBe('2025-06-19')
    expect(body.change_log[1].skipped).toBe(false)
    expect(body.change_log[2].date).toBe('2025-06-18')
  })

  it('converts skipped to boolean in change_log entries', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]
    mockTables['upgrade_change_log'] = [
      { id: 1, deck_id: 1, cut_card: 'A', add_card: 'B', reason: 'Applied', skipped: false, date: '2025-06-21' },
      { id: 2, deck_id: 1, cut_card: 'C', add_card: 'D', reason: 'Skipped', skipped: true, date: '2025-06-20' },
    ]

    const response = await callGET('1')
    const body = await response.json()

    // Ordered by date DESC: 2025-06-21 first, then 2025-06-20
    expect(body.change_log[0].skipped).toBe(false)
    expect(body.change_log[1].skipped).toBe(true)
    // Verify they are actual booleans
    expect(typeof body.change_log[0].skipped).toBe('boolean')
    expect(typeof body.change_log[1].skipped).toBe('boolean')
  })

  it('does not include change_log from other decks', async () => {
    mockTables['decks'] = [
      { id: 1, name: 'Deck A' },
      { id: 2, name: 'Deck B' },
    ]
    mockTables['upgrade_change_log'] = [
      { id: 1, deck_id: 1, cut_card: 'X', add_card: 'Y', reason: 'reason1', skipped: false, date: '2025-06-20' },
      { id: 2, deck_id: 2, cut_card: 'A', add_card: 'B', reason: 'reason2', skipped: false, date: '2025-06-20' },
    ]

    const response = await callGET('1')
    const body = await response.json()

    expect(body.change_log).toHaveLength(1)
    expect(body.change_log[0].cut_card).toBe('X')
  })
})

describe('Method handling', () => {
  it('only exports GET (other methods get 405 from Next.js)', async () => {
    const routeModule = await import('./route')
    expect(routeModule.GET).toBeDefined()
    expect((routeModule as Record<string, unknown>).PUT).toBeUndefined()
    expect((routeModule as Record<string, unknown>).POST).toBeUndefined()
    expect((routeModule as Record<string, unknown>).DELETE).toBeUndefined()
    expect((routeModule as Record<string, unknown>).PATCH).toBeUndefined()
  })
})
