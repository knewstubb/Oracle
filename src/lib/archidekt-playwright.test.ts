import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  addProxyTag,
  removeProxyTag,
  addProxyCategory,
  removeProxyCategory,
  markAsProxy,
  unmarkAsProxy,
  buildImportText,
  PROXY_TAG,
  PROXY_CATEGORY,
  parseImportLine,
  isRetryableError,
  isAuthError,
} from './archidekt-playwright'

// Sample Import Cards text blocks for testing
const sampleText = `1x Sol Ring (c21) [Ramp]
1x Ashnod's Altar (scd) [Ramp,Sac Outlet]
1x Blood Crypt (rnc)
1x Muldrotha, the Gravetide (dom) [Commander]
1x Deadly Dispute (tdc) [Draw,Sac Outlet,Ramp]  ^Proxy,#e158ff^`

const textWithExistingTags = `1x Sol Ring (c21) [Ramp]  ^Have,#37d67a^
1x Ashnod's Altar (scd) [Ramp,Sac Outlet]  ^Don't Have,#f47373^
1x Blood Crypt (rnc)  ^Proxy,#e158ff^`

describe('addProxyTag', () => {
  it('adds proxy tag to a card that does not have it', () => {
    const result = addProxyTag(sampleText, 'Sol Ring')
    expect(result).toContain(`1x Sol Ring (c21) [Ramp]  ${PROXY_TAG}`)
  })

  it('does not duplicate proxy tag if card already has it', () => {
    const result = addProxyTag(sampleText, 'Deadly Dispute')
    // Count occurrences of PROXY_TAG on the Deadly Dispute line
    const line = result.split('\n').find(l => l.includes('Deadly Dispute'))
    const count = (line!.match(/\^Proxy,#e158ff\^/g) || []).length
    expect(count).toBe(1)
  })

  it('returns text unchanged if card is not found', () => {
    const result = addProxyTag(sampleText, 'Nonexistent Card')
    expect(result).toBe(sampleText)
  })

  it('appends proxy tag after existing tags (does not replace)', () => {
    const result = addProxyTag(textWithExistingTags, 'Sol Ring')
    const line = result.split('\n').find(l => l.includes('Sol Ring'))
    // Should have both the Have tag and the Proxy tag
    expect(line).toContain('^Have,#37d67a^')
    expect(line).toContain(PROXY_TAG)
  })

  it('works with cards that have categories', () => {
    const result = addProxyTag(sampleText, "Ashnod's Altar")
    const line = result.split('\n').find(l => l.includes("Ashnod's Altar"))
    expect(line).toContain('[Ramp,Sac Outlet]')
    expect(line).toContain(PROXY_TAG)
  })

  it('works with cards that have commas in their name', () => {
    const result = addProxyTag(sampleText, 'Muldrotha, the Gravetide')
    const line = result.split('\n').find(l => l.includes('Muldrotha'))
    expect(line).toContain(PROXY_TAG)
    expect(line).toContain('[Commander]')
  })

  it('works with cards that have no set or categories', () => {
    const bareText = '1x Sol Ring\n1x Lightning Bolt'
    const result = addProxyTag(bareText, 'Sol Ring')
    expect(result).toContain(`1x Sol Ring  ${PROXY_TAG}`)
  })

  it('only modifies the first matching card line', () => {
    // Two lines with the same card name (different sets)
    const dupeText = `1x Sol Ring (c21) [Ramp]
1x Sol Ring (cmr) [Ramp]`
    const result = addProxyTag(dupeText, 'Sol Ring')
    const lines = result.split('\n').filter(l => l.includes('Sol Ring'))
    // First line gets the tag
    expect(lines[0]).toContain(PROXY_TAG)
    // Second line is unchanged
    expect(lines[1]).not.toContain(PROXY_TAG)
  })
})

describe('removeProxyTag', () => {
  it('removes proxy tag from a card that has it', () => {
    const result = removeProxyTag(sampleText, 'Deadly Dispute')
    const line = result.split('\n').find(l => l.includes('Deadly Dispute'))
    expect(line).not.toContain(PROXY_TAG)
    // Should still have the categories
    expect(line).toContain('[Draw,Sac Outlet,Ramp]')
  })

  it('returns text unchanged if card does not have proxy tag', () => {
    const result = removeProxyTag(sampleText, 'Sol Ring')
    expect(result).toBe(sampleText)
  })

  it('returns text unchanged if card is not found', () => {
    const result = removeProxyTag(sampleText, 'Nonexistent Card')
    expect(result).toBe(sampleText)
  })

  it('preserves other tags when removing proxy tag', () => {
    // Card with both Have and Proxy tags
    const multiTagText = `1x Sol Ring (c21) [Ramp]  ^Have,#37d67a^  ^Proxy,#e158ff^`
    const result = removeProxyTag(multiTagText, 'Sol Ring')
    const line = result.split('\n').find(l => l.includes('Sol Ring'))
    expect(line).toContain('^Have,#37d67a^')
    expect(line).not.toContain(PROXY_TAG)
  })

  it('works with cards that have commas in their name', () => {
    const taggedText = `1x Muldrotha, the Gravetide (dom) [Commander]  ^Proxy,#e158ff^`
    const result = removeProxyTag(taggedText, 'Muldrotha, the Gravetide')
    expect(result).not.toContain(PROXY_TAG)
    expect(result).toContain('Muldrotha, the Gravetide (dom) [Commander]')
  })

  it('only modifies the first matching card line', () => {
    const dupeText = `1x Sol Ring (c21) [Ramp]  ^Proxy,#e158ff^
1x Sol Ring (cmr) [Ramp]  ^Proxy,#e158ff^`
    const result = removeProxyTag(dupeText, 'Sol Ring')
    const lines = result.split('\n').filter(l => l.includes('Sol Ring'))
    // First line has tag removed
    expect(lines[0]).not.toContain(PROXY_TAG)
    // Second line still has it
    expect(lines[1]).toContain(PROXY_TAG)
  })
})

describe('PROXY_TAG constant', () => {
  it('matches the Archidekt proxy tag format', () => {
    expect(PROXY_TAG).toBe('^Proxy,#e158ff^')
  })
})

describe('buildImportText', () => {
  it('places commander first with [Commander] category', () => {
    const result = buildImportText('Muldrotha, the Gravetide', ['Sol Ring', 'Command Tower'])
    const lines = result.split('\n')
    expect(lines[0]).toBe('1x Muldrotha, the Gravetide [Commander]')
  })

  it('lists all cards with 1x prefix', () => {
    const cards = ['Sol Ring', 'Command Tower', 'Sakura-Tribe Elder']
    const result = buildImportText('Muldrotha, the Gravetide', cards)
    const lines = result.split('\n')
    expect(lines).toHaveLength(4) // commander + 3 cards
    expect(lines[1]).toBe('1x Sol Ring')
    expect(lines[2]).toBe('1x Command Tower')
    expect(lines[3]).toBe('1x Sakura-Tribe Elder')
  })

  it('handles empty card list (commander only)', () => {
    const result = buildImportText('Muldrotha, the Gravetide', [])
    const lines = result.split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('1x Muldrotha, the Gravetide [Commander]')
  })
})

// ---------------------------------------------------------------------------
// parseImportLine tests (sub-task 5: readDeckViaPlaywright)
// ---------------------------------------------------------------------------

describe('parseImportLine', () => {
  it('parses a full line with set, categories, and tags', () => {
    const result = parseImportLine('1x Sol Ring (cmm) [Ramp,Mana Rocks] ^Proxy,#e158ff^')
    expect(result).toEqual({
      cardName: 'Sol Ring',
      quantity: 1,
      categories: ['Ramp', 'Mana Rocks'],
      tags: ['Proxy,#e158ff'],
      setCode: 'cmm',
    })
  })

  it('parses a line with set and categories but no tags', () => {
    const result = parseImportLine('2x Lightning Bolt (m21) [Removal]')
    expect(result).toEqual({
      cardName: 'Lightning Bolt',
      quantity: 2,
      categories: ['Removal'],
      tags: [],
      setCode: 'm21',
    })
  })

  it('parses a bare card line with no set, categories, or tags', () => {
    const result = parseImportLine('1x Forest')
    expect(result).toEqual({
      cardName: 'Forest',
      quantity: 1,
      categories: [],
      tags: [],
    })
  })

  it('parses a card with set code only', () => {
    const result = parseImportLine('1x Blood Crypt (rnc)')
    expect(result).toEqual({
      cardName: 'Blood Crypt',
      quantity: 1,
      categories: [],
      tags: [],
      setCode: 'rnc',
    })
  })

  it('parses a card with multiple tags', () => {
    const result = parseImportLine('1x Sol Ring (cmm) [Ramp] ^Have,#37d67a^ ^Proxy,#e158ff^')
    expect(result).toEqual({
      cardName: 'Sol Ring',
      quantity: 1,
      categories: ['Ramp'],
      tags: ['Have,#37d67a', 'Proxy,#e158ff'],
      setCode: 'cmm',
    })
  })

  it('parses cards with commas in the name', () => {
    const result = parseImportLine('1x Muldrotha, the Gravetide (dom) [Commander]')
    expect(result).toEqual({
      cardName: 'Muldrotha, the Gravetide',
      quantity: 1,
      categories: ['Commander'],
      tags: [],
      setCode: 'dom',
    })
  })

  it('returns null for empty lines', () => {
    expect(parseImportLine('')).toBeNull()
    expect(parseImportLine('   ')).toBeNull()
  })

  it('returns null for lines that do not match format', () => {
    expect(parseImportLine('# Comment')).toBeNull()
    expect(parseImportLine('Some random text')).toBeNull()
  })

  it('handles quantity > 1 correctly', () => {
    const result = parseImportLine('4x Lightning Bolt (m21) [Removal]')
    expect(result).toEqual({
      cardName: 'Lightning Bolt',
      quantity: 4,
      categories: ['Removal'],
      tags: [],
      setCode: 'm21',
    })
  })
})

// ---------------------------------------------------------------------------
// Error classification tests (sub-tasks 3 & 4: retry and auth)
// ---------------------------------------------------------------------------

describe('isRetryableError', () => {
  it('identifies timeout errors as retryable', () => {
    expect(isRetryableError('TimeoutError: waiting for selector')).toBe(true)
    expect(isRetryableError('timeout exceeded')).toBe(true)
    expect(isRetryableError('Navigation timeout of 30000ms exceeded')).toBe(true)
  })

  it('identifies network errors as retryable', () => {
    expect(isRetryableError('net::ERR_CONNECTION_REFUSED')).toBe(true)
    expect(isRetryableError('ETIMEDOUT')).toBe(true)
    expect(isRetryableError('ECONNRESET')).toBe(true)
  })

  it('does not mark generic errors as retryable', () => {
    expect(isRetryableError('Element not found')).toBe(false)
    expect(isRetryableError('Archidekt save failed: Unknown error')).toBe(false)
  })
})

describe('isAuthError', () => {
  it('identifies session expired errors', () => {
    expect(isAuthError('Archidekt session expired. Please log in manually.')).toBe(true)
  })

  it('identifies login redirect errors', () => {
    expect(isAuthError('Redirected to /login page')).toBe(true)
    expect(isAuthError('Page navigated to signin')).toBe(true)
  })

  it('identifies HTTP auth status codes', () => {
    expect(isAuthError('Request failed with status 401')).toBe(true)
    expect(isAuthError('Response 403 forbidden')).toBe(true)
  })

  it('does not mark generic errors as auth errors', () => {
    expect(isAuthError('TimeoutError: navigation')).toBe(false)
    expect(isAuthError('Element not found')).toBe(false)
    expect(isAuthError('net::ERR_CONNECTION_REFUSED')).toBe(false)
  })
})


// ---------------------------------------------------------------------------
// Proxy category text manipulation tests (Task 4)
// ---------------------------------------------------------------------------

describe('PROXY_CATEGORY constant', () => {
  it('is the string "Proxy"', () => {
    expect(PROXY_CATEGORY).toBe('Proxy')
  })
})

describe('addProxyCategory', () => {
  it('adds [Proxy] to a card with no existing categories', () => {
    const text = '1x Sol Ring (c21)'
    const result = addProxyCategory(text, 'Sol Ring')
    expect(result).toBe('1x Sol Ring (c21) [Proxy]')
  })

  it('appends Proxy to existing categories', () => {
    const text = '1x Sol Ring (c21) [Ramp]'
    const result = addProxyCategory(text, 'Sol Ring')
    expect(result).toBe('1x Sol Ring (c21) [Ramp,Proxy]')
  })

  it('appends Proxy to multiple existing categories', () => {
    const text = "1x Ashnod's Altar (scd) [Ramp,Sac Outlet]"
    const result = addProxyCategory(text, "Ashnod's Altar")
    expect(result).toBe("1x Ashnod's Altar (scd) [Ramp,Sac Outlet,Proxy]")
  })

  it('is a no-op if card already has Proxy category', () => {
    const text = '1x Sol Ring (c21) [Ramp,Proxy]'
    const result = addProxyCategory(text, 'Sol Ring')
    expect(result).toBe(text)
  })

  it('is a no-op if card already has Proxy as only category', () => {
    const text = '1x Sol Ring (c21) [Proxy]'
    const result = addProxyCategory(text, 'Sol Ring')
    expect(result).toBe(text)
  })

  it('returns text unchanged if card not found', () => {
    const text = '1x Sol Ring (c21) [Ramp]'
    const result = addProxyCategory(text, 'Nonexistent Card')
    expect(result).toBe(text)
  })

  it('works with cards that have no set code', () => {
    const text = '1x Sol Ring'
    const result = addProxyCategory(text, 'Sol Ring')
    expect(result).toBe('1x Sol Ring [Proxy]')
  })

  it('works with cards that have no set code but have tags', () => {
    const text = '1x Sol Ring  ^Have,#37d67a^'
    const result = addProxyCategory(text, 'Sol Ring')
    expect(result).toBe('1x Sol Ring [Proxy]  ^Have,#37d67a^')
  })

  it('works with cards that have a set code and tags but no categories', () => {
    const text = '1x Sol Ring (c21)  ^Have,#37d67a^'
    const result = addProxyCategory(text, 'Sol Ring')
    expect(result).toBe('1x Sol Ring (c21) [Proxy]  ^Have,#37d67a^')
  })

  it('works with cards that have commas in their name', () => {
    const text = '1x Muldrotha, the Gravetide (dom) [Commander]'
    const result = addProxyCategory(text, 'Muldrotha, the Gravetide')
    expect(result).toBe('1x Muldrotha, the Gravetide (dom) [Commander,Proxy]')
  })

  it('only modifies the first matching card line', () => {
    const text = `1x Sol Ring (c21) [Ramp]
1x Sol Ring (cmr) [Ramp]`
    const result = addProxyCategory(text, 'Sol Ring')
    const lines = result.split('\n')
    expect(lines[0]).toBe('1x Sol Ring (c21) [Ramp,Proxy]')
    expect(lines[1]).toBe('1x Sol Ring (cmr) [Ramp]')
  })

  it('handles multiline text and preserves other lines', () => {
    const text = `1x Sol Ring (c21) [Ramp]
1x Command Tower (c21) [Lands]
1x Blood Crypt (rnc)`
    const result = addProxyCategory(text, 'Command Tower')
    const lines = result.split('\n')
    expect(lines[0]).toBe('1x Sol Ring (c21) [Ramp]')
    expect(lines[1]).toBe('1x Command Tower (c21) [Lands,Proxy]')
    expect(lines[2]).toBe('1x Blood Crypt (rnc)')
  })
})

describe('removeProxyCategory', () => {
  it('removes Proxy from a card with multiple categories', () => {
    const text = '1x Sol Ring (c21) [Ramp,Proxy]'
    const result = removeProxyCategory(text, 'Sol Ring')
    expect(result).toBe('1x Sol Ring (c21) [Ramp]')
  })

  it('removes entire bracket when Proxy is the only category', () => {
    const text = '1x Sol Ring (c21) [Proxy]'
    const result = removeProxyCategory(text, 'Sol Ring')
    expect(result).toBe('1x Sol Ring (c21)')
  })

  it('removes Proxy from the middle of multiple categories', () => {
    const text = "1x Ashnod's Altar (scd) [Ramp,Proxy,Sac Outlet]"
    const result = removeProxyCategory(text, "Ashnod's Altar")
    expect(result).toBe("1x Ashnod's Altar (scd) [Ramp,Sac Outlet]")
  })

  it('is a no-op if card has no Proxy category', () => {
    const text = '1x Sol Ring (c21) [Ramp]'
    const result = removeProxyCategory(text, 'Sol Ring')
    expect(result).toBe(text)
  })

  it('is a no-op if card has no categories at all', () => {
    const text = '1x Sol Ring (c21)'
    const result = removeProxyCategory(text, 'Sol Ring')
    expect(result).toBe(text)
  })

  it('returns text unchanged if card not found', () => {
    const text = '1x Sol Ring (c21) [Ramp,Proxy]'
    const result = removeProxyCategory(text, 'Nonexistent Card')
    expect(result).toBe(text)
  })

  it('works with cards that have commas in their name', () => {
    const text = '1x Muldrotha, the Gravetide (dom) [Commander,Proxy]'
    const result = removeProxyCategory(text, 'Muldrotha, the Gravetide')
    expect(result).toBe('1x Muldrotha, the Gravetide (dom) [Commander]')
  })

  it('preserves tags when removing Proxy category', () => {
    const text = '1x Sol Ring (c21) [Ramp,Proxy]  ^Have,#37d67a^'
    const result = removeProxyCategory(text, 'Sol Ring')
    expect(result).toBe('1x Sol Ring (c21) [Ramp]  ^Have,#37d67a^')
  })

  it('preserves tags when removing entire bracket (Proxy only category)', () => {
    const text = '1x Sol Ring (c21) [Proxy]  ^Have,#37d67a^'
    const result = removeProxyCategory(text, 'Sol Ring')
    expect(result).toBe('1x Sol Ring (c21)  ^Have,#37d67a^')
  })

  it('only modifies the first matching card line', () => {
    const text = `1x Sol Ring (c21) [Ramp,Proxy]
1x Sol Ring (cmr) [Ramp,Proxy]`
    const result = removeProxyCategory(text, 'Sol Ring')
    const lines = result.split('\n')
    expect(lines[0]).toBe('1x Sol Ring (c21) [Ramp]')
    expect(lines[1]).toBe('1x Sol Ring (cmr) [Ramp,Proxy]')
  })

  it('is case-sensitive — does not remove "proxy" (lowercase)', () => {
    const text = '1x Sol Ring (c21) [Ramp,proxy]'
    const result = removeProxyCategory(text, 'Sol Ring')
    // "proxy" (lowercase) is not "Proxy", so it should remain
    expect(result).toBe(text)
  })
})

describe('markAsProxy', () => {
  it('adds both proxy tag and proxy category', () => {
    const text = '1x Sol Ring (c21) [Ramp]'
    const result = markAsProxy(text, 'Sol Ring')
    expect(result).toContain(PROXY_TAG)
    expect(result).toContain('[Ramp,Proxy]')
  })

  it('adds tag and category to card with no extras', () => {
    const text = '1x Sol Ring (c21)'
    const result = markAsProxy(text, 'Sol Ring')
    expect(result).toContain(PROXY_TAG)
    expect(result).toContain('[Proxy]')
  })

  it('is idempotent — calling twice produces same result', () => {
    const text = '1x Sol Ring (c21) [Ramp]'
    const result1 = markAsProxy(text, 'Sol Ring')
    const result2 = markAsProxy(result1, 'Sol Ring')
    expect(result2).toBe(result1)
  })

  it('works on card that already has the tag but not category', () => {
    const text = `1x Sol Ring (c21) [Ramp]  ${PROXY_TAG}`
    const result = markAsProxy(text, 'Sol Ring')
    // Should add category but not duplicate tag
    expect(result).toContain('[Ramp,Proxy]')
    const line = result.split('\n').find(l => l.includes('Sol Ring'))!
    const tagCount = (line.match(/\^Proxy,#e158ff\^/g) || []).length
    expect(tagCount).toBe(1)
  })

  it('works on card that already has category but not tag', () => {
    const text = '1x Sol Ring (c21) [Ramp,Proxy]'
    const result = markAsProxy(text, 'Sol Ring')
    // Should add tag but not duplicate category
    expect(result).toContain(PROXY_TAG)
    expect(result).toContain('[Ramp,Proxy]')
    expect(result).not.toContain('[Ramp,Proxy,Proxy]')
  })

  it('returns text unchanged if card not found', () => {
    const text = '1x Sol Ring (c21) [Ramp]'
    const result = markAsProxy(text, 'Nonexistent Card')
    expect(result).toBe(text)
  })
})

describe('unmarkAsProxy', () => {
  it('removes both proxy tag and proxy category', () => {
    const text = `1x Sol Ring (c21) [Ramp,Proxy]  ${PROXY_TAG}`
    const result = unmarkAsProxy(text, 'Sol Ring')
    expect(result).not.toContain(PROXY_TAG)
    expect(result).not.toContain('Proxy')
    expect(result).toContain('[Ramp]')
  })

  it('removes tag and entire bracket when Proxy is only category', () => {
    const text = `1x Sol Ring (c21) [Proxy]  ${PROXY_TAG}`
    const result = unmarkAsProxy(text, 'Sol Ring')
    expect(result).not.toContain(PROXY_TAG)
    expect(result).not.toContain('[')
    expect(result).not.toContain(']')
    expect(result).toBe('1x Sol Ring (c21)')
  })

  it('is idempotent — calling twice produces same result', () => {
    const text = `1x Sol Ring (c21) [Ramp,Proxy]  ${PROXY_TAG}`
    const result1 = unmarkAsProxy(text, 'Sol Ring')
    const result2 = unmarkAsProxy(result1, 'Sol Ring')
    expect(result2).toBe(result1)
  })

  it('works on card that has tag but no category', () => {
    const text = `1x Sol Ring (c21) [Ramp]  ${PROXY_TAG}`
    const result = unmarkAsProxy(text, 'Sol Ring')
    expect(result).not.toContain(PROXY_TAG)
    expect(result).toContain('[Ramp]')
  })

  it('works on card that has category but no tag', () => {
    const text = '1x Sol Ring (c21) [Ramp,Proxy]'
    const result = unmarkAsProxy(text, 'Sol Ring')
    expect(result).not.toContain('Proxy')
    expect(result).toContain('[Ramp]')
  })

  it('returns text unchanged if card not found', () => {
    const text = `1x Sol Ring (c21) [Ramp,Proxy]  ${PROXY_TAG}`
    const result = unmarkAsProxy(text, 'Nonexistent Card')
    expect(result).toBe(text)
  })

  it('preserves other tags', () => {
    const text = `1x Sol Ring (c21) [Ramp,Proxy]  ^Have,#37d67a^  ${PROXY_TAG}`
    const result = unmarkAsProxy(text, 'Sol Ring')
    expect(result).toContain('^Have,#37d67a^')
    expect(result).not.toContain(PROXY_TAG)
    expect(result).toContain('[Ramp]')
  })
})
