/**
 * Focused tests for Archidekt collection URL parsing and validation.
 * Tests the parseArchidektCollectionInput and validateArchidektUserId functions.
 * Only numeric user IDs are supported - usernames cannot be resolved reliably.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseArchidektCollectionInput,
  validateArchidektUserId,
} from '../archidekt-client'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('parseArchidektCollectionInput', () => {
  it.each([
    // Full collection URLs with numeric ID
    ['https://archidekt.com/collection/v2/614000/', 614000],
    ['https://www.archidekt.com/collection/v2/614000/', 614000],
    ['http://archidekt.com/collection/v2/614000/', 614000],
    ['archidekt.com/collection/v2/614000/', 614000],

    // Alternative URL format with numeric ID
    ['https://archidekt.com/collection/614000/', 614000],
    ['https://www.archidekt.com/collection/614000/', 614000],
    ['archidekt.com/collection/614000', 614000],

    // Usernames - NOT supported (return null)
    ['https://archidekt.com/collection/v2/username/', null],
    ['https://www.archidekt.com/collection/v2/username/', null],
    ['archidekt.com/collection/v2/username/', null],
    ['archidekt.com/u/username', null],
    ['https://archidekt.com/u/username/', null],

    // Plain usernames - NOT supported
    ['username', null],
    ['knewstubb@gmail.com', null],
    ['someuser123', null],

    // Numeric user IDs (direct input)
    ['614000', 614000],
    ['123456', 123456],
    ['999999', 999999],

    // Empty/invalid
    ['', null],
    ['   ', null],
    ['not-a-valid-url', null],
  ])('parses "%s" → %s', (input, expected) => {
    const result = parseArchidektCollectionInput(input)
    expect(result).toEqual(expected)
  })

  it('handles URLs with query strings', () => {
    const result = parseArchidektCollectionInput('https://archidekt.com/collection/v2/614000/?foo=bar')
    expect(result).toEqual(614000)
  })

  it('handles URLs with extra slashes', () => {
    const result = parseArchidektCollectionInput('https://archidekt.com/collection/v2/614000/extra/path')
    expect(result).toEqual(614000)
  })

  it('trims whitespace', () => {
    const result = parseArchidektCollectionInput('  614000  ')
    expect(result).toEqual(614000)
  })
})

describe('validateArchidektUserId', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('validates a numeric user ID by checking collection endpoint', async () => {
    // Mock response from collection API
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        count: 100,
        results: [],
      }),
    })

    const result = await validateArchidektUserId(614000)
    expect(result).toBe(614000)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://archidekt.com/api/collection/614000/?pageSize=1'
    )
  })

  it('throws when user ID has no public collection (404)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    await expect(validateArchidektUserId(999999)).rejects.toThrow(
      'No public Archidekt collection found for user ID 999999. Make sure the collection is set to Public.'
    )
  })

  it('throws when user ID has no public collection (403)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
    })

    await expect(validateArchidektUserId(999999)).rejects.toThrow(
      'No public Archidekt collection found for user ID 999999. Make sure the collection is set to Public.'
    )
  })

  it('throws on API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    await expect(validateArchidektUserId(614000)).rejects.toThrow(
      'Failed to validate user: 500'
    )
  })

  it('succeeds for valid user with empty collection', async () => {
    // User exists but has no cards
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        count: 0,
        results: [],
      }),
    })

    const result = await validateArchidektUserId(614000)
    expect(result).toBe(614000)
  })
})