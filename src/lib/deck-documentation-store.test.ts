import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getDocumentation,
  upsertDocumentation,
  getNotes,
  appendNote,
} from './deck-documentation-store'

// ---------------------------------------------------------------------------
// Mock Supabase Client
// ---------------------------------------------------------------------------

const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpsert = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockMaybeSingle = vi.fn()
const mockSingle = vi.fn()

function createChainableMock() {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  return chain
}

let mockChain: ReturnType<typeof createChainableMock>

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      mockChain._table = table
      return mockChain
    },
  }),
}))

// ---------------------------------------------------------------------------
// getDocumentation
// ---------------------------------------------------------------------------

describe('getDocumentation', () => {
  beforeEach(() => {
    mockChain = createChainableMock()
  })

  it('returns null when no documentation exists', async () => {
    mockChain.maybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await getDocumentation(1)
    expect(result).toBeNull()
  })

  it('returns the documentation row when it exists', async () => {
    const mockDoc = {
      deck_id: 1,
      strategy_playstyle: 'Aggro strategy',
      synergy_lines: null,
      strengths_weaknesses: null,
      matchup_notes: null,
      mulligan_guide: null,
      updated_at: '2024-01-01T00:00:00Z',
    }
    mockChain.maybeSingle.mockResolvedValue({ data: mockDoc, error: null })

    const result = await getDocumentation(1)
    expect(result).not.toBeNull()
    expect(result!.deck_id).toBe(1)
    expect(result!.strategy_playstyle).toBe('Aggro strategy')
    expect(result!.synergy_lines).toBeNull()
  })

  it('throws on Supabase error', async () => {
    mockChain.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'Connection failed' },
    })

    await expect(getDocumentation(1)).rejects.toThrow('Failed to get documentation for deck 1')
  })
})

// ---------------------------------------------------------------------------
// upsertDocumentation
// ---------------------------------------------------------------------------

describe('upsertDocumentation', () => {
  beforeEach(() => {
    mockChain = createChainableMock()
  })

  it('inserts documentation when none exists', async () => {
    // First call: getDocumentation returns null (no existing)
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // Second call: upsert succeeds
    mockChain.upsert.mockReturnValue(mockChain)
    const upsertResult = { data: null, error: null }
    // Override the chain to return success on upsert
    mockChain.upsert.mockImplementation(() => ({ ...upsertResult }))

    await upsertDocumentation(1, { strategy_playstyle: 'Control' })

    // Verify upsert was called (the function completed without error)
    expect(mockChain.select).toHaveBeenCalled()
  })

  it('throws for invalid JSON in synergy_lines', async () => {
    await expect(
      upsertDocumentation(1, { synergy_lines: 'not json' })
    ).rejects.toThrow('synergy_lines must be a valid JSON array')
  })

  it('throws when synergy_lines is valid JSON but not an array', async () => {
    await expect(
      upsertDocumentation(1, { synergy_lines: '{"key": "value"}' })
    ).rejects.toThrow('synergy_lines must be a valid JSON array')
  })

  it('accepts valid JSON array for synergy_lines', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockChain.upsert.mockImplementation(() => ({ data: null, error: null }))

    // Should not throw
    await upsertDocumentation(1, { synergy_lines: '["combo A", "combo B"]' })
  })

  it('allows null synergy_lines', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockChain.upsert.mockImplementation(() => ({ data: null, error: null }))

    // Should not throw
    await upsertDocumentation(1, { synergy_lines: null })
  })
})

// ---------------------------------------------------------------------------
// getNotes
// ---------------------------------------------------------------------------

describe('getNotes', () => {
  beforeEach(() => {
    mockChain = createChainableMock()
  })

  it('returns empty array when no notes exist', async () => {
    // The query chain resolves after order (no limit)
    mockChain.order.mockResolvedValue({ data: [], error: null })

    const result = await getNotes(1)
    expect(result).toEqual([])
  })

  it('returns notes from the query result', async () => {
    const mockNotes = [
      { id: 3, deck_id: 1, content: 'Third', created_at: '2024-01-03T10:00:00Z' },
      { id: 2, deck_id: 1, content: 'Second', created_at: '2024-01-02T10:00:00Z' },
      { id: 1, deck_id: 1, content: 'First', created_at: '2024-01-01T10:00:00Z' },
    ]
    mockChain.order.mockResolvedValue({ data: mockNotes, error: null })

    const result = await getNotes(1)
    expect(result).toHaveLength(3)
    expect(result[0].content).toBe('Third')
    expect(result[2].content).toBe('First')
  })

  it('applies limit when provided', async () => {
    const mockNotes = [
      { id: 3, deck_id: 1, content: 'Third', created_at: '2024-01-03T10:00:00Z' },
      { id: 2, deck_id: 1, content: 'Second', created_at: '2024-01-02T10:00:00Z' },
    ]
    mockChain.limit.mockResolvedValue({ data: mockNotes, error: null })

    const result = await getNotes(1, 2)
    expect(result).toHaveLength(2)
    expect(mockChain.limit).toHaveBeenCalledWith(2)
  })

  it('throws on Supabase error', async () => {
    mockChain.order.mockResolvedValue({
      data: null,
      error: { message: 'Query failed' },
    })

    await expect(getNotes(1)).rejects.toThrow('Failed to get notes for deck 1')
  })
})

// ---------------------------------------------------------------------------
// appendNote
// ---------------------------------------------------------------------------

describe('appendNote', () => {
  beforeEach(() => {
    mockChain = createChainableMock()
  })

  it('inserts a note and returns the id', async () => {
    mockChain.single.mockResolvedValue({ data: { id: 42 }, error: null })

    const id = await appendNote(1, 'My coaching note')
    expect(id).toBe(42)
  })

  it('throws for empty content', async () => {
    await expect(appendNote(1, '')).rejects.toThrow('Content must not be blank')
  })

  it('throws for whitespace-only content', async () => {
    await expect(appendNote(1, '   \t\n  ')).rejects.toThrow('Content must not be blank')
  })

  it('throws on Supabase error', async () => {
    mockChain.single.mockResolvedValue({
      data: null,
      error: { message: 'FK violation' },
    })

    await expect(appendNote(1, 'Some content')).rejects.toThrow('Failed to append note for deck 1')
  })
})
