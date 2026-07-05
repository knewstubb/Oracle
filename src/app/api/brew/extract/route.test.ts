import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

// Mock Anthropic SDK
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate }
  },
}))

import { POST } from './route'
import { NextRequest } from 'next/server'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/brew/extract', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/brew/extract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseUpdate.mockResolvedValue({ error: null })
  })

  it('returns 400 if sessionId is missing', async () => {
    const res = await POST(makeRequest({ responseText: 'hello' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('sessionId')
  })

  it('returns 400 if responseText is missing', async () => {
    const res = await POST(makeRequest({ sessionId: 1 }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('responseText')
  })

  it('returns 404 if session does not exist', async () => {
    mockSupabaseSelect.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const res = await POST(makeRequest({ sessionId: 999, responseText: 'hello' }))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toContain('Session not found')
  })

  it('extracts decisions and persists to decision_log_json', async () => {
    mockSupabaseSelect.mockResolvedValue({
      data: { id: 1, decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}' },
      error: null,
    })

    // Mock Haiku response with valid extractions
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              type: 'archetype',
              key: 'ARCHETYPE',
              value: 'Aristocrats',
              source_quote: 'An aristocrats strategy focused on sacrifice loops',
              confidence: 0.9,
            },
            {
              type: 'colour_identity',
              key: 'COLOUR IDENTITY',
              value: 'Orzhov (WB)',
              source_quote: 'black and white colours for sacrifice synergy',
              confidence: 0.85,
            },
          ]),
        },
      ],
    })

    const res = await POST(
      makeRequest({ sessionId: 1, responseText: 'Let us build an aristocrats deck in Orzhov colours.' })
    )

    expect(res.status).toBe(200)
    const data = await res.json()

    // Verify extracted entries are returned with section assignments
    expect(data.entries).toHaveLength(2)
    expect(data.entries[0].key).toBe('ARCHETYPE')
    expect(data.entries[0].value).toBe('Aristocrats')
    expect(data.entries[0].section).toBe('Strategy')
    expect(data.entries[1].key).toBe('COLOUR IDENTITY')
    expect(data.entries[1].value).toBe('Orzhov (WB)')
    expect(data.entries[1].section).toBe('Parameters')

    // Verify Supabase update was called to persist decision log
    expect(mockSupabaseUpdate).toHaveBeenCalled()
  })

  it('filters out low-confidence extractions', async () => {
    mockSupabaseSelect.mockResolvedValue({
      data: { id: 1, decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}' },
      error: null,
    })

    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              type: 'archetype',
              key: 'ARCHETYPE',
              value: 'Maybe Voltron?',
              source_quote: 'could be voltron',
              confidence: 0.4, // Below 0.7 threshold
            },
            {
              type: 'bracket',
              key: 'BRACKET',
              value: '3',
              source_quote: 'aiming for bracket 3',
              confidence: 0.8,
            },
          ]),
        },
      ],
    })

    const res = await POST(
      makeRequest({ sessionId: 1, responseText: 'Maybe voltron, aiming for bracket 3.' })
    )

    const data = await res.json()
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0].key).toBe('BRACKET')
    expect(data.entries[0].section).toBe('Parameters')
  })

  it('handles malformed JSON from Haiku gracefully', async () => {
    mockSupabaseSelect.mockResolvedValue({
      data: { id: 1, decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}' },
      error: null,
    })

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not valid json at all' }],
    })

    const res = await POST(
      makeRequest({ sessionId: 1, responseText: 'Some response text.' })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.entries).toEqual([])
  })

  it('uses cache_control on system prompt', async () => {
    mockSupabaseSelect.mockResolvedValue({
      data: { id: 1, decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}' },
      error: null,
    })

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '[]' }],
    })

    await POST(makeRequest({ sessionId: 1, responseText: 'Test response.' }))

    // Verify cache_control was passed in the system prompt
    expect(mockCreate).toHaveBeenCalledOnce()
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.system).toEqual([
      expect.objectContaining({
        type: 'text',
        cache_control: { type: 'ephemeral' },
      }),
    ])
  })

  it('appends to existing decision log entries', async () => {
    // Pre-populate with an existing strategy entry
    const existingLog = {
      strategy: [{ id: 'existing-1', key: 'PLAYSTYLE', value: 'Engine-based', sourceQuote: 'engines', timestamp: 1000 }],
      parameters: [],
      constraints: [],
    }
    mockSupabaseSelect.mockResolvedValue({
      data: { id: 1, decision_log_json: JSON.stringify(existingLog) },
      error: null,
    })

    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              type: 'constraints',
              key: 'CONSTRAINTS',
              value: 'No infinite combos',
              source_quote: 'no infinite combos allowed',
              confidence: 0.95,
            },
          ]),
        },
      ],
    })

    const res = await POST(
      makeRequest({ sessionId: 1, responseText: 'No infinite combos allowed in my pod.' })
    )

    expect(res.status).toBe(200)

    // Verify Supabase update was called with the merged decision log
    expect(mockSupabaseUpdate).toHaveBeenCalled()
  })
})
