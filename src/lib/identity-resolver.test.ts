import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ScryfallBulkIndex } from './scryfall-bulk-cache'
import {
  mapCondition,
  mapFinishToFoil,
  resolveIdentities,
  type ParsedCSVRow,
} from './identity-resolver'

// Mock the Supabase client module
vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTestIndex(records: Array<{
  scryfallId: string
  oracleId: string
  cardName: string
  set: string
  collectorNumber: string
}>): ScryfallBulkIndex {
  const byPrintingId = new Map<string, { scryfallId: string; oracleId: string; cardName: string; set: string; collectorNumber: string }>()
  const bySetCollector = new Map<string, string>()

  for (const rec of records) {
    byPrintingId.set(rec.scryfallId, rec)
    const key = `${rec.set}|${rec.collectorNumber}`
    if (!bySetCollector.has(key)) {
      bySetCollector.set(key, rec.scryfallId)
    }
  }

  return { byPrintingId, bySetCollector }
}

function makeRow(overrides: Partial<ParsedCSVRow> = {}): ParsedCSVRow {
  return {
    rowIndex: 1,
    quantity: 1,
    name: 'Lightning Bolt',
    finish: 'Normal',
    condition: 'NM',
    editionCode: 'lea',
    collectorNumber: '161',
    scryfallId: 'abc-123',
    scryfallOracleId: 'oracle-456',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// mapCondition
// ---------------------------------------------------------------------------

describe('mapCondition', () => {
  it('maps NM to near_mint', () => {
    expect(mapCondition('NM')).toEqual({ condition: 'near_mint', wasUnrecognized: false })
  })

  it('maps Near Mint to near_mint (case-insensitive)', () => {
    expect(mapCondition('near mint')).toEqual({ condition: 'near_mint', wasUnrecognized: false })
    expect(mapCondition('Near Mint')).toEqual({ condition: 'near_mint', wasUnrecognized: false })
    expect(mapCondition('NEAR MINT')).toEqual({ condition: 'near_mint', wasUnrecognized: false })
  })

  it('maps near_mint with underscores', () => {
    expect(mapCondition('near_mint')).toEqual({ condition: 'near_mint', wasUnrecognized: false })
  })

  it('maps LP to lightly_played', () => {
    expect(mapCondition('LP')).toEqual({ condition: 'lightly_played', wasUnrecognized: false })
  })

  it('maps Lightly Played to lightly_played', () => {
    expect(mapCondition('Lightly Played')).toEqual({ condition: 'lightly_played', wasUnrecognized: false })
  })

  it('maps MP to moderately_played', () => {
    expect(mapCondition('MP')).toEqual({ condition: 'moderately_played', wasUnrecognized: false })
  })

  it('maps HP to heavily_played', () => {
    expect(mapCondition('HP')).toEqual({ condition: 'heavily_played', wasUnrecognized: false })
  })

  it('maps D to damaged', () => {
    expect(mapCondition('D')).toEqual({ condition: 'damaged', wasUnrecognized: false })
  })

  it('maps Damaged to damaged', () => {
    expect(mapCondition('Damaged')).toEqual({ condition: 'damaged', wasUnrecognized: false })
  })

  it('returns near_mint with wasUnrecognized for empty string', () => {
    expect(mapCondition('')).toEqual({ condition: 'near_mint', wasUnrecognized: true })
  })

  it('returns near_mint with wasUnrecognized for whitespace-only', () => {
    expect(mapCondition('   ')).toEqual({ condition: 'near_mint', wasUnrecognized: true })
  })

  it('returns near_mint with wasUnrecognized for garbage input', () => {
    expect(mapCondition('Excellent')).toEqual({ condition: 'near_mint', wasUnrecognized: true })
    expect(mapCondition('xyz')).toEqual({ condition: 'near_mint', wasUnrecognized: true })
  })

  it('handles leading/trailing whitespace', () => {
    expect(mapCondition('  NM  ')).toEqual({ condition: 'near_mint', wasUnrecognized: false })
    expect(mapCondition(' LP ')).toEqual({ condition: 'lightly_played', wasUnrecognized: false })
  })
})

// ---------------------------------------------------------------------------
// mapFinishToFoil
// ---------------------------------------------------------------------------

describe('mapFinishToFoil', () => {
  it('returns false for "Normal"', () => {
    expect(mapFinishToFoil('Normal')).toBe(false)
  })

  it('returns true for "Foil"', () => {
    expect(mapFinishToFoil('Foil')).toBe(true)
  })

  it('returns true for "Etched"', () => {
    expect(mapFinishToFoil('Etched')).toBe(true)
  })

  it('returns true for "Glossy"', () => {
    expect(mapFinishToFoil('Glossy')).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(mapFinishToFoil('')).toBe(false)
  })

  it('returns false for whitespace-only string', () => {
    expect(mapFinishToFoil('   ')).toBe(false)
  })

  it('is case-sensitive — "normal" (lowercase) returns true', () => {
    expect(mapFinishToFoil('normal')).toBe(true)
  })

  it('is case-sensitive — "NORMAL" (uppercase) returns true', () => {
    expect(mapFinishToFoil('NORMAL')).toBe(true)
  })

  it('handles "Normal" with whitespace (trimmed)', () => {
    expect(mapFinishToFoil(' Normal ')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveIdentities
// ---------------------------------------------------------------------------

describe('resolveIdentities', () => {
  const testRecords = [
    { scryfallId: 'abc-123', oracleId: 'oracle-456', cardName: 'Lightning Bolt', set: 'lea', collectorNumber: '161' },
    { scryfallId: 'def-789', oracleId: 'oracle-789', cardName: 'Sol Ring', set: 'cmd', collectorNumber: '251' },
    { scryfallId: 'ghi-101', oracleId: 'oracle-101', cardName: 'Forest', set: 'lea', collectorNumber: '294' },
  ]
  const index = buildTestIndex(testRecords)

  describe('direct resolution via Scryfall ID', () => {
    it('resolves when scryfallId is present and CSV oracle ID is available', async () => {
      const rows = [makeRow({ scryfallId: 'abc-123' })]
      const result = await resolveIdentities(rows, index)

      expect(result.resolved).toHaveLength(1)
      expect(result.unmatched).toHaveLength(0)
      expect(result.resolved[0].scryfallPrintingId).toBe('abc-123')
    })

    it('uses CSV oracle ID when available', async () => {
      const rows = [makeRow({ scryfallId: 'abc-123', scryfallOracleId: 'custom-oracle' })]
      const result = await resolveIdentities(rows, index)

      expect(result.resolved[0].oracleId).toBe('custom-oracle')
    })

    it('falls back to index oracle ID when CSV oracle ID is empty', async () => {
      const rows = [makeRow({ scryfallId: 'abc-123', scryfallOracleId: '' })]
      const result = await resolveIdentities(rows, index)

      expect(result.resolved[0].oracleId).toBe('oracle-456')
    })
  })

  describe('fallback resolution via set+collector', () => {
    it('resolves via edition code + collector number when scryfallId is empty', async () => {
      const rows = [makeRow({ scryfallId: '', scryfallOracleId: 'oracle-789', editionCode: 'cmd', collectorNumber: '251' })]
      const result = await resolveIdentities(rows, index)

      expect(result.resolved).toHaveLength(1)
      expect(result.resolved[0].scryfallPrintingId).toBe('def-789')
    })

    it('resolves via fallback when scryfallId does not exist but set+collector matches', async () => {
      const rows = [makeRow({
        scryfallId: '',
        scryfallOracleId: 'oracle-789',
        editionCode: 'cmd',
        collectorNumber: '251',
      })]
      const result = await resolveIdentities(rows, index)

      expect(result.resolved).toHaveLength(1)
      expect(result.resolved[0].scryfallPrintingId).toBe('def-789')
    })

    it('handles case-insensitive edition code', async () => {
      const rows = [makeRow({ scryfallId: '', scryfallOracleId: 'oracle-789', editionCode: 'CMD', collectorNumber: '251' })]
      const result = await resolveIdentities(rows, index)

      expect(result.resolved).toHaveLength(1)
      expect(result.resolved[0].scryfallPrintingId).toBe('def-789')
    })
  })

  describe('unmatched rows', () => {
    it('marks invalid quantity (0) as unmatched', async () => {
      const rows = [makeRow({ quantity: 0 })]
      const result = await resolveIdentities(rows, index)

      expect(result.unmatched).toHaveLength(1)
      expect(result.unmatched[0].reason).toBe('invalid_quantity')
    })

    it('marks negative quantity as unmatched', async () => {
      const rows = [makeRow({ quantity: -1 })]
      const result = await resolveIdentities(rows, index)

      expect(result.unmatched).toHaveLength(1)
      expect(result.unmatched[0].reason).toBe('invalid_quantity')
    })

    it('marks non-integer quantity as unmatched', async () => {
      const rows = [makeRow({ quantity: 1.5 })]
      const result = await resolveIdentities(rows, index)

      expect(result.unmatched).toHaveLength(1)
      expect(result.unmatched[0].reason).toBe('invalid_quantity')
    })

    it('marks row with empty scryfallId and missing fallback fields as missing_fallback_fields', async () => {
      const rows = [makeRow({ scryfallId: '', editionCode: '', collectorNumber: '' })]
      const result = await resolveIdentities(rows, index)

      expect(result.unmatched).toHaveLength(1)
      expect(result.unmatched[0].reason).toBe('missing_fallback_fields')
    })

    it('marks row with empty scryfallId and partial fallback fields as missing_fallback_fields', async () => {
      const rows = [makeRow({ scryfallId: '', editionCode: 'lea', collectorNumber: '' })]
      const result = await resolveIdentities(rows, index)

      expect(result.unmatched).toHaveLength(1)
      expect(result.unmatched[0].reason).toBe('missing_fallback_fields')
    })

    it('marks row with empty scryfallId and non-matching fallback as no_bulk_data_match', async () => {
      const rows = [makeRow({ scryfallId: '', editionCode: 'xyz', collectorNumber: '999' })]
      const result = await resolveIdentities(rows, index)

      expect(result.unmatched).toHaveLength(1)
      expect(result.unmatched[0].reason).toBe('no_bulk_data_match')
    })

    it('marks row as oracle_id_resolution_failed when no oracle_id available', async () => {
      // Create an index with a record that has empty oracle_id
      const noOracleIndex = buildTestIndex([
        { scryfallId: 'no-oracle', oracleId: '', cardName: 'Mystery Card', set: 'mys', collectorNumber: '1' },
      ])
      const rows = [makeRow({ scryfallId: 'no-oracle', scryfallOracleId: '' })]
      const result = await resolveIdentities(rows, noOracleIndex)

      expect(result.unmatched).toHaveLength(1)
      expect(result.unmatched[0].reason).toBe('oracle_id_resolution_failed')
    })

    it('preserves original row data in unmatched details', async () => {
      const rows = [makeRow({
        rowIndex: 42,
        name: 'Mystery Card',
        editionCode: 'xyz',
        collectorNumber: '999',
        quantity: 3,
        scryfallId: '',
      })]
      const result = await resolveIdentities(rows, index)

      expect(result.unmatched[0]).toEqual({
        rowIndex: 42,
        cardName: 'Mystery Card',
        editionCode: 'xyz',
        collectorNumber: '999',
        quantity: 3,
        reason: 'no_bulk_data_match',
      })
    })
  })

  describe('finish and condition mapping integration', () => {
    it('maps "Foil" finish to isFoil = true', async () => {
      const rows = [makeRow({ finish: 'Foil' })]
      const result = await resolveIdentities(rows, index)

      expect(result.resolved[0].isFoil).toBe(true)
    })

    it('maps "Normal" finish to isFoil = false', async () => {
      const rows = [makeRow({ finish: 'Normal' })]
      const result = await resolveIdentities(rows, index)

      expect(result.resolved[0].isFoil).toBe(false)
    })

    it('maps LP condition to lightly_played', async () => {
      const rows = [makeRow({ condition: 'LP' })]
      const result = await resolveIdentities(rows, index)

      expect(result.resolved[0].condition).toBe('lightly_played')
    })

    it('maps unrecognized condition to near_mint', async () => {
      const rows = [makeRow({ condition: 'Excellent' })]
      const result = await resolveIdentities(rows, index)

      expect(result.resolved[0].condition).toBe('near_mint')
    })
  })

  describe('batch processing', () => {
    it('processes multiple rows, sorting into resolved and unmatched', async () => {
      const rows = [
        makeRow({ rowIndex: 1, scryfallId: 'abc-123', quantity: 2 }),
        makeRow({ rowIndex: 2, scryfallId: '', editionCode: 'xyz', collectorNumber: '999' }),
        makeRow({ rowIndex: 3, scryfallId: '', scryfallOracleId: 'oracle-789', editionCode: 'cmd', collectorNumber: '251' }),
        makeRow({ rowIndex: 4, quantity: 0 }),
      ]
      const result = await resolveIdentities(rows, index)

      expect(result.resolved).toHaveLength(2)
      expect(result.unmatched).toHaveLength(2)

      expect(result.resolved[0].rowIndex).toBe(1)
      expect(result.resolved[0].quantity).toBe(2)
      expect(result.resolved[1].rowIndex).toBe(3)

      expect(result.unmatched[0].rowIndex).toBe(2)
      expect(result.unmatched[0].reason).toBe('no_bulk_data_match')
      expect(result.unmatched[1].rowIndex).toBe(4)
      expect(result.unmatched[1].reason).toBe('invalid_quantity')
    })

    it('handles empty input', async () => {
      const result = await resolveIdentities([], index)
      expect(result.resolved).toHaveLength(0)
      expect(result.unmatched).toHaveLength(0)
    })
  })
})
