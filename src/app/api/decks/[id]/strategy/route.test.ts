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
    if (f.op === 'eq') {
      result = result.filter(
        (r) => (r as Record<string, unknown>)[f.field] === f.value
      )
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
    _upsertData: null as unknown,
    select(fields: string) {
      chain._selectFields = fields
      return chain
    },
    eq(field: string, value: unknown) {
      chain._filters.push({ field, op: 'eq', value })
      return chain
    },
    maybeSingle() {
      const filtered = applyFilters(rows(), chain._filters)
      if (filtered.length === 0) {
        return Promise.resolve({ data: null, error: null })
      }
      return Promise.resolve({ data: filtered[0], error: null })
    },
    single() {
      const filtered = applyFilters(rows(), chain._filters)
      if (filtered.length === 0) {
        return Promise.resolve({ data: null, error: { message: 'Not found', code: 'PGRST116' } })
      }
      return Promise.resolve({ data: filtered[0], error: null })
    },
    upsert(data: unknown, _opts?: unknown) {
      // Simulate upsert: insert or replace by deck_id
      const record = data as Record<string, unknown>
      if (!mockTables[table]) mockTables[table] = []
      const existingIdx = mockTables[table].findIndex(
        (r) => (r as Record<string, unknown>).deck_id === record.deck_id
      )
      if (existingIdx >= 0) {
        mockTables[table][existingIdx] = record
      } else {
        mockTables[table].push(record)
      }
      return Promise.resolve({ error: null })
    },
  }

  return chain
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => createQueryMock(table),
  }),
}))

import { GET, PUT } from './route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function callGET(id: string) {
  const request = new NextRequest(`http://localhost/api/decks/${id}/strategy`)
  return GET(request, { params: Promise.resolve({ id }) })
}

function callPUT(id: string, body: Record<string, unknown>) {
  const request = new NextRequest(`http://localhost/api/decks/${id}/strategy`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
  return PUT(request, { params: Promise.resolve({ id }) })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/decks/[id]/strategy', () => {
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

  it('returns 200 with configured: false when no strategy record exists', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]

    const response = await callGET('1')
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.configured).toBe(false)
    expect(body.win_condition).toBeNull()
    expect(body.table_context).toBeNull()
    expect(body.bracket).toBeNull()
    expect(body.budget_mode).toBeNull()
    expect(body.budget_ceiling).toBeNull()
    expect(body.frustration).toBeNull()
    expect(body.strategy_notes).toBeNull()
    expect(body.format_rules).toBeNull()
  })

  it('returns 200 with configured: true and all fields when strategy exists', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]
    mockTables['deck_strategy'] = [{
      deck_id: 1,
      win_condition: 'Combo kill',
      table_context: 'Casual pod',
      bracket: 2,
      budget_mode: 'budget',
      budget_ceiling: 25.0,
      frustration: 'Too slow',
      strategy_notes: 'Focus on ramp',
      format_rules: '{"format_name":"precon_mod"}',
      health_overrides: null,
      user_id: '00000000-0000-0000-0000-000000000000',
      updated_at: '2024-01-01T00:00:00.000Z',
    }]

    const response = await callGET('1')
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.configured).toBe(true)
    expect(body.win_condition).toBe('Combo kill')
    expect(body.table_context).toBe('Casual pod')
    expect(body.bracket).toBe(2)
    expect(body.budget_mode).toBe('budget')
    expect(body.budget_ceiling).toBe(25.0)
    expect(body.frustration).toBe('Too slow')
    expect(body.strategy_notes).toBe('Focus on ramp')
    expect(body.format_rules).toEqual({ format_name: 'precon_mod' })
    expect(body.updated_at).toBe('2024-01-01T00:00:00.000Z')
  })
})

describe('PUT /api/decks/[id]/strategy', () => {
  beforeEach(() => {
    mockTables = {}
  })

  it('returns 400 for non-integer deck ID', async () => {
    const response = await callPUT('abc', { win_condition: 'test' })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid deck ID')
  })

  it('returns 400 for zero deck ID', async () => {
    const response = await callPUT('0', { win_condition: 'test' })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid deck ID')
  })

  it('returns 400 when bracket is outside 1-4', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]
    const response = await callPUT('1', { bracket: 5 })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('Bracket must be')
  })

  it('returns 400 when bracket is 0', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]
    const response = await callPUT('1', { bracket: 0 })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('Bracket must be')
  })

  it('returns 400 when budget_mode is invalid', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]
    const response = await callPUT('1', { budget_mode: 'invalid' })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('budget_mode must be one of')
  })

  it('returns 400 when budget_mode is budget but no budget_ceiling', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]
    const response = await callPUT('1', { budget_mode: 'budget' })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('budget_ceiling is required')
  })

  it('returns 400 when budget_mode is budget and budget_ceiling is null', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]
    const response = await callPUT('1', { budget_mode: 'budget', budget_ceiling: null })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('budget_ceiling is required')
  })

  it('returns 404 when deck does not exist', async () => {
    const response = await callPUT('999', { win_condition: 'test' })
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error).toBe('Deck not found')
  })

  it('creates a new strategy record and returns 200 with configured: true', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]

    const response = await callPUT('1', {
      win_condition: 'Combo kill',
      table_context: 'Casual pod',
      bracket: 2,
      budget_mode: 'budget',
      budget_ceiling: 25.0,
      frustration: 'Too slow',
      strategy_notes: 'Focus on ramp',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.configured).toBe(true)
    expect(body.win_condition).toBe('Combo kill')
    expect(body.bracket).toBe(2)
    expect(body.budget_mode).toBe('budget')
    expect(body.budget_ceiling).toBe(25.0)
    expect(body.updated_at).toBeDefined()
  })

  it('upserts (replaces) an existing strategy record', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]
    mockTables['deck_strategy'] = [{
      deck_id: 1,
      win_condition: 'Old strategy',
      bracket: 1,
      user_id: '00000000-0000-0000-0000-000000000000',
    }]

    const response = await callPUT('1', {
      win_condition: 'New strategy',
      bracket: 3,
      budget_mode: 'unrestricted',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.win_condition).toBe('New strategy')
    expect(body.bracket).toBe(3)
  })

  it('stores and retrieves format_rules as JSON', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]

    const formatRules = { format_name: 'baggy_league', rarity_restriction: 'common', progression_level: 1 }
    const response = await callPUT('1', {
      win_condition: 'Value',
      budget_mode: 'collection',
      format_rules: formatRules,
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.format_rules).toEqual(formatRules)
  })

  it('accepts valid bracket values 1-4', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]

    for (const bracket of [1, 2, 3, 4]) {
      const response = await callPUT('1', { bracket, budget_mode: 'unrestricted' })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.bracket).toBe(bracket)
    }
  })

  it('accepts budget_mode budget with valid budget_ceiling', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Test Deck' }]
    const response = await callPUT('1', { budget_mode: 'budget', budget_ceiling: 50.0 })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.budget_mode).toBe('budget')
    expect(body.budget_ceiling).toBe(50.0)
  })
})

describe('Method handling', () => {
  it('only exports GET and PUT (other methods get 405 from Next.js)', async () => {
    const routeModule = await import('./route')
    expect(routeModule.GET).toBeDefined()
    expect(routeModule.PUT).toBeDefined()
    expect((routeModule as Record<string, unknown>).POST).toBeUndefined()
    expect((routeModule as Record<string, unknown>).DELETE).toBeUndefined()
    expect((routeModule as Record<string, unknown>).PATCH).toBeUndefined()
  })
})
