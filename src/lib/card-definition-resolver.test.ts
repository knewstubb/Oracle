import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NormalizedCard } from '@/lib/deck-normalizer'

// ─── Mock Supabase ───────────────────────────────────────────────────────────

const mockUpsert = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<NormalizedCard> = {}): NormalizedCard {
  return {
    cardName: 'Sol Ring',
    scryfallId: 'abc-123',
    oracleId: 'oracle-sol-ring',
    setCode: 'c21',
    quantity: 1,
    typeLine: 'Artifact',
    isCommander: false,
    isProxy: false,
    manaCost: '{1}',
    colorIdentity: [],
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('resolveCardDefinitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ upsert: mockUpsert })
    mockUpsert.mockReturnValue({ select: mockSelect })
  })

  it('batch upserts cards with valid oracle_ids and returns map', async () => {
    const cards: NormalizedCard[] = [
      makeCard({ oracleId: 'oracle-1', cardName: 'Sol Ring', colorIdentity: [] }),
      makeCard({ oracleId: 'oracle-2', cardName: 'Mana Crypt', colorIdentity: [] }),
    ]

    mockSelect.mockResolvedValueOnce({
      data: [
        { id: 10, oracle_id: 'oracle-1' },
        { id: 20, oracle_id: 'oracle-2' },
      ],
      error: null,
    })

    const { resolveCardDefinitions } = await import('./card-definition-resolver')
    const result = await resolveCardDefinitions(cards, 'user-123')

    expect(result.get('oracle-1')).toBe(10)
    expect(result.get('oracle-2')).toBe(20)
    expect(result.size).toBe(2)

    // Verify upsert was called with correct rows
    expect(mockFrom).toHaveBeenCalledWith('card_definitions')
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        { oracle_id: 'oracle-1', card_name: 'Sol Ring', color_identity: '', type_line: 'Artifact', user_id: 'user-123' },
        { oracle_id: 'oracle-2', card_name: 'Mana Crypt', color_identity: '', type_line: 'Artifact', user_id: 'user-123' },
      ],
      { onConflict: 'oracle_id' }
    )
  })

  it('skips cards with empty oracle_id and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const cards: NormalizedCard[] = [
      makeCard({ oracleId: '', cardName: 'Unknown Card' }),
      makeCard({ oracleId: 'oracle-valid', cardName: 'Valid Card' }),
    ]

    mockSelect.mockResolvedValueOnce({
      data: [{ id: 99, oracle_id: 'oracle-valid' }],
      error: null,
    })

    const { resolveCardDefinitions } = await import('./card-definition-resolver')
    const result = await resolveCardDefinitions(cards, 'user-123')

    expect(result.size).toBe(1)
    expect(result.get('oracle-valid')).toBe(99)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping card "Unknown Card"')
    )

    warnSpy.mockRestore()
  })

  it('deduplicates cards by oracle_id (takes first occurrence)', async () => {
    const cards: NormalizedCard[] = [
      makeCard({ oracleId: 'oracle-dup', cardName: 'First Print' }),
      makeCard({ oracleId: 'oracle-dup', cardName: 'Second Print' }),
    ]

    mockSelect.mockResolvedValueOnce({
      data: [{ id: 42, oracle_id: 'oracle-dup' }],
      error: null,
    })

    const { resolveCardDefinitions } = await import('./card-definition-resolver')
    const result = await resolveCardDefinitions(cards, 'user-123')

    expect(result.size).toBe(1)
    // Should upsert only one row (the first occurrence)
    expect(mockUpsert).toHaveBeenCalledWith(
      [expect.objectContaining({ oracle_id: 'oracle-dup', card_name: 'First Print' })],
      { onConflict: 'oracle_id' }
    )
  })

  it('processes in batches of 500 for large inputs', async () => {
    const { BATCH_SIZE } = await import('./card-definition-resolver')
    expect(BATCH_SIZE).toBe(500)

    // Create 750 unique cards
    const cards: NormalizedCard[] = Array.from({ length: 750 }, (_, i) =>
      makeCard({ oracleId: `oracle-${i}`, cardName: `Card ${i}` })
    )

    // First batch (500 cards)
    mockSelect.mockResolvedValueOnce({
      data: Array.from({ length: 500 }, (_, i) => ({
        id: i + 1,
        oracle_id: `oracle-${i}`,
      })),
      error: null,
    })

    // Second batch (250 cards)
    mockSelect.mockResolvedValueOnce({
      data: Array.from({ length: 250 }, (_, i) => ({
        id: i + 501,
        oracle_id: `oracle-${i + 500}`,
      })),
      error: null,
    })

    const { resolveCardDefinitions } = await import('./card-definition-resolver')
    const result = await resolveCardDefinitions(cards, 'user-123')

    // Should have made 2 upsert calls (batches of 500 + 250)
    expect(mockUpsert).toHaveBeenCalledTimes(2)
    expect(result.size).toBe(750)

    // Verify first batch was 500 items
    const firstBatchRows = mockUpsert.mock.calls[0][0]
    expect(firstBatchRows).toHaveLength(500)

    // Verify second batch was 250 items
    const secondBatchRows = mockUpsert.mock.calls[1][0]
    expect(secondBatchRows).toHaveLength(250)
  })

  it('joins colorIdentity array into a string for DB column', async () => {
    const cards: NormalizedCard[] = [
      makeCard({ oracleId: 'oracle-multi', cardName: 'Multicolor Card', colorIdentity: ['W', 'U', 'B'] }),
    ]

    mockSelect.mockResolvedValueOnce({
      data: [{ id: 1, oracle_id: 'oracle-multi' }],
      error: null,
    })

    const { resolveCardDefinitions } = await import('./card-definition-resolver')
    await resolveCardDefinitions(cards, 'user-123')

    expect(mockUpsert).toHaveBeenCalledWith(
      [expect.objectContaining({ color_identity: 'WUB' })],
      { onConflict: 'oracle_id' }
    )
  })

  it('throws on supabase error', async () => {
    const cards: NormalizedCard[] = [
      makeCard({ oracleId: 'oracle-err', cardName: 'Error Card' }),
    ]

    mockSelect.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection refused' },
    })

    const { resolveCardDefinitions } = await import('./card-definition-resolver')
    await expect(resolveCardDefinitions(cards, 'user-123')).rejects.toThrow(
      'Failed to upsert card_definitions batch at offset 0: connection refused'
    )
  })

  it('returns empty map for empty card list', async () => {
    const { resolveCardDefinitions } = await import('./card-definition-resolver')
    const result = await resolveCardDefinitions([], 'user-123')
    expect(result.size).toBe(0)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
