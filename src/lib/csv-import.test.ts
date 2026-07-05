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
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockDelete = vi.fn()
const mockUpsert = vi.fn()
const mockEq = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: mockFrom,
  }),
}))

/**
 * Helper to set up chained mock responses for supabase query builder.
 */
function setupMockChain(overrides: Record<string, any> = {}) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ...overrides,
  }
  // Make the chain resolve to { data, error } by default
  chain.select.mockReturnValue(chain)
  chain.insert.mockReturnValue(chain)
  chain.delete.mockReturnValue(chain)
  chain.upsert.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  return chain
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
    // Mock: DB returns existing collection rows
    const dbRows = [
      { card_name: 'Lightning Bolt', set_code: 'm21', quantity: 2, finish: 'Normal' },
      { card_name: 'Sol Ring', set_code: 'cmm', quantity: 1, finish: 'Normal' },
    ]

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
    expect(delta.previousEntries).toBe(2)
  })

  it('reports correct removals when DB rows are absent in new data', async () => {
    const dbRows = [
      { card_name: 'Lightning Bolt', set_code: 'm21', quantity: 2, finish: 'Normal' },
      { card_name: 'Sol Ring', set_code: 'cmm', quantity: 1, finish: 'Normal' },
      { card_name: 'Counterspell', set_code: 'cmm', quantity: 3, finish: 'Normal' },
    ]

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
    expect(delta.quantityChanged).toHaveLength(0)
    expect(delta.totalEntries).toBe(2)
    expect(delta.previousEntries).toBe(3)
  })

  it('reports correct quantity changes', async () => {
    const dbRows = [
      { card_name: 'Lightning Bolt', set_code: 'm21', quantity: 2, finish: 'Normal' },
      { card_name: 'Sol Ring', set_code: 'cmm', quantity: 1, finish: 'Normal' },
    ]

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
    const dbRows = [
      { card_name: 'Lightning Bolt', set_code: 'm21', quantity: 2, finish: 'Normal' },
      { card_name: 'Sol Ring', set_code: 'cmm', quantity: 1, finish: 'Normal' },
    ]

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
    expect(delta.previousEntries).toBe(2)
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
  it('deletes existing rows, inserts new rows in batches, and updates sync_meta', async () => {
    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }

    const insertChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }

    const upsertChain = {
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }

    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'collection') {
        callCount++
        // First call is the delete, subsequent calls are inserts
        if (callCount === 1) return deleteChain
        return insertChain
      }
      if (table === 'sync_meta') return upsertChain
      return insertChain
    })

    const rows = parseCollectionCSV(`Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
2,Lightning Bolt,Normal,NM,2025-01-15,EN,0.50,,Core Set 2021,m21,123,abc-def,152,Red,Instant
1,Sol Ring,Foil,LP,2025-02-10,EN,5.00,,Commander Masters,cmm,456,ghi-jkl,388,,Artifact`)

    const result = await applyCollectionImport(rows)

    expect(result.totalInserted).toBe(2)
    expect(result.errors).toHaveLength(0)
    expect(result.batches).toHaveLength(1)
    expect(result.batches[0].rowsProcessed).toBe(2)

    // Verify delete was called on collection
    expect(deleteChain.delete).toHaveBeenCalled()
    // Verify insert was called
    expect(insertChain.insert).toHaveBeenCalled()
    // Verify sync_meta was updated
    expect(upsertChain.upsert).toHaveBeenCalled()
  })

  it('processes rows in multiple batches when exceeding BATCH_SIZE', async () => {
    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }

    const insertChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }

    const upsertChain = {
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }

    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'collection') {
        callCount++
        if (callCount === 1) return deleteChain
        return insertChain
      }
      if (table === 'sync_meta') return upsertChain
      return insertChain
    })

    // Create 600 rows to trigger 2 batches (batch size = 500)
    const headerLine = `Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types`
    const dataLines = Array.from({ length: 600 }, (_, i) =>
      `1,Card ${i},Normal,NM,2025-01-15,EN,1.00,,Set Name,set,0,id-${i},${i},Red,Creature`
    )
    const csv = [headerLine, ...dataLines].join('\n')

    const rows = parseCollectionCSV(csv)
    const result = await applyCollectionImport(rows)

    expect(result.totalInserted).toBe(600)
    expect(result.batches).toHaveLength(2)
    expect(result.batches[0].rowsProcessed).toBe(500)
    expect(result.batches[1].rowsProcessed).toBe(100)
  })

  it('records per-batch errors without aborting the import', async () => {
    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }

    let insertCallCount = 0
    const insertChainOk = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
    const insertChainFail = {
      insert: vi.fn().mockResolvedValue({ error: { message: 'Row too large' } }),
    }

    const upsertChain = {
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }

    let collectionCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'collection') {
        collectionCallCount++
        if (collectionCallCount === 1) return deleteChain
        // First insert batch fails, second succeeds
        insertCallCount++
        if (insertCallCount === 1) return insertChainFail
        return insertChainOk
      }
      if (table === 'sync_meta') return upsertChain
      return insertChainOk
    })

    // Create 600 rows for 2 batches — first batch fails, second succeeds
    const headerLine = `Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types`
    const dataLines = Array.from({ length: 600 }, (_, i) =>
      `1,Card ${i},Normal,NM,2025-01-15,EN,1.00,,Set Name,set,0,id-${i},${i},Red,Creature`
    )
    const csv = [headerLine, ...dataLines].join('\n')

    const rows = parseCollectionCSV(csv)
    const result = await applyCollectionImport(rows)

    // First batch failed, second succeeded
    expect(result.totalInserted).toBe(100) // only second batch counted
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('Batch 0')
    expect(result.batches[0].errors.length).toBeGreaterThan(0)
    expect(result.batches[1].rowsProcessed).toBe(100)
  })

  it('throws if initial delete fails', async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: { message: 'Permission denied' } }),
    })

    const rows = parseCollectionCSV(`Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types
1,Lightning Bolt,Normal,NM,2025-01-15,EN,,,Core Set 2021,m21,123,abc-def,152,Red,Instant`)

    await expect(applyCollectionImport(rows)).rejects.toThrow(
      'Failed to clear collection before import: Permission denied'
    )
  })
})
