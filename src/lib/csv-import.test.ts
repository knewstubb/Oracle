/**
 * Tests for csv-import.ts — CSV parsing, delta computation, and batch import.
 *
 * The source module uses Supabase async operations. Tests for parseCollectionCSV
 * are pure (no DB needed). Tests for computeCollectionDelta and applyCollectionImport
 * mock the Supabase client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseCollectionCSV,
  computeCollectionDelta,
  applyCollectionImport,
} from './csv-import'

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

/**
 * Build the current user_copies → user_cards joined rows the delta query reads.
 * `count` repeats the same physical copy, because computeCollectionDelta counts
 * one row per physical copy.
 */
function dbCopies(
  entries: Array<{ cardName: string; printingId: string; finish?: string; count: number }>
) {
  const rows: Array<{ printing_id: string; finish: string; user_cards: { card_name: string } }> = []
  for (const entry of entries) {
    for (let i = 0; i < entry.count; i++) {
      rows.push({
        printing_id: entry.printingId,
        finish: entry.finish ?? 'Normal',
        user_cards: { card_name: entry.cardName },
      })
    }
  }
  return rows
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// parseCollectionCSV — Pure tests (no DB needed)
// ---------------------------------------------------------------------------

describe('parseCollectionCSV', () => {
  it('parses a small valid CSV correctly', () => {
    const csv = `Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
2,Lightning Bolt,Normal,NM,2025-01-15,EN,0.50,,Core Set 2021,m21,123,abc-def,152,Red,Instant
1,Sol Ring,Foil,LP,2025-02-10,EN,5.00,,Commander Masters,cmm,456,ghi-jkl,388,,Artifact`

    const rows = parseCollectionCSV(csv)

    expect(rows).toHaveLength(2)

    expect(rows[0].quantity).toBe(2)
    expect(rows[0].name).toBe('Lightning Bolt')
    expect(rows[0].finish).toBe('Normal')
    expect(rows[0].condition).toBe('NM')
    expect(rows[0].dateAdded).toBe('2025-01-15')
    expect(rows[0].language).toBe('EN')
    expect(rows[0].purchasePrice).toBe(0.50)
    expect(rows[0].editionName).toBe('Core Set 2021')
    expect(rows[0].editionCode).toBe('m21')
    expect(rows[0].multiverseId).toBe('123')
    expect(rows[0].scryfallId).toBe('abc-def')
    expect(rows[0].collectorNumber).toBe('152')
    expect(rows[0].identities).toBe('Red')
    expect(rows[0].types).toBe('Instant')

    expect(rows[1].quantity).toBe(1)
    expect(rows[1].name).toBe('Sol Ring')
    expect(rows[1].finish).toBe('Foil')
    expect(rows[1].condition).toBe('LP')
    expect(rows[1].purchasePrice).toBe(5.00)
    expect(rows[1].identities).toBe('')
    expect(rows[1].types).toBe('Artifact')
  })

  it('handles quoted fields with commas', () => {
    const csv = `Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
2,"Aang, at the Crossroads // Aang, Destined Savior",Normal,NM,2025-11-16,EN,,Unsure,Avatar: The Last Airbender,tla,0,d7f35cd9-71ac-4191-8604-1a653b56c42d,346,"White,Blue,Green",Creature`

    const rows = parseCollectionCSV(csv)

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe(
      'Aang, at the Crossroads // Aang, Destined Savior'
    )
    expect(rows[0].identities).toBe('White,Blue,Green')
    expect(rows[0].editionCode).toBe('tla')
  })

  it('throws descriptive error for missing "Name" column', () => {
    const csv = `Quantity,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
2,Normal,NM,2025-01-15,EN,0.50,,Core Set 2021,m21,123,abc-def,152,Red,Instant`

    expect(() => parseCollectionCSV(csv)).toThrow(
      'CSV is missing required columns: Name'
    )
  })

  it('throws descriptive error for multiple missing columns', () => {
    const csv = `Quantity,Condition,Date Added
1,NM,2025-01-15`

    expect(() => parseCollectionCSV(csv)).toThrow(
      /CSV is missing required columns:.*Name.*Finish/
    )
  })

  it('throws on empty CSV', () => {
    expect(() => parseCollectionCSV('')).toThrow('CSV is empty')
  })

  it('skips blank lines and rows without a name', () => {
    const csv = `Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
2,Lightning Bolt,Normal,NM,2025-01-15,EN,,,Core Set 2021,m21,123,abc-def,152,Red,Instant

1,,Normal,NM,2025-01-15,EN,,,Core Set 2021,m21,456,ghi-jkl,200,Blue,Sorcery
3,Sol Ring,Normal,NM,2025-02-10,EN,,,Commander Masters,cmm,789,mno-pqr,388,,Artifact`

    const rows = parseCollectionCSV(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0].name).toBe('Lightning Bolt')
    expect(rows[1].name).toBe('Sol Ring')
  })

  it('normalizes invalid finish values to Normal', () => {
    const csv = `Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
1,Some Card,InvalidFinish,NM,2025-01-15,EN,,,Set Name,set,0,id-123,1,,Creature`

    const rows = parseCollectionCSV(csv)
    expect(rows[0].finish).toBe('Normal')
  })
})

