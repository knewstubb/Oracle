/**
 * Tests for importCollectionAndReallocate
 *
 * Migrated from src/lib/sync-engine.test.ts to cover the extracted function
 * in its new location at @/lib/collection-reallocator.
 *
 * Validates: Requirements 8.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AllocationDiff } from './allocation-store'
import type { ImportDelta, CollectionCSVRow } from './csv-import'

// ---------------------------------------------------------------------------
// Mock Dependencies
// ---------------------------------------------------------------------------

const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

const mockBuildAllocationInput = vi.fn()
const mockApplyAllocationOutput = vi.fn()

vi.mock('./allocation-store', () => ({
  buildAllocationInput: (...args: any[]) => mockBuildAllocationInput(...args),
  applyAllocationOutput: (...args: any[]) => mockApplyAllocationOutput(...args),
}))

const mockComputeAllocations = vi.fn()

vi.mock('./allocation-resolver', () => ({
  computeAllocations: (...args: any[]) => mockComputeAllocations(...args),
}))

const mockParseCollectionCSV = vi.fn()

vi.mock('./csv-import', () => ({
  parseCollectionCSV: (...args: any[]) => mockParseCollectionCSV(...args),
}))

vi.mock('./health-engine', () => ({
  computeHealth: vi.fn().mockReturnValue({ deckId: 0, issues: [], score: 100 }),
}))

vi.mock('./health-store', () => ({
  upsertHealthResult: vi.fn().mockResolvedValue(undefined),
  getHealthOverrides: vi.fn().mockResolvedValue(new Map()),
}))

import { importCollectionAndReallocate } from '@/lib/collection-reallocator'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CSV_HEADER = 'Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types'

function makeCSVRow(overrides: Partial<CollectionCSVRow> = {}): CollectionCSVRow {
  return {
    quantity: 1,
    name: 'Sol Ring',
    finish: 'Normal',
    condition: 'NM',
    dateAdded: '2025-01-15',
    language: 'EN',
    purchasePrice: 5.0,
    tags: '',
    editionName: 'Commander Masters',
    editionCode: 'cmm',
    multiverseId: '456',
    scryfallId: 'sol-1',
    collectorNumber: '388',
    identities: '',
    types: 'Artifact',
    ...overrides,
  }
}

function emptyAllocationDiff(): AllocationDiff {
  return {
    added: [],
    removed: [],
    proxyToOriginal: [],
    originalToProxy: [],
    unchanged: [],
  }
}

/**
 * Setup the standard Supabase mock chain for importCollectionAndReallocate.
 * Returns control objects so tests can customize responses per table.
 */
function setupSupabaseMock(config: {
  currentCollection?: any[]
  currentAllocations?: any[]
  decks?: any[]
  deckCards?: any[]
}) {
  const {
    currentCollection = [],
    currentAllocations = [],
    decks = [],
    deckCards = [],
  } = config

  mockFrom.mockImplementation((table: string) => {
    if (table === 'collection') {
      return {
        select: () => Promise.resolve({ data: currentCollection, error: null }),
        delete: () => ({
          neq: () => Promise.resolve({ data: null, error: null }),
        }),
        insert: () => Promise.resolve({ data: null, error: null }),
      }
    }
    if (table === 'deck_allocations') {
      return {
        select: () => Promise.resolve({ data: currentAllocations, error: null }),
      }
    }
    if (table === 'decks') {
      return {
        select: () => Promise.resolve({ data: decks, error: null }),
      }
    }
    if (table === 'deck_cards') {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: deckCards, error: null }),
        }),
      }
    }
    if (table === 'sync_meta') {
      return {
        upsert: () => Promise.resolve({ data: null, error: null }),
      }
    }
    return {
      select: () => Promise.resolve({ data: [], error: null }),
      delete: () => ({ neq: () => Promise.resolve({ data: null, error: null }) }),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
    }
  })
}

// ---------------------------------------------------------------------------
// Tests: importCollectionAndReallocate
// ---------------------------------------------------------------------------

