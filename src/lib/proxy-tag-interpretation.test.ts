/**
 * Tests for Archidekt proxy tag interpretation on import.
 *
 * Validates: Requirements 9.5
 *
 * When reading deck state from Archidekt, cards with a "Proxy" label should
 * be detected and marked with is_proxy: true during import normalization.
 *
 * The proxy detection pipeline is:
 *   1. Archidekt API returns a `label` field per card (format: "Name,#color")
 *   2. `parseLabel(label)` extracts { name, color }
 *   3. `isProxyLabel(label)` returns true if parsed name === 'Proxy'
 *   4. `normalizeArchidektCard()` sets `isProxy: true` → deck-import creates
 *      the physical_copies row with `is_proxy: true`
 *
 * Previous implementation (allocation-store.ts, deleted in 42cf497) scanned
 * deck_cards rows post-import for tag/category patterns. Current implementation
 * detects proxy status during normalization, before DB writes.
 */

import { describe, it, expect } from 'vitest'
import { parseLabel, isProxyLabel } from './archidekt-client'

// ---------------------------------------------------------------------------
// Tests: parseLabel
// ---------------------------------------------------------------------------

describe('parseLabel', () => {
  it('parses a standard label with name and color', () => {
    const result = parseLabel('Proxy,#e158ff')
    expect(result).toEqual({ name: 'Proxy', color: '#e158ff' })
  })

  it('parses labels with commas in the name (uses last comma)', () => {
    const result = parseLabel('Some, Complex Name,#ff0000')
    expect(result).toEqual({ name: 'Some, Complex Name', color: '#ff0000' })
  })

  it('returns null for empty string', () => {
    expect(parseLabel('')).toBeNull()
  })

  it('returns null for string starting with comma', () => {
    expect(parseLabel(',#ff0000')).toBeNull()
  })

  it('returns null for string with no comma', () => {
    expect(parseLabel('Proxy')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: isProxyLabel
// ---------------------------------------------------------------------------

describe('isProxyLabel', () => {
  it('returns true for standard Proxy label', () => {
    expect(isProxyLabel('Proxy,#e158ff')).toBe(true)
  })

  it('returns true for Proxy label with different color', () => {
    expect(isProxyLabel('Proxy,#ff0000')).toBe(true)
  })

  it('returns false for non-Proxy label', () => {
    expect(isProxyLabel('Ramp,#22c55e')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isProxyLabel('')).toBe(false)
  })

  it('returns false for label with "proxy" in wrong position (not name)', () => {
    // If "proxy" appears only in the color portion, it shouldn't match
    expect(isProxyLabel('Ramp,proxy')).toBe(false)
  })

  it('is case-sensitive — "proxy" lowercase does not match', () => {
    // The Archidekt API always sends "Proxy" with capital P
    // isProxyLabel checks parsed.name === 'Proxy' (exact match)
    expect(isProxyLabel('proxy,#e158ff')).toBe(false)
  })

  it('returns false for label that contains Proxy as substring', () => {
    expect(isProxyLabel('ProxyBudget,#e158ff')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Integration: proxy detection in normalizer context
// ---------------------------------------------------------------------------

describe('proxy detection integration', () => {
  it('the format Archidekt API actually sends is detected', () => {
    // Real-world examples from Archidekt API responses:
    // Cards tagged as Proxy get label: "Proxy,#e158ff" (purple/magenta)
    const archidektProxyLabel = 'Proxy,#e158ff'
    expect(isProxyLabel(archidektProxyLabel)).toBe(true)
  })

  it('cards without labels are not flagged as proxy', () => {
    // Cards with no label get empty string from the API
    expect(isProxyLabel('')).toBe(false)
  })

  it('cards with other labels (Ramp, Draw, etc.) are not flagged', () => {
    const nonProxyLabels = [
      'Ramp,#22c55e',
      'Draw,#3b82f6',
      'Removal,#ef4444',
      'Combo,#f59e0b',
      'Win Condition,#8b5cf6',
    ]
    for (const label of nonProxyLabels) {
      expect(isProxyLabel(label)).toBe(false)
    }
  })
})
