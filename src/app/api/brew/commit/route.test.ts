import { describe, it, expect, vi, beforeEach } from 'vitest'

// Routes require a signed-in user, so pretend one is signed in.
vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve({ id: 'test-user-id', email: 'test@example.com' }),
  getAuthUser: () => Promise.resolve({ id: 'test-user-id', email: 'test@example.com' }),
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Shared mock state, hoisted so the vi.mock factory below can use it.
const mocks = vi.hoisted(() => ({
  sessionSelect: vi.fn(),
  sessionUpdate: vi.fn(),
  // Names recognised by ref_commanders (the authoritative commander list).
  commanderNames: [] as string[],
}))

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'brew_sessions') {
        return {
          select: () => ({ eq: () => ({ single: mocks.sessionSelect }) }),
          update: () => ({ eq: mocks.sessionUpdate }),
        }
      }
      if (table === 'ref_printings') {
        // Always miss locally so the Scryfall fetch fallback is exercised.
        const single = () =>
          Promise.resolve({ data: null, error: { message: 'not found' } })
        const chain: Record<string, unknown> = {}
        chain.select = () => chain
        chain.eq = () => chain
        chain.ilike = () => chain
        chain.order = () => chain
        chain.limit = () => chain
        chain.single = single
        return chain
      }
      if (table === 'ref_commanders') {
        return {
          select: () => ({
            eq: (_column: string, value: string) => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: mocks.commanderNames.includes(value) ? { id: 1 } : null,
                  error: null,
                }),
            }),
          }),
        }
      }
      return {}
    },
  }),
}))

// Mock global fetch for Scryfall calls
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { POST } from './route'
import { NextRequest } from 'next/server'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/brew/commit', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const VALID_SCRYFALL_RESPONSE = {
  id: 'abc-123',
  name: 'Muldrotha, the Gravetide',
  type_line: 'Legendary Creature — Elemental Avatar',
  color_identity: ['B', 'G', 'U'],
  legalities: { commander: 'legal' },
  image_uris: { art_crop: 'https://cards.scryfall.io/art_crop/muldrotha.jpg' },
}