describe('importCollectionAndReallocate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('newly owned card promotes proxy → original (Req 6.2)', async () => {
    // Setup: Sol Ring in two decks, previously no collection supply
    const csvRows = [makeCSVRow({ name: 'Sol Ring', quantity: 1, editionCode: 'cmm', scryfallId: 'sol-1', collectorNumber: '388' })]
    mockParseCollectionCSV.mockReturnValue(csvRows)

    setupSupabaseMock({
      currentCollection: [], // No previous collection
      currentAllocations: [
        { card_name: 'Sol Ring', deck_id: 1, role: 'proxy', scryfall_id: 'sol-1', set_code: 'cmm' },
        { card_name: 'Sol Ring', deck_id: 2, role: 'proxy', scryfall_id: 'sol-1', set_code: 'cmm' },
      ],
      decks: [
        { id: 1, name: 'World Breaker' },
        { id: 2, name: 'Enchantress' },
      ],
    })

    // Allocation resolver output: deck 1 gets original (higher priority), deck 2 stays proxy
    const allocationDiff: AllocationDiff = {
      added: [],
      removed: [],
      proxyToOriginal: [{ cardName: 'Sol Ring', deckId: 1, scryfallId: 'sol-1', setCode: 'cmm', role: 'original', collectorNumber: '388', priorityOverride: false }],
      originalToProxy: [],
      unchanged: [{ cardName: 'Sol Ring', deckId: 2, scryfallId: 'sol-1', setCode: 'cmm', role: 'proxy', collectorNumber: '388', priorityOverride: false }],
    }

    mockBuildAllocationInput.mockResolvedValue({ decks: [], collection: [] })
    mockComputeAllocations.mockReturnValue([])
    mockApplyAllocationOutput.mockResolvedValue(allocationDiff)

    const result = await importCollectionAndReallocate('csv-content', 'test-user')

    // Deck 1 should now be original (promoted from proxy)
    expect(result.newlyFulfilled).toHaveLength(1)
    expect(result.newlyFulfilled[0].cardName).toBe('Sol Ring')
    expect(result.newlyFulfilled[0].deckId).toBe(1)
    expect(result.newlyFulfilled[0].deckName).toBe('World Breaker')

    // Deck 2 remains proxy — not in newlyBroken
    expect(result.newlyBroken).toHaveLength(0)
  })

  it('removed card demotes original → proxy (Req 6.3)', async () => {
    // Setup: CSV no longer contains Sol Ring
    const csvRows = [makeCSVRow({ name: 'Lightning Bolt', quantity: 1, editionCode: 'm21', scryfallId: 'bolt-1', collectorNumber: '152' })]
    mockParseCollectionCSV.mockReturnValue(csvRows)

    setupSupabaseMock({
      currentCollection: [
        { card_name: 'Sol Ring', set_code: 'cmm', quantity: 1, finish: 'Normal' },
      ],
      currentAllocations: [
        { card_name: 'Sol Ring', deck_id: 1, role: 'original', scryfall_id: 'sol-1', set_code: 'cmm' },
      ],
      decks: [
        { id: 1, name: 'World Breaker' },
      ],
    })

    // Allocation resolver: Sol Ring lost its supply → demoted to proxy
    const allocationDiff: AllocationDiff = {
      added: [],
      removed: [],
      proxyToOriginal: [],
      originalToProxy: [{ cardName: 'Sol Ring', deckId: 1, scryfallId: 'sol-1', setCode: 'cmm', role: 'proxy', collectorNumber: '388', priorityOverride: false }],
      unchanged: [],
    }

    mockBuildAllocationInput.mockResolvedValue({ decks: [], collection: [] })
    mockComputeAllocations.mockReturnValue([])
    mockApplyAllocationOutput.mockResolvedValue(allocationDiff)

    const result = await importCollectionAndReallocate('csv-content', 'test-user')

    // Sol Ring lost its supply → newly broken
    expect(result.newlyBroken).toHaveLength(1)
    expect(result.newlyBroken[0].cardName).toBe('Sol Ring')
    expect(result.newlyBroken[0].deckId).toBe(1)
    expect(result.newlyBroken[0].deckName).toBe('World Breaker')
    expect(result.newlyBroken[0].previousScryfallId).toBe('sol-1')
  })

  it('returns importDelta with added/removed/changed cards', async () => {
    // CSV has Sol Ring (new) + Lightning Bolt (changed quantity)
    const csvRows = [
      makeCSVRow({ name: 'Lightning Bolt', quantity: 3, editionCode: 'm21', scryfallId: 'bolt-1', collectorNumber: '152' }),
      makeCSVRow({ name: 'Sol Ring', quantity: 1, editionCode: 'cmm', scryfallId: 'sol-1', collectorNumber: '388' }),
    ]
    mockParseCollectionCSV.mockReturnValue(csvRows)

    setupSupabaseMock({
      currentCollection: [
        { card_name: 'Lightning Bolt', set_code: 'm21', quantity: 2, finish: 'Normal' },
      ],
      currentAllocations: [],
      decks: [],
    })

    mockBuildAllocationInput.mockResolvedValue({ decks: [], collection: [] })
    mockComputeAllocations.mockReturnValue([])
    mockApplyAllocationOutput.mockResolvedValue(emptyAllocationDiff())

    const result = await importCollectionAndReallocate('csv-content', 'test-user')

    expect(result.importDelta.added).toHaveLength(1)
    expect(result.importDelta.added[0].name).toBe('Sol Ring')
    expect(result.importDelta.quantityChanged).toHaveLength(1)
    expect(result.importDelta.quantityChanged[0].entry.name).toBe('Lightning Bolt')
    expect(result.importDelta.quantityChanged[0].previousQuantity).toBe(2)
    expect(result.importDelta.totalEntries).toBe(2)
    expect(result.importDelta.previousEntries).toBe(1)
  })

  it('triggers full reallocation across all decks (Req 6.5)', async () => {
    // CSV now has 2 copies of Sol Ring — deck 2 should also become original
    const csvRows = [makeCSVRow({ name: 'Sol Ring', quantity: 2, editionCode: 'cmm', scryfallId: 'sol-1', collectorNumber: '388' })]
    mockParseCollectionCSV.mockReturnValue(csvRows)

    setupSupabaseMock({
      currentCollection: [
        { card_name: 'Sol Ring', set_code: 'cmm', quantity: 1, finish: 'Normal' },
      ],
      currentAllocations: [
        { card_name: 'Sol Ring', deck_id: 1, role: 'original', scryfall_id: 'sol-1', set_code: 'cmm' },
        { card_name: 'Sol Ring', deck_id: 2, role: 'proxy', scryfall_id: null, set_code: null },
      ],
      decks: [
        { id: 1, name: 'World Breaker' },
        { id: 2, name: 'Enchantress' },
      ],
    })

    // Allocation: deck 2 is now also fulfilled
    const allocationDiff: AllocationDiff = {
      added: [],
      removed: [],
      proxyToOriginal: [{ cardName: 'Sol Ring', deckId: 2, scryfallId: 'sol-1', setCode: 'cmm', role: 'original', collectorNumber: '388', priorityOverride: false }],
      originalToProxy: [],
      unchanged: [{ cardName: 'Sol Ring', deckId: 1, scryfallId: 'sol-1', setCode: 'cmm', role: 'original', collectorNumber: '388', priorityOverride: false }],
    }

    mockBuildAllocationInput.mockResolvedValue({ decks: [], collection: [] })
    mockComputeAllocations.mockReturnValue([])
    mockApplyAllocationOutput.mockResolvedValue(allocationDiff)

    const result = await importCollectionAndReallocate('csv-content', 'test-user')

    // Deck 2 should be newly fulfilled (proxy → original)
    expect(result.newlyFulfilled).toHaveLength(1)
    expect(result.newlyFulfilled[0].cardName).toBe('Sol Ring')
    expect(result.newlyFulfilled[0].deckId).toBe(2)
    expect(result.newlyFulfilled[0].deckName).toBe('Enchantress')
  })

  it('handles empty collection import (all allocations become proxy)', async () => {
    // Empty CSV → all cards removed from collection
    mockParseCollectionCSV.mockReturnValue([])

    setupSupabaseMock({
      currentCollection: [
        { card_name: 'Sol Ring', set_code: 'cmm', quantity: 1, finish: 'Normal' },
      ],
      currentAllocations: [
        { card_name: 'Sol Ring', deck_id: 1, role: 'original', scryfall_id: 'sol-1', set_code: 'cmm' },
      ],
      decks: [
        { id: 1, name: 'World Breaker' },
      ],
    })

    // Allocation: Sol Ring demoted
    const allocationDiff: AllocationDiff = {
      added: [],
      removed: [],
      proxyToOriginal: [],
      originalToProxy: [{ cardName: 'Sol Ring', deckId: 1, scryfallId: 'sol-1', setCode: 'cmm', role: 'proxy', collectorNumber: '388', priorityOverride: false }],
      unchanged: [],
    }

    mockBuildAllocationInput.mockResolvedValue({ decks: [], collection: [] })
    mockComputeAllocations.mockReturnValue([])
    mockApplyAllocationOutput.mockResolvedValue(allocationDiff)

    const result = await importCollectionAndReallocate('csv-content', 'test-user')

    expect(result.newlyBroken).toHaveLength(1)
    expect(result.newlyBroken[0].cardName).toBe('Sol Ring')
    expect(result.importDelta.removed).toHaveLength(1)
    expect(result.importDelta.removed[0].name).toBe('Sol Ring')
  })

  it('preserves unchanged allocations', async () => {
    // Same collection imported — nothing changes
    const csvRows = [makeCSVRow({ name: 'Sol Ring', quantity: 1, editionCode: 'cmm', scryfallId: 'sol-1', collectorNumber: '388' })]
    mockParseCollectionCSV.mockReturnValue(csvRows)

    setupSupabaseMock({
      currentCollection: [
        { card_name: 'Sol Ring', set_code: 'cmm', quantity: 1, finish: 'Normal' },
      ],
      currentAllocations: [
        { card_name: 'Sol Ring', deck_id: 1, role: 'original', scryfall_id: 'sol-1', set_code: 'cmm' },
      ],
      decks: [
        { id: 1, name: 'World Breaker' },
      ],
    })

    // Nothing changes in allocation
    const allocationDiff: AllocationDiff = {
      added: [],
      removed: [],
      proxyToOriginal: [],
      originalToProxy: [],
      unchanged: [{ cardName: 'Sol Ring', deckId: 1, scryfallId: 'sol-1', setCode: 'cmm', role: 'original', collectorNumber: '388', priorityOverride: false }],
    }

    mockBuildAllocationInput.mockResolvedValue({ decks: [], collection: [] })
    mockComputeAllocations.mockReturnValue([])
    mockApplyAllocationOutput.mockResolvedValue(allocationDiff)

    const result = await importCollectionAndReallocate('csv-content', 'test-user')

    expect(result.newlyFulfilled).toHaveLength(0)
    expect(result.newlyBroken).toHaveLength(0)
    expect(result.allocationChanges.unchanged).toHaveLength(1)
  })
})