// ---------------------------------------------------------------------------
// computeCollectionDelta — Async tests with mocked Supabase
// ---------------------------------------------------------------------------

describe('computeCollectionDelta', () => {
  it('reports correct additions when new rows are not in DB', async () => {
    // Mock: DB returns existing collection copies (one row per physical copy)
    const dbRows = dbCopies([
      { cardName: 'Lightning Bolt', printingId: 'abc-def', count: 2 },
      { cardName: 'Sol Ring', printingId: 'ghi-jkl', count: 1 },
    ])

    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: dbRows, error: null }),
    })

    const newRows = parseCollectionCSV(`Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
2,Lightning Bolt,Normal,NM,2025-01-15,EN,0.50,,Core Set 2021,m21,123,abc-def,152,Red,Instant
1,Sol Ring,Normal,LP,2025-02-10,EN,5.00,,Commander Masters,cmm,456,ghi-jkl,388,,Artifact
1,Path to Exile,Normal,NM,2025-04-01,EN,2.00,,Modern Masters,mm3,100,xyz-123,25,White,Instant`)

    const delta = await computeCollectionDelta(newRows)

    expect(delta.added).toHaveLength(1)
    expect(delta.added[0].name).toBe('Path to Exile')
    expect(delta.removed).toHaveLength(0)
    expect(delta.quantityChanged).toHaveLength(0)
    expect(delta.totalEntries).toBe(3)
    expect(delta.previousEntries).toBe(3)
  })

  it('reports correct removals when DB rows are absent in new data', async () => {
    const dbRows = dbCopies([
      { cardName: 'Lightning Bolt', printingId: 'abc-def', count: 2 },
      { cardName: 'Sol Ring', printingId: 'ghi-jkl', count: 1 },
      { cardName: 'Counterspell', printingId: 'cnt-1', count: 3 },
    ])

    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: dbRows, error: null }),
    })

    const newRows = parseCollectionCSV(`Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
2,Lightning Bolt,Normal,NM,2025-01-15,EN,0.50,,Core Set 2021,m21,123,abc-def,152,Red,Instant
1,Sol Ring,Normal,LP,2025-02-10,EN,5.00,,Commander Masters,cmm,456,ghi-jkl,388,,Artifact`)

    const delta = await computeCollectionDelta(newRows)

    expect(delta.added).toHaveLength(0)
    expect(delta.removed).toHaveLength(1)
    expect(delta.removed[0].name).toBe('Counterspell')
    expect(delta.removed[0].quantity).toBe(3)
    expect(delta.quantityChanged).toHaveLength(0)
    expect(delta.totalEntries).toBe(2)
    expect(delta.previousEntries).toBe(6)
  })

  it('reports correct quantity changes', async () => {
    const dbRows = dbCopies([
      { cardName: 'Lightning Bolt', printingId: 'abc-def', count: 2 },
      { cardName: 'Sol Ring', printingId: 'ghi-jkl', count: 1 },
    ])

    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: dbRows, error: null }),
    })

    const newRows = parseCollectionCSV(`Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
4,Lightning Bolt,Normal,NM,2025-01-15,EN,0.50,,Core Set 2021,m21,123,abc-def,152,Red,Instant
1,Sol Ring,Normal,LP,2025-02-10,EN,5.00,,Commander Masters,cmm,456,ghi-jkl,388,,Artifact`)

    const delta = await computeCollectionDelta(newRows)

    expect(delta.added).toHaveLength(0)
    expect(delta.removed).toHaveLength(0)
    expect(delta.quantityChanged).toHaveLength(1)
    expect(delta.quantityChanged[0].entry.name).toBe('Lightning Bolt')
    expect(delta.quantityChanged[0].entry.quantity).toBe(4)
    expect(delta.quantityChanged[0].previousQuantity).toBe(2)
  })

  it('reports empty delta when nothing changed', async () => {
    const dbRows = dbCopies([
      { cardName: 'Lightning Bolt', printingId: 'abc-def', count: 2 },
      { cardName: 'Sol Ring', printingId: 'ghi-jkl', count: 1 },
    ])

    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: dbRows, error: null }),
    })

    const newRows = parseCollectionCSV(`Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
2,Lightning Bolt,Normal,NM,2025-01-15,EN,0.50,,Core Set 2021,m21,123,abc-def,152,Red,Instant
1,Sol Ring,Normal,LP,2025-02-10,EN,5.00,,Commander Masters,cmm,456,ghi-jkl,388,,Artifact`)

    const delta = await computeCollectionDelta(newRows)

    expect(delta.added).toHaveLength(0)
    expect(delta.removed).toHaveLength(0)
    expect(delta.quantityChanged).toHaveLength(0)
    expect(delta.totalEntries).toBe(2)
    expect(delta.previousEntries).toBe(3)
  })

  it('throws when Supabase returns an error', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'Connection failed' } }),
    })

    const newRows = parseCollectionCSV(`Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
1,Lightning Bolt,Normal,NM,2025-01-15,EN,,,Core Set 2021,m21,123,abc-def,152,Red,Instant`)

    await expect(computeCollectionDelta(newRows)).rejects.toThrow(
      'Failed to read current collection: Connection failed'
    )
  })
})

