import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the playwright module before importing the route
vi.mock('@/lib/archidekt-playwright', () => ({
  createDeck: vi.fn(),
}))

import { POST } from './route'
import { createDeck } from '@/lib/archidekt-playwright'
import { NextRequest } from 'next/server'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/archidekt/create-deck', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/archidekt/create-deck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Validation tests ---

  it('returns 400 if commanderName is missing', async () => {
    const res = await POST(makeRequest({ deckName: 'My Deck', cards: ['Sol Ring'] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('commanderName')
  })

  it('returns 400 if deckName is missing', async () => {
    const res = await POST(makeRequest({ commanderName: 'Muldrotha', cards: ['Sol Ring'] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('deckName')
  })

  it('returns 400 if cards array is missing', async () => {
    const res = await POST(makeRequest({ commanderName: 'Muldrotha', deckName: 'My Deck' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('cards')
  })

  it('returns 400 if cards array is empty', async () => {
    const res = await POST(
      makeRequest({ commanderName: 'Muldrotha', deckName: 'My Deck', cards: [] })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('cards')
  })

  it('returns 400 if a card entry is not a string', async () => {
    const res = await POST(
      makeRequest({ commanderName: 'Muldrotha', deckName: 'My Deck', cards: [123] })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('non-empty string')
  })

  it('returns 400 if a card entry is an empty string', async () => {
    const res = await POST(
      makeRequest({ commanderName: 'Muldrotha', deckName: 'My Deck', cards: ['Sol Ring', ''] })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('non-empty string')
  })

  // --- Success path ---

  it('calls createDeck and returns success with URL', async () => {
    vi.mocked(createDeck).mockResolvedValue({
      success: true,
      url: 'https://archidekt.com/decks/99999',
    })

    const res = await POST(
      makeRequest({
        commanderName: 'Muldrotha, the Gravetide',
        deckName: 'Sultai Graveyard',
        cards: ['Sol Ring', 'Command Tower', 'Sakura-Tribe Elder'],
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.url).toBe('https://archidekt.com/decks/99999')
    expect(createDeck).toHaveBeenCalledWith(
      'Sultai Graveyard',
      'Muldrotha, the Gravetide',
      ['Sol Ring', 'Command Tower', 'Sakura-Tribe Elder']
    )
  })

  // --- Error paths ---

  it('returns 502 when createDeck fails', async () => {
    vi.mocked(createDeck).mockResolvedValue({
      success: false,
      error: 'Archidekt session expired',
    })

    const res = await POST(
      makeRequest({
        commanderName: 'Muldrotha',
        deckName: 'My Deck',
        cards: ['Sol Ring'],
      })
    )

    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('session expired')
  })

  it('returns 500 on unexpected errors', async () => {
    vi.mocked(createDeck).mockRejectedValue(new Error('Browser crashed'))

    const res = await POST(
      makeRequest({
        commanderName: 'Muldrotha',
        deckName: 'My Deck',
        cards: ['Sol Ring'],
      })
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('Browser crashed')
  })
})
