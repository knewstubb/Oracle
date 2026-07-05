import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — vi.mock factories are hoisted
// ---------------------------------------------------------------------------

const mockCreate = vi.fn()
const mockSupabaseSelect = vi.fn()
const mockSupabaseUpdate = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
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

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: (...args: unknown[]) => mockCreate(...args) }
  },
}))

import { POST } from './route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/brew/assess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

const validBody = {
  sessionId: 1,
  cardName: 'Spore Frog',
  deckContext: {
    commander: 'Muldrotha, the Gravetide',
    strategy: 'Graveyard recursion engine',
    existingCards: ['Sakura-Tribe Elder', 'Sol Ring'],
  },
}

const mockAssessment = {
  pros: ['Repeatable fog effect from graveyard', 'Low CMC sacrifice fodder'],
  cons: ['Only prevents combat damage'],
  fit_score: 9,
  fit_note: 'Spore Frog is an all-star in Muldrotha because you can recur it every turn from the graveyard, creating a soft lock on combat damage.',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/brew/assess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseSelect.mockReset()
    mockSupabaseUpdate.mockReset()
    mockCreate.mockReset()
    mockSupabaseUpdate.mockResolvedValue({ error: null })
  })

  // --- Validation tests ---

  it('returns 400 for missing sessionId', async () => {
    const res = await POST(makeRequest({ cardName: 'Spore Frog', deckContext: { commander: 'X' } }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Invalid session ID')
  })

  it('returns 400 for missing cardName', async () => {
    const res = await POST(makeRequest({ sessionId: 1, deckContext: { commander: 'X' } }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Card name is required')
  })

  it('returns 400 for empty string cardName', async () => {
    const res = await POST(makeRequest({ sessionId: 1, cardName: '   ', deckContext: { commander: 'X' } }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Card name is required')
  })

  it('returns 400 for missing deckContext', async () => {
    const res = await POST(makeRequest({ sessionId: 1, cardName: 'Spore Frog' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Deck context with commander is required')
  })

  it('returns 400 for deckContext without commander', async () => {
    const res = await POST(makeRequest({ sessionId: 1, cardName: 'Spore Frog', deckContext: {} }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Deck context with commander is required')
  })

  // --- Session lookup ---

  it('returns 404 when session does not exist', async () => {
    mockSupabaseSelect.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('Session not found')
  })

  // --- Cache hit ---

  it('returns cached assessment without calling Haiku', async () => {
    const cachedData = JSON.stringify({ 'Spore Frog': mockAssessment })
    mockSupabaseSelect.mockResolvedValue({ data: { id: 1, assessment_cache_json: cachedData }, error: null })

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.cached).toBe(true)
    expect(data.assessment).toEqual(mockAssessment)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  // --- Cache miss — Haiku call ---

  it('calls Haiku and returns assessment on cache miss', async () => {
    mockSupabaseSelect.mockResolvedValue({ data: { id: 1, assessment_cache_json: '{}' }, error: null })
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockAssessment) }],
    })

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.cached).toBe(false)
    expect(data.assessment.pros).toEqual(mockAssessment.pros)
    expect(data.assessment.cons).toEqual(mockAssessment.cons)
    expect(data.assessment.fit_score).toBe(9)
    expect(data.assessment.fit_note).toBe(mockAssessment.fit_note)

    // Verify Haiku was called with correct model and cache_control
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        system: expect.arrayContaining([
          expect.objectContaining({
            cache_control: { type: 'ephemeral' },
          }),
        ]),
      })
    )
  })

  it('caches the result in the database after Haiku call', async () => {
    mockSupabaseSelect.mockResolvedValue({ data: { id: 1, assessment_cache_json: '{}' }, error: null })
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockAssessment) }],
    })

    await POST(makeRequest(validBody))

    // Verify Supabase update was called to persist the cache
    expect(mockSupabaseUpdate).toHaveBeenCalled()
  })

  // --- Response parsing ---

  it('handles markdown-fenced JSON responses from Haiku', async () => {
    mockSupabaseSelect.mockResolvedValue({ data: { id: 1, assessment_cache_json: '{}' }, error: null })
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(mockAssessment) + '\n```' }],
    })

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.assessment.fit_score).toBe(9)
  })

  it('clamps fit_score to 1-10 range', async () => {
    mockSupabaseSelect.mockResolvedValue({ data: { id: 1, assessment_cache_json: '{}' }, error: null })
    const outOfRange = { ...mockAssessment, fit_score: 15 }
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(outOfRange) }],
    })

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.assessment.fit_score).toBe(10)
  })

  it('returns 502 when Haiku response cannot be parsed', async () => {
    mockSupabaseSelect.mockResolvedValue({ data: { id: 1, assessment_cache_json: '{}' }, error: null })
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'This is not JSON at all' }],
    })

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data.error).toContain('Failed to parse assessment')
  })

  // --- Error handling ---

  it('returns 500 when Anthropic throws', async () => {
    mockSupabaseSelect.mockResolvedValue({ data: { id: 1, assessment_cache_json: '{}' }, error: null })
    mockCreate.mockRejectedValue(new Error('API key invalid'))

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toContain('API key invalid')
  })

  // --- Context building ---

  it('includes strategy and existing cards in user prompt', async () => {
    mockSupabaseSelect.mockResolvedValue({ data: { id: 1, assessment_cache_json: '{}' }, error: null })
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockAssessment) }],
    })

    await POST(makeRequest(validBody))

    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages[0].content
    expect(userMessage).toContain('Spore Frog')
    expect(userMessage).toContain('Muldrotha, the Gravetide')
    expect(userMessage).toContain('Graveyard recursion engine')
    expect(userMessage).toContain('Sakura-Tribe Elder')
  })

  it('works without optional strategy and existingCards', async () => {
    mockSupabaseSelect.mockResolvedValue({ data: { id: 1, assessment_cache_json: '{}' }, error: null })
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockAssessment) }],
    })

    const minimalBody = {
      sessionId: 1,
      cardName: 'Sol Ring',
      deckContext: { commander: 'Muldrotha, the Gravetide' },
    }

    const res = await POST(makeRequest(minimalBody))
    expect(res.status).toBe(200)

    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages[0].content
    expect(userMessage).toContain('Sol Ring')
    expect(userMessage).toContain('Muldrotha, the Gravetide')
    expect(userMessage).not.toContain('Deck strategy:')
    expect(userMessage).not.toContain('Other cards in deck:')
  })
})
