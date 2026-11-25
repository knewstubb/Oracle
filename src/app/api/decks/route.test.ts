import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  statusMap: new Map<string, 'available' | 'alternate' | 'claimed' | 'unowned' | 'failed'>(),
  conflictCounts: { decks: [] as { deckId: number; count: number }[] },
  deckCards: [{ deck_id: 1, card_name: 'Sol Ring', copy_id: null, categories: null }] as unknown[],
  manaBatchSizes: [] as number[],
  deckCardReads: [] as [number, number][],
  deckOrderColumns: [] as string[],
}))

vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve({ id: 'test-user-id', email: 'test@example.com' }),
}))

vi.mock('@/lib/card-status', () => ({
  computeUnresolvedStatuses: vi.fn(async () => h.statusMap),
}))

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'decks') {
        return {
          select: () => ({
            eq: () => ({
              // The list asks for the saved order: position, then name, then id.
              order: (column: string) => {
                h.deckOrderColumns.push(column)
                const q: Record<string, unknown> = {
                  order: (c: string) => {
                    h.deckOrderColumns.push(c)
                    return q
                  },
                  then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
                    resolve({
                      data: [{ id: 1, name: 'Korvold', commander_name: 'Korvold, Fae-Cursed King', format: 'commander', folder_id: null }],
                      error: null,
                    }),
                }
                return q
              },
            }),
          }),
        }
      }
      if (table === 'deck_folders') {
        return {
          select: () => ({
            eq: () => ({
              then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
                resolve({ data: [], error: null }),
            }),
          }),
        }
      }
      if (table === 'deck_cards') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                // Like the database: at most 1,000 rows per read, sliced by range.
                range: (from: number, to: number) => {
                  h.deckCardReads.push([from, to])
                  return {
                    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
                      resolve({ data: h.deckCards.slice(from, Math.min(to + 1, from + 1000)), error: null }),
                  }
                },
              }),
            }),
          }),
        }
      }
      if (table === 'brew_sessions') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                not: () => ({
                  then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
                    resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'user_copies') {
        return {
          select: () => ({
            eq: () => ({
              then: (resolve: (value: { data: null; error: null; count: number }) => unknown) =>
                resolve({ data: null, error: null, count: 0 }),
            }),
          }),
        }
      }
      if (table === 'ref_cards') {
        return {
          select: () => ({
            in: (_column: string, names: string[]) => {
              h.manaBatchSizes.push(names.length)
              return {
                then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
                  resolve({ data: [], error: null }),
              }
            },
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
    rpc: () => ({
      then: (resolve: (value: { data: { decks?: { deckId: number; count: number }[] } | null; error: null }) => unknown) =>
        resolve({ data: h.conflictCounts, error: null }),
    }),
  }),
}))

import { GET } from './route'
import { GET as GET_DETAILS } from './details/route'
import { computeUnresolvedStatuses } from '@/lib/card-status'

describe('GET /api/decks', () => {
  beforeEach(() => {
    h.statusMap = new Map()
    h.conflictCounts = { decks: [] }
    h.deckCards = [{ deck_id: 1, card_name: 'Sol Ring', copy_id: null, categories: null }]
    h.manaBatchSizes = []
    h.deckCardReads = []
    vi.clearAllMocks()
  })

  it('does not look up mana costs, so the tiles are not held up by the slowest query', async () => {
    h.deckCards = Array.from({ length: 400 }, (_, i) => ({
      deck_id: 1, card_name: `Card ${i}`, copy_id: 1, categories: null,
    }))
    const response = await GET()
    expect(response.status).toBe(200)
    expect(h.manaBatchSizes).toEqual([])
    expect((await response.json()).decks[0].pipDistribution).toBeUndefined()
  })

  it('lists decks in the saved order: position, then name, then id', async () => {
    h.deckOrderColumns.length = 0
    await GET()
    expect(h.deckOrderColumns).toEqual(['position', 'name', 'id'])
  })
  it('reads every deck card past the 1,000-row cap', async () => {
    h.deckCards = Array.from({ length: 2300 }, (_, i) => ({
      deck_id: 1, card_name: `Card ${i}`, copy_id: 1, categories: null,
    }))
    const json = await (await GET()).json()
    expect(json.decks[0].card_count).toBe(2300)
    expect(json.decks[0].completeness.total).toBe(2300)
    // First two pages together, the third only because the second was full.
    expect(h.deckCardReads).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('returns deck list with resolved/total only; status counts come from details', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.decks).toHaveLength(1)
    expect(json.decks[0].completeness).toEqual({ resolved: 0, total: 1 })
    expect(computeUnresolvedStatuses).not.toHaveBeenCalled()
  })
})

describe('GET /api/decks/details', () => {
  beforeEach(() => {
    h.statusMap = new Map()
    h.deckCards = [{ deck_id: 1, card_name: 'Sol Ring', copy_id: null, categories: null }]
    h.manaBatchSizes = []
    h.deckCardReads = []
    vi.clearAllMocks()
  })

  it('counts available, claimed and unowned unresolved cards per deck', async () => {
    h.deckCards = [
      { deck_id: 1, card_name: 'Sol Ring', copy_id: null, categories: null },
      { deck_id: 1, card_name: 'Arcane Signet', copy_id: null, categories: null },
      { deck_id: 1, card_name: 'Mana Crypt', copy_id: null, categories: null },
      { deck_id: 1, card_name: 'Resolved', copy_id: 5, categories: null },
      { deck_id: 1, card_name: 'Maybe', copy_id: null, categories: '["Maybeboard"]' },
    ]
    h.statusMap = new Map([['Sol Ring', 'available'], ['Arcane Signet', 'claimed'], ['Mana Crypt', 'unowned']])
    const json = await (await GET_DETAILS()).json()
    expect(json.unresolved[1]).toEqual({ availableCount: 1, claimedCount: 1, unownedCount: 1, failed: false })
  })

  it('marks a deck as failed when the status lookup errors', async () => {
    h.statusMap.set('Sol Ring', 'failed')
    const json = await (await GET_DETAILS()).json()
    expect(json.unresolved[1]).toEqual({ availableCount: 0, claimedCount: 0, unownedCount: 0, failed: true })
  })

  it('marks a deck as failed when a card is missing from the lookup result', async () => {
    const json = await (await GET_DETAILS()).json()
    expect(json.unresolved[1].failed).toBe(true)
  })

  it('looks up mana costs in small batches so a big deck list does not stall', async () => {
    h.deckCards = Array.from({ length: 400 }, (_, i) => ({
      deck_id: 1, card_name: `Card ${i}`, copy_id: 1, categories: null,
    }))
    const response = await GET_DETAILS()
    expect(response.status).toBe(200)
    expect(h.manaBatchSizes.length).toBeGreaterThan(1)
    expect(Math.max(...h.manaBatchSizes)).toBeLessThanOrEqual(150)
    expect(h.manaBatchSizes.reduce((a, b) => a + b, 0)).toBe(400)
  })
})