// ---------------------------------------------------------------------------
// applyCollectionImport — Async tests with mocked Supabase
// ---------------------------------------------------------------------------

describe('applyCollectionImport', () => {
  interface ApplyMockOptions {
    printings?: Array<{ name: string; oracle_id: string }>
    insertedCards?: Array<{ id: number; card_name: string }>
    existingCopyIds?: Array<{ id: number }>
    rpcResult?: { data: unknown; error: { message: string } | null }
  }

  function setupApplyImportMock({
    printings = [],
    insertedCards = [],
    existingCopyIds = [],
    rpcResult = { data: { success: true, inserted_count: 0, removed_count: 0 }, error: null },
  }: ApplyMockOptions = {}) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'ref_printings') {
        return { select: () => ({ in: () => Promise.resolve({ data: printings, error: null }) }) }
      }
      if (table === 'user_cards') {
        return {
          upsert: () => ({
            select: () => Promise.resolve({ data: insertedCards, error: null }),
          }),
        }
      }
      if (table === 'user_copies') {
        return {
          select: () => ({
            eq: () => ({
              range: () => Promise.resolve({ data: existingCopyIds, error: null }),
            }),
          }),
        }
      }
      if (table === 'sync_meta') {
        return { upsert: () => Promise.resolve({ error: null }) }
      }
      throw new Error(`Unexpected table: ${table}`)
    })
    mockRpc.mockResolvedValue(rpcResult)
  }

  it('replaces the collection atomically and updates sync_meta', async () => {
    setupApplyImportMock({
      printings: [
        { name: 'Lightning Bolt', oracle_id: 'o-lb' },
        { name: 'Sol Ring', oracle_id: 'o-sr' },
      ],
      insertedCards: [
        { id: 10, card_name: 'Lightning Bolt' },
        { id: 20, card_name: 'Sol Ring' },
      ],
      existingCopyIds: [{ id: 1 }, { id: 2 }],
      rpcResult: { data: { success: true, inserted_count: 3, removed_count: 2 }, error: null },
    })

    const rows = parseCollectionCSV(`Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
2,Lightning Bolt,Normal,NM,2025-01-15,EN,0.50,,Core Set 2021,m21,123,abc-def,152,Red,Instant
1,Sol Ring,Foil,LP,2025-02-10,EN,5.00,,Commander Masters,cmm,456,ghi-jkl,388,,Artifact`)

    const result = await applyCollectionImport(rows, { userId: 'user-1' })

    expect(result.totalInserted).toBe(3)
    expect(result.errors).toHaveLength(0)
    expect(result.batches).toHaveLength(1)
    expect(result.batches[0].rowsProcessed).toBe(3)

    const rpcCall = mockRpc.mock.calls.find(([name]) => name === 'apply_collection_sync')
    expect(rpcCall).toBeDefined()
    expect(rpcCall![1]).toEqual(
      expect.objectContaining({
        p_user_id: 'user-1',
        p_remove_copy_ids: [1, 2],
      })
    )
    // One row per physical copy (2 Lightning Bolt + 1 Sol Ring)
    expect(rpcCall![1].p_insert_rows).toHaveLength(3)

    expect(mockFrom).toHaveBeenCalledWith('sync_meta')
  })

  it('appends copies without clearing when skipDelete is set', async () => {
    setupApplyImportMock({
      printings: [{ name: 'Lightning Bolt', oracle_id: 'o-lb' }],
      insertedCards: [{ id: 10, card_name: 'Lightning Bolt' }],
      rpcResult: { data: { success: true, inserted_count: 2 }, error: null },
    })

    const rows = parseCollectionCSV(`Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
2,Lightning Bolt,Normal,NM,2025-01-15,EN,0.50,,Core Set 2021,m21,123,abc-def,152,Red,Instant`)

    const result = await applyCollectionImport(rows, { userId: 'user-1', skipDelete: true })

    expect(result.totalInserted).toBe(2)
    expect(mockRpc).toHaveBeenCalledWith(
      'insert_user_copies',
      expect.objectContaining({ p_user_id: 'user-1' })
    )
    expect(mockRpc).not.toHaveBeenCalledWith('apply_collection_sync', expect.anything())
  })

  it('throws when the atomic replacement fails', async () => {
    setupApplyImportMock({
      printings: [{ name: 'Lightning Bolt', oracle_id: 'o-lb' }],
      insertedCards: [{ id: 10, card_name: 'Lightning Bolt' }],
      existingCopyIds: [],
      rpcResult: { data: null, error: { message: 'Permission denied' } },
    })

    const rows = parseCollectionCSV(`Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
1,Lightning Bolt,Normal,NM,2025-01-15,EN,,,Core Set 2021,m21,123,abc-def,152,Red,Instant`)

    await expect(applyCollectionImport(rows, { userId: 'user-1' })).rejects.toThrow(
      'Atomic collection import failed: Permission denied'
    )
  })

  it('returns an error result when no user id is provided', async () => {
    const rows = parseCollectionCSV(`Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
1,Lightning Bolt,Normal,NM,2025-01-15,EN,,,Core Set 2021,m21,123,abc-def,152,Red,Instant`)

    const result = await applyCollectionImport(rows)

    expect(result).toEqual({ totalInserted: 0, batches: [], errors: ['No user ID provided'] })
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
