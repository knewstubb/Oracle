import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — Supabase client with table-aware routing
// ---------------------------------------------------------------------------

const mockSessionSelect = vi.fn()
const mockSessionUpdate = vi.fn()
const mockDeckInsert = vi.fn()
const mockDeckUpdate = vi.fn()
const mockDeckCardsInsert = vi.fn()
const mockDeckCardsDelete = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'brew_sessions') {
        return {
          select: () => ({
            eq: () => ({
              single: mockSessionSelect,
            }),
          }),
          update: () => ({
            eq: mockSessionUpdate,
          }),
        }
      }
      if (table === 'decks') {
        return {
          insert: () => ({
            select: () => ({
              single: mockDeckInsert,
            }),
          }),
          update: () => ({
            eq: mockDeckUpdate,
          }),
        }
      }
      if (table === 'deck_cards') {
        return {
          insert: mockDeckCardsInsert,
          delete: () => ({
            eq: mockDeckCardsDelete,
          }),
        }
      }
      return {
        select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    },
  }),
}))

import { POST } from './route'
import { NextRequest } from 'next/server'

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('/api/brew/save', 'http://localhost:3000'), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/brew/save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessionUpdate.mockResolvedValue({ error: null })
    mockDeckUpdate.mockResolvedValue({ error: null })
    mockDeckCardsInsert.mockResolvedValue({ error: null })
    mockDeckCardsDelete.mockResolvedValue({ error: null })
  })

  // --- Validation ---

  it('returns 400 for missing sessionId', async () => {
    const response = await POST(makePostRequest({ mode: 'concept' }))
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('Invalid sessionId')
  })

  it('returns 400 for invalid mode', async () => {
    mockSessionSelect.mockResolvedValue({
      data: { id: 1, deck_id: null, status: 'exploring', commander_name: null, colour_identity: null, decision_log_json: '{}' },
      error: null,
    })
    const response = await POST(makePostRequest({ sessionId: 1, mode: 'invalid' }))
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('Invalid mode')
  })

  it('returns 400 when draft mode lacks deckCards', async () => {
    mockSessionSelect.mockResolvedValue({
      data: { id: 1, deck_id: null, status: 'building', commander_name: 'Muldrotha', colour_identity: 'BGU', decision_log_json: '{}' },
      error: null,
    })
    const response = await POST(makePostRequest({ sessionId: 1, mode: 'draft', deckName: 'Test' }))
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('deckCards array is required')
  })

  it('returns 400 when active mode lacks deckName', async () => {
    mockSessionSelect.mockResolvedValue({
      data: { id: 1, deck_id: null, status: 'building', commander_name: 'Muldrotha', colour_identity: 'BGU', decision_log_json: '{}' },
      error: null,
    })
    const response = await POST(makePostRequest({ sessionId: 1, mode: 'active', deckCards: [] }))
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('deckName is required')
  })

  it('returns 404 for non-existent session', async () => {
    mockSessionSelect.mockResolvedValue({ data: null, error: { message: 'not found' } })
    const response = await POST(makePostRequest({ sessionId: 99999, mode: 'concept' }))
    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toContain('Session not found')
  })

  // --- Phase validation ---

  it('returns 409 when saving concept on a building session', async () => {
    mockSessionSelect.mockResolvedValue({
      data: { id: 1, deck_id: null, status: 'building', commander_name: 'Muldrotha', colour_identity: 'BGU', decision_log_json: '{}' },
      error: null,
    })
    const response = await POST(makePostRequest({ sessionId: 1, mode: 'concept' }))
    expect(response.status).toBe(409)
    const data = await response.json()
    expect(data.error).toContain("expected 'exploring'")
  })

  it('returns 409 when saving draft on an exploring session', async () => {
    mockSessionSelect.mockResolvedValue({
      data: { id: 1, deck_id: null, status: 'exploring', commander_name: null, colour_identity: null, decision_log_json: '{}' },
      error: null,
    })
    const response = await POST(makePostRequest({
      sessionId: 1,
      mode: 'draft',
      deckName: 'Test',
      deckCards: [{ card_name: 'Sol Ring', primary_category: 'Ramp', additional_categories: [], ownership_status: 'original', cmc: 1, type_line: 'Artifact', oracle_text: '' }],
    }))
    expect(response.status).toBe(409)
    const data = await response.json()
    expect(data.error).toContain("expected 'building'")
  })

  // --- Concept save ---

  it('saves concept with decision log and keeps session exploring', async () => {
    mockSessionSelect.mockResolvedValue({
      data: { id: 1, deck_id: null, status: 'exploring', commander_name: null, colour_identity: null, decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}' },
      error: null,
    })

    const decisionLog = {
      strategy: [{ id: '1', key: 'ARCHETYPE', value: 'Aristocrats', sourceQuote: 'I like sac loops', timestamp: Date.now() }],
      parameters: [{ id: '2', key: 'COLOUR IDENTITY', value: 'Orzhov (WB)', sourceQuote: 'black and white', timestamp: Date.now() }],
      constraints: [],
    }

    const response = await POST(makePostRequest({ sessionId: 1, mode: 'concept', decisionLog }))
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.deckId).toBeUndefined()

    // Verify Supabase update was called
    expect(mockSessionUpdate).toHaveBeenCalled()
  })

  it('saves concept without explicit decision log (keeps existing)', async () => {
    mockSessionSelect.mockResolvedValue({
      data: { id: 1, deck_id: null, status: 'exploring', commander_name: null, colour_identity: null, decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}' },
      error: null,
    })
    const response = await POST(makePostRequest({ sessionId: 1, mode: 'concept' }))
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  // --- Draft save ---

  it('saves draft with new deck creation', async () => {
    mockSessionSelect.mockResolvedValue({
      data: { id: 1, deck_id: null, status: 'building', commander_name: 'Muldrotha, the Gravetide', colour_identity: 'BGU', decision_log_json: '{}' },
      error: null,
    })
    mockDeckInsert.mockResolvedValue({ data: { id: 42 }, error: null })

    const deckCards = [
      { card_name: 'Muldrotha, the Gravetide', primary_category: 'Commander', additional_categories: [], ownership_status: 'original', cmc: 6, type_line: 'Legendary Creature', oracle_text: '' },
      { card_name: 'Sol Ring', primary_category: 'Ramp', additional_categories: ['Artifact'], ownership_status: 'original', cmc: 1, type_line: 'Artifact', oracle_text: '' },
      { card_name: 'Sakura-Tribe Elder', primary_category: 'Ramp', additional_categories: ['Sacrifice'], ownership_status: 'original', cmc: 2, type_line: 'Creature', oracle_text: '' },
    ]

    const response = await POST(makePostRequest({
      sessionId: 1,
      mode: 'draft',
      deckName: 'Muldrotha Value',
      deckCards,
    }))

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.deckId).toBe(42)

    // Verify deck cards were inserted
    expect(mockDeckCardsInsert).toHaveBeenCalled()
  })

  it('saves draft with existing deck update', async () => {
    mockSessionSelect.mockResolvedValue({
      data: { id: 1, deck_id: 10, status: 'building', commander_name: 'Muldrotha, the Gravetide', colour_identity: 'BGU', decision_log_json: '{}' },
      error: null,
    })

    const deckCards = [
      { card_name: 'Sol Ring', primary_category: 'Ramp', additional_categories: [], ownership_status: 'original', cmc: 1, type_line: 'Artifact', oracle_text: '' },
    ]

    const response = await POST(makePostRequest({
      sessionId: 1,
      mode: 'draft',
      deckName: 'Updated Name',
      deckCards,
    }))

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.deckId).toBe(10)

    // Verify old cards were deleted and new ones inserted
    expect(mockDeckCardsDelete).toHaveBeenCalled()
    expect(mockDeckCardsInsert).toHaveBeenCalled()
  })

  // --- Active save ---

  it('saves active deck and marks session complete', async () => {
    mockSessionSelect.mockResolvedValue({
      data: { id: 1, deck_id: null, status: 'building', commander_name: 'Muldrotha, the Gravetide', colour_identity: 'BGU', decision_log_json: '{}' },
      error: null,
    })
    mockDeckInsert.mockResolvedValue({ data: { id: 55 }, error: null })

    const deckCards = [
      { card_name: 'Muldrotha, the Gravetide', primary_category: 'Commander', additional_categories: [], ownership_status: 'original', cmc: 6, type_line: 'Legendary Creature', oracle_text: '' },
      { card_name: 'Sol Ring', primary_category: 'Ramp', additional_categories: [], ownership_status: 'original', cmc: 1, type_line: 'Artifact', oracle_text: '' },
    ]

    const response = await POST(makePostRequest({
      sessionId: 1,
      mode: 'active',
      deckName: 'Final Muldrotha',
      deckCards,
    }))

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.deckId).toBe(55)

    // Verify session update was called (to mark complete)
    expect(mockSessionUpdate).toHaveBeenCalled()
  })
})
