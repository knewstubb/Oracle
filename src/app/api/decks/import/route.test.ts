import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Auth
// ---------------------------------------------------------------------------

const mockUserId = 'user-123'

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(() => Promise.resolve({ id: mockUserId })),
}))

// ---------------------------------------------------------------------------
// Mock Import Executors
// ---------------------------------------------------------------------------

const mockImportExisting = vi.fn()
const mockImportAddNew = vi.fn()

vi.mock('@/lib/deck-import', () => ({
  importDeckExistingCollection: (...args: unknown[]) => mockImportExisting(...args),
  importDeckAddNewCards: (...args: unknown[]) => mockImportAddNew(...args),
}))

import { POST } from './route'
import { requireAuth } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('/api/decks/import', 'http://localhost:3000'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDeck(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Deck',
    platform: 'archidekt',
    platformDeckId: '12345',
    sourceUrl: 'https://archidekt.com/decks/12345',
    commander: null,
    cards: [
      {
        cardName: 'Sol Ring',
        scryfallId: 'abc-123',
        oracleId: 'oracle-sol',
        setCode: 'c21',
        quantity: 1,
        typeLine: 'Artifact',
        isCommander: false,
        isProxy: false,
        manaCost: '{1}',
        colorIdentity: [],
      },
    ],
    cardCount: 1,
    colourIdentity: '',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/decks/import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockImportExisting.mockResolvedValue({
      deckId: 12345,
      allocationSummary: { assigned: 1, shortfall: 0, errors: [] },
    })
    mockImportAddNew.mockResolvedValue({
      deckId: 12345,
      allocationSummary: { assigned: 1, shortfall: 0, errors: [] },
    })
  })

  // --- Auth ---

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce(
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await POST(makeRequest({ deck: makeDeck(), mode: 'existing_collection' }))
    expect(response.status).toBe(401)
  })

  // --- Validation ---

  it('returns 400 for invalid JSON body', async () => {
    const request = new NextRequest(new URL('/api/decks/import', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('Invalid request body')
  })

  it('returns 400 when deck is missing', async () => {
    const response = await POST(makeRequest({ mode: 'existing_collection' }))
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('Deck data is required')
  })

  it('returns 400 when deck has no cards', async () => {
    const response = await POST(makeRequest({
      deck: makeDeck({ cards: [] }),
      mode: 'existing_collection',
    }))
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('at least one card')
  })

  it('returns 400 when mode is missing', async () => {
    const response = await POST(makeRequest({ deck: makeDeck() }))
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('Invalid import mode')
  })

  it('returns 400 when mode is invalid', async () => {
    const response = await POST(makeRequest({ deck: makeDeck(), mode: 'bad_mode' }))
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('Invalid import mode')
  })

  // --- Routing to executors ---

  it('routes to importDeckExistingCollection for existing_collection mode', async () => {
    const deck = makeDeck()
    const response = await POST(makeRequest({ deck, mode: 'existing_collection' }))

    expect(response.status).toBe(200)
    expect(mockImportExisting).toHaveBeenCalledWith(deck, mockUserId)
    expect(mockImportAddNew).not.toHaveBeenCalled()
  })

  it('routes to importDeckAddNewCards for add_new_cards mode', async () => {
    const deck = makeDeck()
    const response = await POST(makeRequest({ deck, mode: 'add_new_cards' }))

    expect(response.status).toBe(200)
    expect(mockImportAddNew).toHaveBeenCalledWith(deck, mockUserId)
    expect(mockImportExisting).not.toHaveBeenCalled()
  })

  // --- Success responses ---

  it('returns deckId and allocationSummary on success', async () => {
    mockImportExisting.mockResolvedValue({
      deckId: 42,
      allocationSummary: { assigned: 10, shortfall: 3, errors: [] },
    })

    const response = await POST(makeRequest({ deck: makeDeck(), mode: 'existing_collection' }))
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.deckId).toBe(42)
    expect(data.allocationSummary.assigned).toBe(10)
    expect(data.allocationSummary.shortfall).toBe(3)
    expect(data.allocationSummary.errors).toEqual([])
  })

  it('returns 200 even when allocation has errors in the summary', async () => {
    mockImportAddNew.mockResolvedValue({
      deckId: 99,
      allocationSummary: {
        assigned: 5,
        shortfall: 2,
        errors: ['Allocation resolver failed: timeout'],
      },
    })

    const response = await POST(makeRequest({ deck: makeDeck(), mode: 'add_new_cards' }))
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.deckId).toBe(99)
    expect(data.allocationSummary.errors).toContain('Allocation resolver failed: timeout')
  })

  // --- Error handling ---

  it('returns 500 when executor throws', async () => {
    mockImportExisting.mockRejectedValue(new Error('Failed to upsert deck'))

    const response = await POST(makeRequest({ deck: makeDeck(), mode: 'existing_collection' }))
    expect(response.status).toBe(500)

    const data = await response.json()
    expect(data.error).toBe('Deck import failed')
  })
})
