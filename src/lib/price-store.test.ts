import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Supabase Client
// ---------------------------------------------------------------------------

let mockResponse: { data: unknown; error: unknown }
let dbCallCount = 0

function createQueryMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => {
      dbCallCount++
      return Promise.resolve(mockResponse)
    },
  }
  return chain
}

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: () => createQueryMock(),
  }),
}))

import { getLastRefreshTimestamp, isPriceDataStale } from './price-store'

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000

describe('getLastRefreshTimestamp', () => {
  beforeEach(() => {
    mockResponse = { data: null, error: null }
    dbCallCount = 0
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the updated_at value on success with exactly one read', async () => {
    mockResponse = { data: { updated_at: '2026-09-01T00:00:00.000Z' }, error: null }
    await expect(getLastRefreshTimestamp()).resolves.toBe('2026-09-01T00:00:00.000Z')
    expect(dbCallCount).toBe(1)
  })

  it('returns null when no reference rows exist', async () => {
    mockResponse = { data: null, error: null }
    await expect(getLastRefreshTimestamp()).resolves.toBeNull()
  })

  it('returns null and warns once when the table/schema cache is missing (42P01)', async () => {
    mockResponse = { data: null, error: { message: 'schema cache missing', code: '42P01' } }
    await expect(getLastRefreshTimestamp()).resolves.toBeNull()
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('returns null and logs once for other metadata lookup failures', async () => {
    mockResponse = { data: null, error: { message: 'connection refused', code: '500' } }
    await expect(getLastRefreshTimestamp()).resolves.toBeNull()
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('normalises a malformed stored timestamp to null and logs a value-free diagnostic', async () => {
    mockResponse = { data: { updated_at: 'not-a-real-timestamp' }, error: null }
    await expect(getLastRefreshTimestamp()).resolves.toBeNull()
    expect(console.error).toHaveBeenCalledTimes(1)
    const loggedText = (console.error as ReturnType<typeof vi.fn>).mock.calls
      .map((args) => args.join(' '))
      .join(' ')
    expect(loggedText).not.toContain('not-a-real-timestamp')
  })
})

describe('isPriceDataStale', () => {
  const NOW = new Date('2026-09-29T00:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mockResponse = { data: null, error: null }
    dbCallCount = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('performs exactly one lookup when the argument is omitted', async () => {
    mockResponse = { data: { updated_at: NOW.toISOString() }, error: null }
    const result = await isPriceDataStale()
    expect(result).toBe(false)
    expect(dbCallCount).toBe(1)
  })

  it('performs zero lookups when an explicit timestamp is supplied', async () => {
    const result = await isPriceDataStale(NOW.toISOString())
    expect(result).toBe(false)
    expect(dbCallCount).toBe(0)
  })

  it('performs zero lookups and is stale when explicit null is supplied, with no diagnostic', async () => {
    const result = await isPriceDataStale(null)
    expect(result).toBe(true)
    expect(dbCallCount).toBe(0)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('explicit undefined behaves exactly like an omitted argument: one lookup', async () => {
    mockResponse = { data: { updated_at: NOW.toISOString() }, error: null }
    const result = await isPriceDataStale(undefined)
    expect(result).toBe(false)
    expect(dbCallCount).toBe(1)
  })

  it('an explicit empty string is malformed, not null: zero reads, stale=true, one value-free diagnostic', async () => {
    const result = await isPriceDataStale('')
    expect(result).toBe(true)
    expect(dbCallCount).toBe(0)
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('an explicit whitespace-only string is malformed: zero reads, stale=true, one value-free diagnostic', async () => {
    const result = await isPriceDataStale('   ')
    expect(result).toBe(true)
    expect(dbCallCount).toBe(0)
    expect(console.error).toHaveBeenCalledTimes(1)
    const loggedText = (console.error as ReturnType<typeof vi.fn>).mock.calls
      .map((args) => args.join(' '))
      .join(' ')
    expect(loggedText).not.toContain('   ')
  })

  it('valid timestamp under 48h old is not stale', async () => {
    const observed = new Date(NOW.getTime() - (STALE_THRESHOLD_MS - 1)).toISOString()
    await expect(isPriceDataStale(observed)).resolves.toBe(false)
    expect(dbCallCount).toBe(0)
  })

  it('exactly 48h old is not stale (strict greater-than threshold)', async () => {
    const observed = new Date(NOW.getTime() - STALE_THRESHOLD_MS).toISOString()
    await expect(isPriceDataStale(observed)).resolves.toBe(false)
    expect(dbCallCount).toBe(0)
  })

  it('48h plus 1ms old is stale', async () => {
    const observed = new Date(NOW.getTime() - STALE_THRESHOLD_MS - 1).toISOString()
    await expect(isPriceDataStale(observed)).resolves.toBe(true)
    expect(dbCallCount).toBe(0)
  })

  it('a valid future timestamp is not stale (clock-skew policy unchanged)', async () => {
    const observed = new Date(NOW.getTime() + STALE_THRESHOLD_MS).toISOString()
    await expect(isPriceDataStale(observed)).resolves.toBe(false)
    expect(dbCallCount).toBe(0)
  })

  it('a malformed explicit timestamp yields stale=true, never NaN-as-fresh, with a value-free log', async () => {
    const result = await isPriceDataStale('not-a-real-timestamp')
    expect(result).toBe(true)
    expect(dbCallCount).toBe(0)
    expect(console.error).toHaveBeenCalledTimes(1)
    const loggedText = (console.error as ReturnType<typeof vi.fn>).mock.calls
      .map((args) => args.join(' '))
      .join(' ')
    expect(loggedText).not.toContain('not-a-real-timestamp')
  })

  it('a metadata lookup failure (omitted argument) performs exactly one read and logs exactly once', async () => {
    mockResponse = { data: null, error: { message: 'connection refused', code: '500' } }
    const result = await isPriceDataStale()
    expect(result).toBe(true)
    expect(dbCallCount).toBe(1)
    expect(console.error).toHaveBeenCalledTimes(1)
  })
})
