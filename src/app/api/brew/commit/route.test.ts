import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSupabaseSelect = vi.fn()
const mockSupabaseUpdate = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mockSupabaseSelect,
        }),
      }),
      update: () => ({
        eq: mockSupabaseUpdate,
      }),
    }),
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
    mockSupabaseUpdate.mockResolvedValue({ error: null })
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
    mockSupabaseSelect.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const res = await POST(makeRequest({ sessionId: 999, commanderName: 'Muldrotha' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('not found')
  })

  it('returns 400 if session is not in exploring phase', async () => {
    mockSupabaseSelect.mockResolvedValue({
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
    mockSupabaseSelect.mockResolvedValue({
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
    mockSupabaseSelect.mockResolvedValue({
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
    mockSupabaseSelect.mockResolvedValue({
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
    expect(mockSupabaseUpdate).toHaveBeenCalled()
  })

  it('uses scryfallId for lookup when provided', async () => {
    mockSupabaseSelect.mockResolvedValue({
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
      expect.objectContaining({ headers: { 'User-Agent': 'The-Oracle/1.0' } })
    )
  })

  it('uses name lookup when no scryfallId provided', async () => {
    mockSupabaseSelect.mockResolvedValue({
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
      expect.objectContaining({ headers: { 'User-Agent': 'The-Oracle/1.0' } })
    )
  })

  it('handles legendary planeswalker as valid commander', async () => {
    mockSupabaseSelect.mockResolvedValue({
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
    mockSupabaseSelect.mockResolvedValue({
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
    mockSupabaseSelect.mockResolvedValue({
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