describe('POST /api/brew/commit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sessionUpdate.mockResolvedValue({ error: null })
    // Commander eligibility is now read from ref_commanders, not the
    // Scryfall legalities field. Seed the names the success paths use.
    mocks.commanderNames = [
      'Muldrotha, the Gravetide',
      'Aminatou, the Fateshifter',
      'Arlinn Kord // Arlinn, Embraced by the Moon',
    ]
  })

  // --- Validation ---

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost:3000/api/brew/commit', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid JSON')
  })

  it('returns 400 if sessionId is missing', async () => {
    const res = await POST(makeRequest({ commanderName: 'Muldrotha' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('sessionId')
  })

  it('returns 400 if commanderName is missing', async () => {
    const res = await POST(makeRequest({ sessionId: 1 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('commanderName')
  })

  it('returns 400 if commanderName is empty string', async () => {
    const res = await POST(makeRequest({ sessionId: 1, commanderName: '   ' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('commanderName')
  })

  // --- Session checks ---

  it('returns 404 if session does not exist', async () => {
    mocks.sessionSelect.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const res = await POST(makeRequest({ sessionId: 999, commanderName: 'Muldrotha' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('not found')
  })

  it('returns 400 if session is not in exploring phase', async () => {
    mocks.sessionSelect.mockResolvedValue({
      data: {
        id: 1,
        status: 'building',
        decision_log_json: '{}',
      },
      error: null,
    })

    const res = await POST(
      makeRequest({ sessionId: 1, commanderName: 'Muldrotha' })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('exploring')
  })

  // --- Scryfall validation ---

  it('returns 400 if Scryfall lookup fails (card not found)', async () => {
    mocks.sessionSelect.mockResolvedValue({
      data: {
        id: 1,
        status: 'exploring',
        decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}',
      },
      error: null,
    })
    mockFetch.mockResolvedValue({ ok: false, status: 404 })

    const res = await POST(
      makeRequest({ sessionId: 1, commanderName: 'Not A Real Card' })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('not found on Scryfall')
  })

  it('returns 400 if card is not legal as commander', async () => {
    mocks.sessionSelect.mockResolvedValue({
      data: {
        id: 1,
        status: 'exploring',
        decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}',
      },
      error: null,
    })
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: 'xyz-789',
        name: 'Lightning Bolt',
        type_line: 'Instant',
        color_identity: ['R'],
        legalities: { commander: 'legal' },
        image_uris: { art_crop: 'https://example.com/bolt.jpg' },
      }),
    })

    const res = await POST(
      makeRequest({ sessionId: 1, commanderName: 'Lightning Bolt' })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('not legal as a commander')
  })

  // --- Successful commit ---

  it('commits commander and transitions session to building', async () => {
    mocks.sessionSelect.mockResolvedValue({
      data: {
        id: 1,
        status: 'exploring',
        decision_log_json: '{"strategy":[{"key":"ARCHETYPE","value":"Aristocrats"}],"parameters":[],"constraints":[]}',
      },
      error: null,
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(VALID_SCRYFALL_RESPONSE),
    })

    const res = await POST(
      makeRequest({ sessionId: 1, commanderName: 'Muldrotha, the Gravetide' })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.commander).toEqual({
      name: 'Muldrotha, the Gravetide',
      artUrl: 'https://cards.scryfall.io/art_crop/muldrotha.jpg',
      typeLine: 'Legendary Creature — Elemental Avatar',
      colourIdentity: ['B', 'G', 'U'],
      archetype: 'Aristocrats',
    })

    // Verify Supabase update was called
    expect(mocks.sessionUpdate).toHaveBeenCalled()
  })

  it('uses scryfallId for lookup when provided', async () => {
    mocks.sessionSelect.mockResolvedValue({
      data: {
        id: 2,
        status: 'exploring',
        decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}',
      },
      error: null,
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(VALID_SCRYFALL_RESPONSE),
    })

    await POST(
      makeRequest({
        sessionId: 2,
        commanderName: 'Muldrotha, the Gravetide',
        scryfallId: 'abc-123',
      })
    )

    // Should use /cards/{id} endpoint, not /cards/named
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.scryfall.com/cards/abc-123',
      expect.objectContaining({ headers: { 'User-Agent': 'TheOracle/0.2.0' } })
    )
  })

  it('uses name lookup when no scryfallId provided', async () => {
    mocks.sessionSelect.mockResolvedValue({
      data: {
        id: 3,
        status: 'exploring',
        decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}',
      },
      error: null,
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(VALID_SCRYFALL_RESPONSE),
    })

    await POST(
      makeRequest({ sessionId: 3, commanderName: 'Muldrotha, the Gravetide' })
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.scryfall.com/cards/named?exact=Muldrotha%2C%20the%20Gravetide',
      expect.objectContaining({ headers: { 'User-Agent': 'TheOracle/0.2.0' } })
    )
  })

  it('handles legendary planeswalker as valid commander', async () => {
    mocks.sessionSelect.mockResolvedValue({
      data: {
        id: 4,
        status: 'exploring',
        decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}',
      },
      error: null,
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: 'pw-123',
        name: 'Aminatou, the Fateshifter',
        type_line: 'Legendary Planeswalker — Aminatou',
        color_identity: ['W', 'U', 'B'],
        legalities: { commander: 'legal' },
        image_uris: { art_crop: 'https://example.com/aminatou.jpg' },
      }),
    })

    const res = await POST(
      makeRequest({ sessionId: 4, commanderName: 'Aminatou, the Fateshifter' })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.commander.name).toBe('Aminatou, the Fateshifter')
  })

  it('returns null archetype when decision log has no archetype entry', async () => {
    mocks.sessionSelect.mockResolvedValue({
      data: {
        id: 5,
        status: 'exploring',
        decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}',
      },
      error: null,
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(VALID_SCRYFALL_RESPONSE),
    })

    const res = await POST(
      makeRequest({ sessionId: 5, commanderName: 'Muldrotha, the Gravetide' })
    )
    const body = await res.json()
    expect(body.commander.archetype).toBeNull()
  })

  it('handles double-faced card art extraction', async () => {
    mocks.sessionSelect.mockResolvedValue({
      data: {
        id: 6,
        status: 'exploring',
        decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}',
      },
      error: null,
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: 'dfc-123',
        name: 'Arlinn Kord // Arlinn, Embraced by the Moon',
        type_line: 'Legendary Planeswalker — Arlinn // Legendary Planeswalker — Arlinn',
        color_identity: ['R', 'G'],
        legalities: { commander: 'legal' },
        card_faces: [
          { image_uris: { art_crop: 'https://example.com/arlinn-front.jpg' } },
          { image_uris: { art_crop: 'https://example.com/arlinn-back.jpg' } },
        ],
      }),
    })

    const res = await POST(
      makeRequest({ sessionId: 6, commanderName: 'Arlinn Kord' })
    )
    const body = await res.json()
    expect(body.commander.artUrl).toBe('https://example.com/arlinn-front.jpg')
  })
})
