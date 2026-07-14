// ---------------------------------------------------------------------------
// URL Parser — Unit Tests
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest'
import { parseDeckUrl, isParseError } from '@/lib/url-parser'

describe('parseDeckUrl', () => {
  describe('valid Archidekt URLs', () => {
    it('parses full URL with https', () => {
      const result = parseDeckUrl('https://archidekt.com/decks/12345')
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.platform).toBe('archidekt')
        expect(result.deckId).toBe('12345')
      }
    })

    it('parses URL without protocol', () => {
      const result = parseDeckUrl('archidekt.com/decks/99999')
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.platform).toBe('archidekt')
        expect(result.deckId).toBe('99999')
      }
    })

    it('parses URL with www subdomain', () => {
      const result = parseDeckUrl('https://www.archidekt.com/decks/23289174')
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.platform).toBe('archidekt')
        expect(result.deckId).toBe('23289174')
      }
    })

    it('parses URL with www but no protocol', () => {
      const result = parseDeckUrl('www.archidekt.com/decks/15628123')
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.platform).toBe('archidekt')
        expect(result.deckId).toBe('15628123')
      }
    })

    it('parses URL with trailing slug', () => {
      const result = parseDeckUrl('https://archidekt.com/decks/12345/my-cool-deck')
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.platform).toBe('archidekt')
        expect(result.deckId).toBe('12345')
      }
    })

    it('parses URL with trailing slug and query params', () => {
      const result = parseDeckUrl('https://archidekt.com/decks/12345/some-slug?tab=1&view=grid')
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.platform).toBe('archidekt')
        expect(result.deckId).toBe('12345')
      }
    })

    it('parses URL with http (not https)', () => {
      const result = parseDeckUrl('http://archidekt.com/decks/54321')
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.platform).toBe('archidekt')
        expect(result.deckId).toBe('54321')
      }
    })

    it('handles whitespace around URL', () => {
      const result = parseDeckUrl('  https://archidekt.com/decks/12345  ')
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.platform).toBe('archidekt')
        expect(result.deckId).toBe('12345')
      }
    })
  })

  describe('valid Moxfield URLs', () => {
    it('parses full URL with https', () => {
      const result = parseDeckUrl('https://moxfield.com/decks/aBcD1234')
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.platform).toBe('moxfield')
        expect(result.deckId).toBe('aBcD1234')
      }
    })

    it('parses URL without protocol', () => {
      const result = parseDeckUrl('moxfield.com/decks/xYz789Ab')
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.platform).toBe('moxfield')
        expect(result.deckId).toBe('xYz789Ab')
      }
    })

    it('parses URL with www subdomain', () => {
      const result = parseDeckUrl('https://www.moxfield.com/decks/AbCdEfGh')
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.platform).toBe('moxfield')
        expect(result.deckId).toBe('AbCdEfGh')
      }
    })

    it('parses URL with www but no protocol', () => {
      const result = parseDeckUrl('www.moxfield.com/decks/test1234')
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.platform).toBe('moxfield')
        expect(result.deckId).toBe('test1234')
      }
    })

    it('parses URL with hyphens and underscores in ID', () => {
      const result = parseDeckUrl('https://moxfield.com/decks/my_deck-id')
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.platform).toBe('moxfield')
        expect(result.deckId).toBe('my_deck-id')
      }
    })

    it('parses URL with query params', () => {
      const result = parseDeckUrl('https://moxfield.com/decks/aBcD1234?format=commander')
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.platform).toBe('moxfield')
        expect(result.deckId).toBe('aBcD1234')
      }
    })
  })

  describe('invalid URLs', () => {
    it('returns error for empty string', () => {
      const result = parseDeckUrl('')
      expect(isParseError(result)).toBe(true)
      if (isParseError(result)) {
        expect(result.error).toBe('URL is required')
        expect(result.supportedFormats).toHaveLength(4)
      }
    })

    it('returns error for whitespace-only string', () => {
      const result = parseDeckUrl('   ')
      expect(isParseError(result)).toBe(true)
      if (isParseError(result)) {
        expect(result.error).toBe('URL is required')
      }
    })

    it('returns error for unsupported domain', () => {
      const result = parseDeckUrl('https://tappedout.net/decks/12345')
      expect(isParseError(result)).toBe(true)
      if (isParseError(result)) {
        expect(result.error).toBe('URL does not match any supported deck platform')
        expect(result.supportedFormats.length).toBeGreaterThan(0)
      }
    })

    it('returns error for archidekt URL with non-numeric ID', () => {
      const result = parseDeckUrl('https://archidekt.com/decks/abc-not-numeric')
      expect(isParseError(result)).toBe(true)
    })

    it('returns error for archidekt URL missing deck ID', () => {
      const result = parseDeckUrl('https://archidekt.com/decks/')
      expect(isParseError(result)).toBe(true)
    })

    it('returns error for moxfield URL missing deck ID', () => {
      const result = parseDeckUrl('https://moxfield.com/decks/')
      expect(isParseError(result)).toBe(true)
    })

    it('returns error for archidekt collection URL (not a deck)', () => {
      const result = parseDeckUrl('https://archidekt.com/collection/614000')
      expect(isParseError(result)).toBe(true)
    })

    it('returns error for plain text that is not a URL', () => {
      const result = parseDeckUrl('this is not a url')
      expect(isParseError(result)).toBe(true)
    })

    it('returns error for just a number', () => {
      const result = parseDeckUrl('12345')
      expect(isParseError(result)).toBe(true)
    })

    it('returns error for partial URL without /decks/ path', () => {
      const result = parseDeckUrl('archidekt.com/12345')
      expect(isParseError(result)).toBe(true)
    })

    it('returns error for moxfield user page (not a deck)', () => {
      const result = parseDeckUrl('https://moxfield.com/users/Bullet_the_Grey')
      expect(isParseError(result)).toBe(true)
    })
  })
})

describe('isParseError', () => {
  it('returns true for ParseError objects', () => {
    expect(isParseError({ error: 'test', supportedFormats: [] })).toBe(true)
  })

  it('returns false for ParsedDeckUrl objects', () => {
    expect(isParseError({ platform: 'archidekt', deckId: '123' })).toBe(false)
  })
})
