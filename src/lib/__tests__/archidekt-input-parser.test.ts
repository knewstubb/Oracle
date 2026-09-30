/**
 * Focused tests for Archidekt collection URL/username parsing.
 * Tests the parseArchidektCollectionInput and resolveArchidektUserId functions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseArchidektCollectionInput,
  resolveArchidektUserId,
} from '../archidekt-client'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('parseArchidektCollectionInput', () => {
  it.each([
    // Full collection URLs
    ['https://archidekt.com/collection/v2/username/', { type: 'username', value: 'username' }],
    ['https://www.archidekt.com/collection/v2/username/', { type: 'username', value: 'username' }],
    ['http://archidekt.com/collection/v2/username/', { type: 'username', value: 'username' }],
    ['archidekt.com/collection/v2/username/', { type: 'username', value: 'username' }],
    ['archidekt.com/collection/v2/614000/', { type: 'userId', value: '614000' }],
    ['https://archidekt.com/collection/v2/614000/', { type: 'userId', value: '614000' }],

    // Collection page URLs
    ['https://archidekt.com/collection/username', { type: 'username', value: 'username' }],
    ['https://www.archidekt.com/collection/username', { type: 'username', value: 'username' }],
    ['archidekt.com/u/username', { type: 'username', value: 'username' }],
    ['https://archidekt.com/u/username/', { type: 'username', value: 'username' }],

    // Plain usernames
    ['username', { type: 'username', value: 'username' }],
    ['knewstubb@gmail.com', { type: 'username', value: 'knewstubb@gmail.com' }],
    ['someuser123', { type: 'username', value: 'someuser123' }],

    // Numeric user IDs
    ['614000', { type: 'userId', value: '614000' }],
    ['123456', { type: 'userId', value: '123456' }],

    // Empty/invalid
    ['', null],
    ['   ', null],
    ['not-a-valid-url', { type: 'username', value: 'not-a-valid-url' }],
  ])('parses "%s" → %s', (input, expected) => {
    const result = parseArchidektCollectionInput(input)
    expect(result).toEqual(expected)
  })

  it('handles URLs with query strings', () => {
    const result = parseArchidektCollectionInput('https://archidekt.com/collection/v2/username/?foo=bar')
    expect(result).toEqual({ type: 'username', value: 'username' })
  })

  it('handles URLs with extra slashes', () => {
    const result = parseArchidektCollectionInput('https://archidekt.com/collection/v2/username/extra/path')
    expect(result).toEqual({ type: 'username', value: 'username' })
  })

  it('trims whitespace', () => {
    const result = parseArchidektCollectionInput('  username  ')
    expect(result).toEqual({ type: 'username', value: 'username' })
  })
})

describe('resolveArchidektUserId', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('resolves a numeric user ID by validating user exists', async () => {
    // Mock response with a deck to validate user exists
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ owner: { id: 614000 } }],
      }),
    })

    const result = await resolveArchidektUserId({ type: 'userId', value: '614000' })
    expect(result).toBe(614000)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://archidekt.com/api/decks/v3/?ownerId=614000&pageSize=1'
    )
  })

  it('throws when numeric user ID is not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    // The actual implementation throws the generic error from fetchWithRetry
    await expect(
      resolveArchidektUserId({ type: 'userId', value: '999999' })
    ).rejects.toThrow('Collection fetch failed: 404')
  })

  it('resolves a username by fetching decks and extracting owner ID', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ owner: { id: 614000, username: 'testuser' } }],
      }),
    })

    const result = await resolveArchidektUserId({ type: 'username', value: 'testuser' })
    expect(result).toBe(614000)
  })

  it('throws when username has no public decks', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [],
      }),
    })

    await expect(
      resolveArchidektUserId({ type: 'username', value: 'nonexistent' })
    ).rejects.toThrow('No public decks found for user "nonexistent"')
  })

  it('throws on API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    // The actual implementation throws the generic error from fetchWithRetry
    await expect(
      resolveArchidektUserId({ type: 'username', value: 'testuser' })
    ).rejects.toThrow('Collection fetch failed: 500')
  })
})