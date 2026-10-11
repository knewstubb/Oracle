import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

interface TestAddition {
  card_name: string
  scryfall_id: string | null
  quantity: number
}

const h = vi.hoisted(() => ({
  owned: new Map<string, string>(),
  cardMeta: null as unknown,
  defaultPrinting: null as unknown,
  defaultQueries: 0,
  rpcArgs: null as { p_additions: TestAddition[] } | null,
}))

vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve({ id: 'test-user-id', email: 'test@example.com' }),
}))

vi.mock('@/lib/card-data', () => ({
  getOwnedPrintingsByNames: vi.fn(async () => h.owned),
}))

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'ref_cards') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: h.cardMeta, error: null }) }),
          }),
        }
      }
      if (table === 'ref_printings') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => {
                    h.defaultQueries += 1
                    return { data: h.defaultPrinting, error: null }
                  },
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
    rpc: async (_name: string, args: { p_additions: TestAddition[]; p_remove_deck_card_ids: number[] }) => {
      h.rpcArgs = args
      return {
        data: {
          success: true,
          added_count: args.p_additions.reduce((total, addition) => total + addition.quantity, 0),
          removed_count: args.p_remove_deck_card_ids.length,
        },
        error: null,
      }
    },
  }),
}))

import { POST } from './route'

function callPost(body: Record<string, unknown>) {
  const request = new NextRequest('http://localhost/api/decks/1/cards/batch', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
  return POST(request, { params: Promise.resolve({ id: '1' }) })
}

describe('POST /api/decks/[id]/cards/batch', () => {
  beforeEach(() => {
    h.owned = new Map<string, string>()
    h.cardMeta = null
    h.defaultPrinting = null
    h.defaultQueries = 0
    h.rpcArgs = null
  })

  it('uses the printing the owner already owns for an addition', async () => {
    h.owned.set('Sol Ring', 'owned-printing-id')

    const response = await callPost({ additions: [{ name: 'Sol Ring' }] })
    expect(response.status).toBe(200)
    expect(h.rpcArgs?.p_additions[0].scryfall_id).toBe('owned-printing-id')
    // Owned printing must skip the default newest-printing lookup.
    expect(h.defaultQueries).toBe(0)
  })

  it('falls back to the newest printing by name when nothing is owned', async () => {
    h.defaultPrinting = { scryfall_id: 'default-printing-id', type_line: 'Artifact' }

    const response = await callPost({ additions: [{ name: 'Sol Ring' }] })
    expect(response.status).toBe(200)
    expect(h.rpcArgs?.p_additions[0].scryfall_id).toBe('default-printing-id')
    expect(h.defaultQueries).toBe(1)
  })

  it('resolves mixed additions independently', async () => {
    h.owned.set('Sol Ring', 'owned-printing-id')
    h.defaultPrinting = { scryfall_id: 'default-mana-crypt', type_line: 'Artifact' }

    const response = await callPost({
      additions: [{ name: 'Sol Ring' }, { name: 'Mana Crypt' }],
    })
    expect(response.status).toBe(200)
    const byName = new Map(h.rpcArgs?.p_additions.map((addition) => [addition.card_name, addition.scryfall_id]))
    expect(byName.get('Sol Ring')).toBe('owned-printing-id')
    expect(byName.get('Mana Crypt')).toBe('default-mana-crypt')
    expect(h.defaultQueries).toBe(1)
  })
})
