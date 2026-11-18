import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** Rows per table; `fail` makes that table's read error. Every query is chainable and pages through `range`. */
const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  fail: null as string | null,
  ranges: [] as Array<[string, number, number]>,
  candidates: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }) }))
vi.mock('@/lib/allocation-candidates', () => ({ getBatchRankedCandidates: (...a: unknown[]) => h.candidates(...a) }))
vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let from = 0
      let to = Number.MAX_SAFE_INTEGER
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'is', 'or', 'order']) chain[m] = () => chain
      chain.range = (a: number, b: number) => { from = a; to = b; h.ranges.push([table, a, b]); return chain }
      chain.then = (resolve: (v: unknown) => unknown) => {
        if (h.fail === table) return resolve({ data: null, error: { message: 'timeout' } })
        return resolve({ data: (h.tables[table] ?? []).slice(from, to + 1), error: null })
      }
      return chain
    },
  }),
}))

import { GET } from './route'

const call = (qs = '') => GET(new NextRequest(`http://localhost/api/picklist${qs}`))
const free = (copyId: number) => ({
  entry: { physicalCopyId: copyId, cardId: 1, printingId: null, finish: 'nonfoil', isProxy: false, condition: null, locationId: 10, locationName: 'Unsorted', assignedTo: null },
  tier: 1, tierLabel: '', withinTierScore: 0, autoSelectable: true,
})

describe('GET /api/picklist', () => {
  beforeEach(() => {
    h.fail = null
    h.ranges = []
    h.tables = {
      decks: [{ id: 3, name: 'TEST A' }, { id: 4, name: 'TEST B' }],
      user_locations: [{ id: 10, name: 'Unsorted', is_default: true }],
      move_items: [],
      deck_cards: [
        { id: 101, deck_id: 3, card_name: 'Sol Ring', scryfall_id: 'x', is_generic: false, generic_sleeved: null, copy_id: null },
        { id: 201, deck_id: 4, card_name: 'Black Lotus', scryfall_id: 'y', is_generic: false, generic_sleeved: null, copy_id: null },
        { id: 202, deck_id: 4, card_name: 'Island', scryfall_id: null, is_generic: true, generic_sleeved: true, copy_id: null },
      ],
      user_copies: [],
    }
    h.candidates = vi.fn().mockResolvedValue(new Map([['Sol Ring', [free(51)]], ['Black Lotus', []]]))
  })

  it('lists every planned card of every deck with no saved steps (TEST A in storage, TEST B unowned)', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.takeFromBoxes[0].placeName).toBe('Unsorted')
    expect(body.takeFromBoxes[0].rows[0]).toMatchObject({ cardName: 'Sol Ring', copyId: 51, toName: 'TEST A', itemId: null })
    expect(body.unowned[0]).toMatchObject({ placeName: 'TEST B' })
    expect(body.unowned[0].rows.map((r: { cardName: string }) => r.cardName)).toEqual(['Black Lotus']) // generic Island left out
    expect(body.decks).toEqual([
      { deckId: 3, deckName: 'TEST A', placed: 0, total: 1 },
      { deckId: 4, deckName: 'TEST B', placed: 0, total: 1 },
    ])
  })

  it('only reads the asked decks when deckIds is given', async () => {
    h.tables.deck_cards = (h.tables.deck_cards as Array<{ deck_id: number }>).filter((c) => c.deck_id === 3)
    const body = await (await call('?deckIds=3')).json()
    expect(body.decks.map((d: { deckName: string }) => d.deckName)).toEqual(['TEST A'])
  })

  it('reads past the 1000-row limit', async () => {
    h.tables.deck_cards = Array.from({ length: 1500 }, (_, i) => ({ id: 1000 + i, deck_id: 3, card_name: 'Sol Ring', scryfall_id: 'x', is_generic: false, generic_sleeved: null, copy_id: null }))
    const body = await (await call()).json()
    expect(body.counts.total).toBe(1500)
    expect(h.ranges.filter(([t]) => t === 'deck_cards').map(([, a]) => a)).toEqual([0, 1000])
  })

  it.each(['decks', 'deck_cards', 'move_items'])('a failed read of %s is an error, not an empty Picklist (D-030)', async (table) => {
    h.fail = table
    const res = await call()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('load_failed')
  })

  it('a failed candidate lookup is an error, not a list of Unowned cards', async () => {
    h.candidates = vi.fn().mockRejectedValue(new Error('timeout'))
    const res = await call()
    expect(res.status).toBe(500)
  })

  it('refuses a bad deckIds list', async () => {
    expect((await call('?deckIds=abc')).status).toBe(400)
  })
})
