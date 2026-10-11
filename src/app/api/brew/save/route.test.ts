import { describe, it, expect, beforeEach, vi } from 'vitest'

// Routes require a signed-in user, so pretend one is signed in.
vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve({ id: 'test-user-id', email: 'test@example.com' }),
  getAuthUser: () => Promise.resolve({ id: 'test-user-id', email: 'test@example.com' }),
}))

// ---------------------------------------------------------------------------
// Mocks — Supabase client with table-aware routing
// ---------------------------------------------------------------------------

const mockSessionSelect = vi.fn()
const mockSessionUpdate = vi.fn()
const mockDeckUpdate = vi.fn()
const mockRpc = vi.fn()

// deck_cards rows the route reads before replacing the deck composition.
let mockCurrentDeckCards: Array<{ id: number }> = []

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
          update: () => ({
            eq: mockDeckUpdate,
          }),
        }
      }
      if (table === 'deck_cards') {
        return {
          select: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({ data: mockCurrentDeckCards, error: null }),
            }),
          }),
        }
      }
      return {}
    },
    rpc: mockRpc,
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
    mockCurrentDeckCards = []
    // The route replaces the deck composition through apply_ai_deck_delta;
    // report the counts it expects back so the atomic assertions pass.
    mockRpc.mockImplementation(
      (_fn: string, args: { p_additions: unknown[]; p_remove_deck_card_ids: unknown[] }) =>
        Promise.resolve({
          data: {
            success: true,
            added_count: args.p_additions.length,
            removed_count: args.p_remove_deck_card_ids.length,
          },
          error: null,
        })
    )
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

  it("saves draft against the session's existing deck", async () => {
    mockSessionSelect.mockResolvedValue({
      data: { id: 1, deck_id: 42, status: 'building', commander_name: 'Muldrotha, the Gravetide', colour_identity: 'BGU', decision_log_json: '{}' },
      error: null,
    })

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

    // Deck metadata was updated and the composition replaced atomically.
    expect(mockDeckUpdate).toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledWith('apply_ai_deck_delta', expect.any(Object))
  })

  it('replaces the existing deck composition', async () => {
    mockSessionSelect.mockResolvedValue({
      data: { id: 1, deck_id: 10, status: 'building', commander_name: 'Muldrotha, the Gravetide', colour_identity: 'BGU', decision_log_json: '{}' },
      error: null,
    })
    // The deck already has two cards that should be removed.
    mockCurrentDeckCards = [{ id: 7 }, { id: 8 }]

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

    expect(mockDeckUpdate).toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledWith(
      'apply_ai_deck_delta',
      expect.objectContaining({ p_remove_deck_card_ids: [7, 8] })
    )
  })

  // --- Active save ---

  it('saves active deck and marks session complete', async () => {
    mockSessionSelect.mockResolvedValue({
      data: { id: 1, deck_id: 55, status: 'building', commander_name: 'Muldrotha, the Gravetide', colour_identity: 'BGU', decision_log_json: '{}' },
      error: null,
    })
    mockCurrentDeckCards = [{ id: 3 }]

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

    // Active save replaces the composition and updates the session.
    expect(mockRpc).toHaveBeenCalled()
    expect(mockSessionUpdate).toHaveBeenCalled()

    // Verify session update was called (to mark complete)
    expect(mockSessionUpdate).toHaveBeenCalled()
  })
})
