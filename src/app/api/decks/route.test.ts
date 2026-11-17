import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  statusMap: new Map<string, 'available' | 'alternate' | 'claimed' | 'unowned' | 'failed'>(),
  conflictCounts: { decks: [] as { deckId: number; count: number }[] },
  deckCards: [{ deck_id: 1, card_name: 'Sol Ring', copy_id: null, categories: null }] as unknown[],
  manaBatchSizes: [] as number[],
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
              order: () => ({
                order: () => ({
                  then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
                    resolve({
                      data: [{ id: 1, name: 'Korvold', commander_name: 'Korvold, Fae-Cursed King', folder_id: null }],
                      error: null,
                    }),
                }),
              }),
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
              then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
                resolve({
                  data: h.deckCards,
                  error: null,
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
import { computeUnresolvedStatuses } from '@/lib/card-status'

describe('GET /api/decks', () => {
  beforeEach(() => {
    h.statusMap = new Map()
    h.conflictCounts = { decks: [] }
    h.deckCards = [{ deck_id: 1, card_name: 'Sol Ring', copy_id: null, categories: null }]
    h.manaBatchSizes = []
    vi.clearAllMocks()
  })

  it('looks up mana costs in small batches so a big deck list does not stall', async () => {
    h.deckCards = Array.from({ length: 400 }, (_, i) => ({
      deck_id: 1, card_name: `Card ${i}`, copy_id: 1, categories: null,
    }))
    const response = await GET()
    expect(response.status).toBe(200)
    expect(h.manaBatchSizes.length).toBeGreaterThan(1)
    expect(Math.max(...h.manaBatchSizes)).toBeLessThanOrEqual(150)
    expect(h.manaBatchSizes.reduce((a, b) => a + b, 0)).toBe(400)
  })

  it('returns deck list with completeness', async () => {
    h.statusMap.set('Sol Ring', 'available')

    const response = await GET()
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.decks).toHaveLength(1)
    expect(json.decks[0].completeness).toEqual({
      resolved: 0,
      total: 1,
      availableCount: 1,
      claimedCount: 0,
      unownedCount: 0,
      failed: false,
    })
  })

  it('marks completeness as failed when the status lookup errors', async () => {
    h.statusMap.set('Sol Ring', 'failed')

    const response = await GET()
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.decks[0].completeness).toEqual({
      resolved: 0,
      total: 1,
      availableCount: 0,
      claimedCount: 0,
      unownedCount: 0,
      failed: true,
    })
  })

  it('marks completeness as failed when a card is missing from the lookup result', async () => {
    // The lookup succeeded but omitted the card; the route must not guess.
    h.statusMap = new Map()

    const response = await GET()
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.decks[0].completeness).toEqual({
      resolved: 0,
      total: 1,
      availableCount: 0,
      claimedCount: 0,
      unownedCount: 0,
      failed: true,
    })
  })
})
