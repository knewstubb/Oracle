import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  upsertHealthResult,
  getHealthResult,
  getHealthOverrides,
  saveHealthOverrides,
  clearHealthOverrides,
} from './health-store'
import type { HealthResult, OverrideMap } from './health-store'

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

// Helper to build chainable query mock
function chainable(result: { data?: unknown; error?: unknown; count?: number }) {
  const chain: Record<string, unknown> = {}
  const handler = () => chain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.upsert = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.neq = vi.fn().mockReturnValue(chain)
  chain.is = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.not = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  // For operations that resolve directly (upsert, update, delete without .single())
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  // Make the chain itself a thenable for await
  Object.defineProperty(chain, 'then', {
    value: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      return Promise.resolve(result).then(resolve, reject)
    },
    writable: true,
    configurable: true,
  })
  return chain
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('health-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('upsertHealthResult', () => {
    const sampleResult: HealthResult = {
      deckId: 1,
      categories: [
        { category: 'Ramp', status: 'green', actual: 11, min: 10, max: 12 },
        { category: 'Draw', status: 'amber', actual: 9, min: 10, max: 12 },
        { category: 'Removal', status: 'red', actual: 3, min: 6, max: 10 },
      ],
      overallStatus: 'red',
      computedAt: '2025-01-15T10:30:00.000Z',
    }

    it('calls supabase upsert with correct data', async () => {
      const chain = chainable({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      await upsertHealthResult(sampleResult)

      expect(mockFrom).toHaveBeenCalledWith('deck_health')
      expect(chain.upsert).toHaveBeenCalledWith(
        {
          deck_id: 1,
          result_json: JSON.stringify(sampleResult.categories),
          overall_status: 'red',
          computed_at: '2025-01-15T10:30:00.000Z',
          user_id: '00000000-0000-0000-0000-000000000000',
        },
        { onConflict: 'deck_id' }
      )
    })

    it('throws on supabase error', async () => {
      const chain = chainable({ data: null, error: { message: 'insert failed' } })
      mockFrom.mockReturnValue(chain)

      await expect(upsertHealthResult(sampleResult)).rejects.toThrow('Failed to upsert health result')
    })
  })

  describe('getHealthResult', () => {
    it('returns parsed health result when data exists', async () => {
      const categories = [
        { category: 'Ramp', status: 'green', actual: 11, min: 10, max: 12 },
      ]
      const chain = chainable({
        data: {
          deck_id: 1,
          result_json: JSON.stringify(categories),
          overall_status: 'green',
          computed_at: '2025-01-15T10:30:00.000Z',
        },
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const result = await getHealthResult(1)

      expect(result).toEqual({
        deckId: 1,
        categories,
        overallStatus: 'green',
        computedAt: '2025-01-15T10:30:00.000Z',
      })
    })

    it('returns null when no data exists', async () => {
      const chain = chainable({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      const result = await getHealthResult(999)
      expect(result).toBeNull()
    })

    it('throws on supabase error', async () => {
      const chain = chainable({ data: null, error: { message: 'query failed' } })
      mockFrom.mockReturnValue(chain)

      await expect(getHealthResult(1)).rejects.toThrow('Failed to get health result')
    })
  })

  describe('getHealthOverrides', () => {
    it('returns null when no strategy row exists', async () => {
      const chain = chainable({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      const result = await getHealthOverrides(2)
      expect(result).toBeNull()
    })

    it('returns null when health_overrides is null', async () => {
      const chain = chainable({ data: { health_overrides: null }, error: null })
      mockFrom.mockReturnValue(chain)

      const result = await getHealthOverrides(1)
      expect(result).toBeNull()
    })

    it('parses and returns stored overrides', async () => {
      const overrides: OverrideMap = {
        thresholds: { Ramp: { min: 8, max: 10 } },
        amber_margin: 2,
      }
      const chain = chainable({ data: { health_overrides: JSON.stringify(overrides) }, error: null })
      mockFrom.mockReturnValue(chain)

      const result = await getHealthOverrides(1)
      expect(result).toEqual(overrides)
    })
  })

  describe('saveHealthOverrides', () => {
    it('calls supabase update with serialized overrides', async () => {
      const overrides: OverrideMap = {
        thresholds: { Draw: { min: 12, max: 14 } },
        amber_margin: 3,
      }
      const chain = chainable({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      await saveHealthOverrides(1, overrides)

      expect(mockFrom).toHaveBeenCalledWith('deck_strategy')
      expect(chain.update).toHaveBeenCalledWith({ health_overrides: JSON.stringify(overrides) })
      expect(chain.eq).toHaveBeenCalledWith('deck_id', 1)
    })

    it('throws on supabase error', async () => {
      const chain = chainable({ data: null, error: { message: 'update failed' } })
      mockFrom.mockReturnValue(chain)

      await expect(saveHealthOverrides(1, {})).rejects.toThrow('Failed to save health overrides')
    })
  })

  describe('clearHealthOverrides', () => {
    it('calls supabase update with null value', async () => {
      const chain = chainable({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      await clearHealthOverrides(1)

      expect(mockFrom).toHaveBeenCalledWith('deck_strategy')
      expect(chain.update).toHaveBeenCalledWith({ health_overrides: null })
      expect(chain.eq).toHaveBeenCalledWith('deck_id', 1)
    })

    it('throws on supabase error', async () => {
      const chain = chainable({ data: null, error: { message: 'clear failed' } })
      mockFrom.mockReturnValue(chain)

      await expect(clearHealthOverrides(1)).rejects.toThrow('Failed to clear health overrides')
    })
  })
})
