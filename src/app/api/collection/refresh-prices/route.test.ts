import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

const db = vi.hoisted(() => ({
  /** printing ids the user owns */
  copies: [] as Array<{ printing_id: string | null }>,
  /** printing ids that exist in ref_printings */
  knownPrintings: new Set<string>(),
  /** every ref_printings update the route attempted */
  updates: [] as Array<{ id: string; payload: Record<string, number> }>,
  /** make every update report a database error */
  updateError: false,
}))

vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve({ id: 'user-1' }),
}))

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'user_copies') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          range: (from: number, to: number) =>
            Promise.resolve({ data: db.copies.slice(from, to + 1), error: null }),
        }
        return chain
      }

      if (table === 'ref_printings') {
        let id: string | null = null
        let payload: Record<string, number> = {}
        const chain = {
          update: (p: Record<string, number>) => {
            payload = p
            return chain
          },
          eq: (_column: string, value: string) => {
            id = value
            return chain
          },
          select: () => {
            if (db.updateError) {
              return Promise.resolve({ data: null, error: { message: 'db down' } })
            }
            if (id !== null && db.knownPrintings.has(id)) {
              db.updates.push({ id, payload })
              return Promise.resolve({ data: [{ scryfall_id: id }], error: null })
            }
            return Promise.resolve({ data: [], error: null })
          },
        }
        return chain
      }

      throw new Error(`Unexpected table in test: ${table}`)
    },
  }),
}))

import { POST, parsePositiveUsd, buildPriceUpdate } from './route'

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('parsePositiveUsd', () => {
  it('parses a positive price string', () => {
    expect(parsePositiveUsd('1.50')).toBe(1.5)
  })

  it('returns null for zero, negative, blank and non-numeric values', () => {
    expect(parsePositiveUsd('0')).toBeNull()
    expect(parsePositiveUsd('0.00')).toBeNull()
    expect(parsePositiveUsd('-1')).toBeNull()
    expect(parsePositiveUsd('')).toBeNull()
    expect(parsePositiveUsd('   ')).toBeNull()
    expect(parsePositiveUsd('abc')).toBeNull()
  })

  it('returns null for missing values', () => {
    expect(parsePositiveUsd(null)).toBeNull()
    expect(parsePositiveUsd(undefined)).toBeNull()
  })
})

describe('buildPriceUpdate', () => {
  it('keeps normal and foil prices in separate columns', () => {
    expect(buildPriceUpdate({ id: 'p1', prices: { usd: '2.00', usd_foil: '9.00' } })).toEqual({
      price_usd: 2,
      price_usd_foil: 9,
    })
  })

  it('never writes a foil price into the normal column', () => {
    const update = buildPriceUpdate({ id: 'p1', prices: { usd: null, usd_foil: '9.00' } })
    expect(update).toEqual({ price_usd_foil: 9 })
    expect(update).not.toHaveProperty('price_usd')
  })

  it('rejects non-positive or missing prices rather than storing zero', () => {
    expect(buildPriceUpdate({ id: 'p1', prices: { usd: '0', usd_foil: null } })).toBeNull()
    expect(buildPriceUpdate({ id: 'p1', prices: { usd: null, usd_foil: null } })).toBeNull()
    expect(buildPriceUpdate({ id: 'p1' })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

interface ScryfallCardFixture {
  id: string
  prices?: { usd?: string | null; usd_foil?: string | null }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  db.copies = []
  db.knownPrintings = new Set()
  db.updates = []
  db.updateError = false
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

function scryfallRespondsWith(cards: ScryfallCardFixture[]) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data: cards }),
  })
}

describe('POST /api/collection/refresh-prices', () => {
  it('reports success and updated count when every price is valid', async () => {
    db.copies = [{ printing_id: 'p1' }, { printing_id: 'p2' }]
    db.knownPrintings = new Set(['p1', 'p2'])
    scryfallRespondsWith([
      { id: 'p1', prices: { usd: '1.00', usd_foil: '2.00' } },
      { id: 'p2', prices: { usd: '3.00' } },
    ])

    const res = await POST()
    const body = await res.json()

    expect(body).toMatchObject({ success: true, updated: 2, failed: 0, total: 2 })
    expect(db.updates).toContainEqual({ id: 'p1', payload: { price_usd: 1, price_usd_foil: 2 } })
    expect(db.updates).toContainEqual({ id: 'p2', payload: { price_usd: 3 } })
  })

  it('calls Scryfall (never Card Kingdom) and never fetches when there is nothing owned', async () => {
    db.copies = []
    const res = await POST()
    const body = await res.json()
    expect(body).toMatchObject({ success: true, updated: 0, failed: 0, total: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('counts a card with no usable Scryfall price as failed, not updated', async () => {
    db.copies = [{ printing_id: 'p1' }]
    db.knownPrintings = new Set(['p1'])
    scryfallRespondsWith([{ id: 'p1', prices: { usd: '0' } }])

    const res = await POST()
    const body = await res.json()

    expect(body).toMatchObject({ success: false, updated: 0, failed: 1, total: 1 })
    expect(db.updates).toHaveLength(0)
  })

  it('counts a printing Scryfall did not return as failed', async () => {
    db.copies = [{ printing_id: 'p1' }, { printing_id: 'missing' }]
    db.knownPrintings = new Set(['p1', 'missing'])
    scryfallRespondsWith([{ id: 'p1', prices: { usd: '5.00' } }])

    const res = await POST()
    const body = await res.json()

    expect(body).toMatchObject({ success: false, updated: 1, failed: 1, total: 2 })
  })

  it('counts a printing with no ref_printings row as failed', async () => {
    db.copies = [{ printing_id: 'p1' }]
    db.knownPrintings = new Set() // no matching ref_printings row
    scryfallRespondsWith([{ id: 'p1', prices: { usd: '5.00' } }])

    const res = await POST()
    const body = await res.json()

    expect(body).toMatchObject({ success: false, updated: 0, failed: 1, total: 1 })
  })

  it('counts a database update error as failed and reports not-success', async () => {
    db.copies = [{ printing_id: 'p1' }]
    db.knownPrintings = new Set(['p1'])
    db.updateError = true
    scryfallRespondsWith([{ id: 'p1', prices: { usd: '5.00' } }])

    const res = await POST()
    const body = await res.json()

    expect(body).toMatchObject({ success: false, updated: 0, failed: 1, total: 1 })
  })

  it('treats an HTTP failure from Scryfall as a failure for the whole batch', async () => {
    db.copies = [{ printing_id: 'p1' }, { printing_id: 'p2' }]
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: () => Promise.resolve({}),
    })

    const res = await POST()
    const body = await res.json()

    expect(body).toMatchObject({ success: false, updated: 0, failed: 2, total: 2, errors: 1 })
  })

  it('deduplicates owned printings before contacting Scryfall', async () => {
    db.copies = [{ printing_id: 'p1' }, { printing_id: 'p1' }, { printing_id: null }]
    db.knownPrintings = new Set(['p1'])
    scryfallRespondsWith([{ id: 'p1', prices: { usd: '5.00' } }])

    const res = await POST()
    const body = await res.json()

    expect(body.total).toBe(1)
    const bodyArg = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(bodyArg.identifiers).toEqual([{ id: 'p1' }])
  })
})
