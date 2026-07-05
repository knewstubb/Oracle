import { describe, it, expect } from 'vitest'
import {
  categorizeDecision,
  DECISION_TYPES,
  DECISION_SECTIONS,
  DECISION_TYPE_TO_SECTION,
} from './brew-v2-decisions'
import type { DecisionEntry } from './brew-v2-types'

function makeEntry(key: string): DecisionEntry {
  return {
    id: 'test-1',
    key,
    value: 'test value',
    sourceQuote: 'test quote',
    timestamp: Date.now(),
  }
}

describe('categorizeDecision', () => {
  describe('strategy-related types → "Strategy"', () => {
    it('maps archetype to Strategy', () => {
      expect(categorizeDecision(makeEntry('ARCHETYPE'))).toBe('Strategy')
    })

    it('maps playstyle to Strategy', () => {
      expect(categorizeDecision(makeEntry('PLAYSTYLE'))).toBe('Strategy')
    })

    it('maps win_approach to Strategy', () => {
      expect(categorizeDecision(makeEntry('WIN APPROACH'))).toBe('Strategy')
    })

    it('maps known_card_includes to Strategy', () => {
      expect(categorizeDecision(makeEntry('KNOWN CARD INCLUDES'))).toBe(
        'Strategy'
      )
    })
  })

  describe('measurable types → "Parameters"', () => {
    it('maps colour_identity to Parameters', () => {
      expect(categorizeDecision(makeEntry('COLOUR IDENTITY'))).toBe(
        'Parameters'
      )
    })

    it('maps bracket to Parameters', () => {
      expect(categorizeDecision(makeEntry('BRACKET'))).toBe('Parameters')
    })
  })

  describe('limitation types → "Constraints"', () => {
    it('maps constraints to Constraints', () => {
      expect(categorizeDecision(makeEntry('CONSTRAINTS'))).toBe('Constraints')
    })

    it('maps exclusions to Constraints', () => {
      expect(categorizeDecision(makeEntry('EXCLUSIONS'))).toBe('Constraints')
    })
  })

  describe('case and whitespace normalization', () => {
    it('handles lowercase keys', () => {
      expect(categorizeDecision(makeEntry('archetype'))).toBe('Strategy')
    })

    it('handles mixed case keys', () => {
      expect(categorizeDecision(makeEntry('Colour Identity'))).toBe(
        'Parameters'
      )
    })

    it('handles keys with multiple spaces', () => {
      expect(categorizeDecision(makeEntry('WIN  APPROACH'))).toBe('Strategy')
    })
  })

  describe('unrecognized types', () => {
    it('returns null for unknown decision types', () => {
      expect(categorizeDecision(makeEntry('UNKNOWN_TYPE'))).toBeNull()
    })

    it('returns null for empty key', () => {
      expect(categorizeDecision(makeEntry(''))).toBeNull()
    })
  })
})

describe('DECISION_TYPES constants', () => {
  it('exports all expected decision types', () => {
    expect(DECISION_TYPES.ARCHETYPE).toBe('archetype')
    expect(DECISION_TYPES.PLAYSTYLE).toBe('playstyle')
    expect(DECISION_TYPES.WIN_APPROACH).toBe('win_approach')
    expect(DECISION_TYPES.COLOUR_IDENTITY).toBe('colour_identity')
    expect(DECISION_TYPES.BRACKET).toBe('bracket')
    expect(DECISION_TYPES.CONSTRAINTS).toBe('constraints')
    expect(DECISION_TYPES.EXCLUSIONS).toBe('exclusions')
    expect(DECISION_TYPES.KNOWN_CARD_INCLUDES).toBe('known_card_includes')
  })
})

describe('DECISION_SECTIONS constants', () => {
  it('exports all expected section names', () => {
    expect(DECISION_SECTIONS.STRATEGY).toBe('Strategy')
    expect(DECISION_SECTIONS.PARAMETERS).toBe('Parameters')
    expect(DECISION_SECTIONS.CONSTRAINTS).toBe('Constraints')
  })
})

describe('DECISION_TYPE_TO_SECTION mapping', () => {
  it('has an entry for every decision type', () => {
    const allTypes = Object.values(DECISION_TYPES)
    for (const type of allTypes) {
      expect(DECISION_TYPE_TO_SECTION[type]).toBeDefined()
    }
  })

  it('every mapping value is a valid section', () => {
    const validSections = Object.values(DECISION_SECTIONS)
    for (const section of Object.values(DECISION_TYPE_TO_SECTION)) {
      expect(validSections).toContain(section)
    }
  })
})
