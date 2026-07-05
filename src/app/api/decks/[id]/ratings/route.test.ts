import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Supabase Client
// ---------------------------------------------------------------------------

let mockTables: Record<string, unknown[]> = {}

function createQueryMock(table: string) {
  const rows = () => mockTables[table] || []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    _filters: [] as Array<{ field: string; op: string; value: unknown }>,
    _selectFields: '*',
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
  }

  return chain
}

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
  const request = new NextRequest('http://localhost/api/decks/' + id + '/ratings')
  return GET(request, { params: Promise.resolve({ id }) })
}

const validRatingsContent = JSON.stringify({
  scores: { consistency: 7, resilience: 5, interaction: 6, speed: 4 },
  contributingCards: {
    tutors: ['Demonic Tutor'],
    drawEngines: ['Rhystic Study'],
    recursion: ['Eternal Witness'],
    removal: ['Swords to Plowshares'],
    counterspells: ['Counterspell'],
    boardWipes: ['Wrath of God'],
    fastMana: ['Sol Ring'],
  },
  keyCards: [
    { cardName: 'Muldrotha, the Gravetide', reason: 'Commander enables graveyard recursion', priorityTier: 'commander' },
  ],
  primer: {
    coreStrategy: 'Reanimate value creatures. Win with combos.',
    mulliganPriorities: ['Keep hands with 3+ lands and ramp'],
    keyTips: ['Play Muldrotha after filling graveyard'],
  },
  weaknesses: [
    { description: 'Vulnerable to graveyard hate', severity: 'Critical', hateCards: ['Rest in Peace'] },
  ],
  metadata: { nonLandCardCount: 65, insufficientData: false },
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/decks/[id]/ratings', () => {
  beforeEach(() => {
    mockTables = {}
  })

  it('returns 200 with parsed ratings JSON when deck and ratings exist', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Muldrotha Graveyard' }]
    mockTables['deck_ratings'] = [{ deck_id: 1, content: validRatingsContent }]

    const response = await callGET('1')
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.scores.consistency).toBe(7)
    expect(body.scores.resilience).toBe(5)
    expect(body.scores.interaction).toBe(6)
    expect(body.scores.speed).toBe(4)
    expect(body.contributingCards.tutors).toEqual(['Demonic Tutor'])
    expect(body.keyCards).toHaveLength(1)
    expect(body.primer.coreStrategy).toContain('Reanimate')
    expect(body.weaknesses[0].severity).toBe('Critical')
  })

  it('returns 404 with "No ratings generated" when deck exists but no ratings', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Muldrotha Graveyard' }]

    const response = await callGET('1')
    expect(response.status).toBe(404)

    const body = await response.json()
    expect(body.error).toMatch(/no ratings generated/i)
  })

  it('returns 404 with "Deck not found" when deck does not exist', async () => {
    const response = await callGET('999')
    expect(response.status).toBe(404)

    const body = await response.json()
    expect(body.error).toMatch(/deck not found/i)
  })

  describe('invalid deck ID returns 400', () => {
    it('rejects alphabetic ID', async () => {
      const response = await callGET('abc')
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toMatch(/invalid deck id/i)
    })

    it('rejects negative ID', async () => {
      const response = await callGET('-1')
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toMatch(/invalid deck id/i)
    })

    it('rejects float ID', async () => {
      const response = await callGET('1.5')
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toMatch(/invalid deck id/i)
    })

    it('rejects zero', async () => {
      const response = await callGET('0')
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toMatch(/invalid deck id/i)
    })
  })

  it('only exports GET (no POST, PUT, DELETE)', async () => {
    const routeModule = await import('./route')
    expect(routeModule.GET).toBeDefined()
    expect((routeModule as Record<string, unknown>).POST).toBeUndefined()
    expect((routeModule as Record<string, unknown>).PUT).toBeUndefined()
    expect((routeModule as Record<string, unknown>).DELETE).toBeUndefined()
  })

  it('returns 404 when ratings content is malformed JSON', async () => {
    mockTables['decks'] = [{ id: 1, name: 'Muldrotha Graveyard' }]
    mockTables['deck_ratings'] = [{ deck_id: 1, content: '{not valid json!!!' }]

    const response = await callGET('1')
    expect(response.status).toBe(404)

    const body = await response.json()
    expect(body.error).toMatch(/no ratings generated/i)
  })
})
