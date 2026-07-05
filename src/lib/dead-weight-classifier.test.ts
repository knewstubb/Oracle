import { describe, it, expect } from 'vitest'
import {
  classifyDeadWeight,
  exceedsRarityRestriction,
  DEFAULT_CATEGORY_TARGETS,
  RARITY_ORDER,
  type FormatRules,
} from './dead-weight-classifier'

describe('exceedsRarityRestriction', () => {
  it('returns false when card rarity equals max allowed', () => {
    expect(exceedsRarityRestriction('uncommon', 'uncommon')).toBe(false)
  })

  it('returns false when card rarity is below max allowed', () => {
    expect(exceedsRarityRestriction('common', 'rare')).toBe(false)
  })

  it('returns true when card rarity exceeds max allowed', () => {
    expect(exceedsRarityRestriction('rare', 'uncommon')).toBe(true)
    expect(exceedsRarityRestriction('mythic', 'rare')).toBe(true)
  })

  it('returns false for null card rarity', () => {
    expect(exceedsRarityRestriction(null, 'common')).toBe(false)
  })

  it('returns false for unknown rarity string', () => {
    expect(exceedsRarityRestriction('special', 'common')).toBe(false)
  })

  it('handles case-insensitive rarity', () => {
    expect(exceedsRarityRestriction('Rare', 'uncommon')).toBe(true)
    expect(exceedsRarityRestriction('MYTHIC', 'rare')).toBe(true)
  })
})

describe('classifyDeadWeight', () => {
  const emptyCategories = new Map<string, number>()
  const emptyTargets = new Map<string, number>()
  const noComboCards = new Set<string>()

  describe('format_violation (highest priority)', () => {
    it('flags card in mandatory_cuts list', () => {
      const formatRules: FormatRules = {
        format_name: 'precon_mod',
        mandatory_cuts: ['Sol Ring'],
      }

      const result = classifyDeadWeight(
        'Sol Ring',
        90, // high synergy — irrelevant
        emptyCategories,
        emptyTargets,
        noComboCards,
        null,
        formatRules,
        'uncommon'
      )

      expect(result).not.toBeNull()
      expect(result!.flag).toBe('format_violation')
      expect(result!.reason).toContain('mandatory cut')
    })

    it('flags card exceeding rarity restriction', () => {
      const formatRules: FormatRules = {
        format_name: 'baggy_league',
        rarity_restriction: 'uncommon',
      }

      const result = classifyDeadWeight(
        'Smothering Tithe',
        75,
        emptyCategories,
        emptyTargets,
        noComboCards,
        null,
        formatRules,
        'rare'
      )

      expect(result).not.toBeNull()
      expect(result!.flag).toBe('format_violation')
      expect(result!.reason).toContain('uncommon-max restriction')
    })

    it('does not flag card within rarity restriction', () => {
      const formatRules: FormatRules = {
        format_name: 'baggy_league',
        rarity_restriction: 'rare',
      }

      const result = classifyDeadWeight(
        'Lightning Greaves',
        60,
        emptyCategories,
        emptyTargets,
        noComboCards,
        null,
        formatRules,
        'uncommon'
      )

      // Should not be format_violation (may still hit other checks)
      if (result) {
        expect(result.flag).not.toBe('format_violation')
      }
    })

    it('format_violation takes priority over off_strategy', () => {
      const formatRules: FormatRules = {
        format_name: 'precon_mod',
        mandatory_cuts: ['Sol Ring'],
      }

      const result = classifyDeadWeight(
        'Sol Ring',
        10, // low synergy — would also trigger off_strategy
        emptyCategories,
        emptyTargets,
        noComboCards,
        null,
        formatRules,
        'uncommon'
      )

      expect(result!.flag).toBe('format_violation')
    })
  })

  describe('redundant classification', () => {
    it('flags card when category exceeds target', () => {
      const categoryCount = new Map([['Ramp', 14]])
      const categoryTargets = new Map([['Ramp', 12]])

      const result = classifyDeadWeight(
        'Arcane Signet',
        25,
        categoryCount,
        categoryTargets,
        noComboCards,
        null,
        null,
        'common'
      )

      expect(result).not.toBeNull()
      expect(result!.flag).toBe('redundant')
      expect(result!.reason).toContain('Ramp')
      expect(result!.reason).toContain('14')
      expect(result!.reason).toContain('12')
    })

    it('does not flag when category is at or below target', () => {
      const categoryCount = new Map([['Ramp', 12]])
      const categoryTargets = new Map([['Ramp', 12]])

      const result = classifyDeadWeight(
        'Arcane Signet',
        25,
        categoryCount,
        categoryTargets,
        noComboCards,
        null,
        null,
        'common'
      )

      // Will hit off_strategy instead (synergy < 30)
      if (result) {
        expect(result.flag).not.toBe('redundant')
      }
    })
  })

  describe('off_strategy classification', () => {
    it('flags card with synergy < 30 not in combos', () => {
      const result = classifyDeadWeight(
        'Terramorphic Expanse',
        20,
        emptyCategories,
        emptyTargets,
        noComboCards,
        null,
        null,
        'common'
      )

      expect(result).not.toBeNull()
      expect(result!.flag).toBe('off_strategy')
      expect(result!.reason).toContain('20%')
      expect(result!.reason).toContain('30%')
    })

    it('does not flag card with synergy >= 30', () => {
      const result = classifyDeadWeight(
        'Beast Within',
        45,
        emptyCategories,
        emptyTargets,
        noComboCards,
        null,
        null,
        'uncommon'
      )

      expect(result).toBeNull()
    })

    it('does not flag card in combos even with low synergy', () => {
      const comboCards = new Set(['Dramatic Reversal'])

      const result = classifyDeadWeight(
        'Dramatic Reversal',
        15,
        emptyCategories,
        emptyTargets,
        comboCards,
        null,
        null,
        'uncommon'
      )

      expect(result).toBeNull()
    })

    it('does not flag card with synergy exactly 30', () => {
      const result = classifyDeadWeight(
        'Some Card',
        30,
        emptyCategories,
        emptyTargets,
        noComboCards,
        null,
        null,
        'common'
      )

      expect(result).toBeNull()
    })
  })

  describe('bracket_mismatch classification', () => {
    it('does not flag when bracket is null', () => {
      const result = classifyDeadWeight(
        'Fierce Guardianship',
        95,
        emptyCategories,
        emptyTargets,
        noComboCards,
        null, // no bracket
        null,
        'rare'
      )

      // High synergy, no bracket — should be null (passes all checks)
      expect(result).toBeNull()
    })

    it('flags card exceeding bracket 1 threshold (>80)', () => {
      const result = classifyDeadWeight(
        'Fierce Guardianship',
        85,
        emptyCategories,
        emptyTargets,
        noComboCards,
        1,
        null,
        'rare'
      )

      expect(result).not.toBeNull()
      expect(result!.flag).toBe('bracket_mismatch')
      expect(result!.reason).toContain('bracket 1')
    })

    it('does not flag card within bracket 1 threshold (<=80)', () => {
      const result = classifyDeadWeight(
        'Cultivate',
        75,
        emptyCategories,
        emptyTargets,
        noComboCards,
        1,
        null,
        'uncommon'
      )

      expect(result).toBeNull()
    })

    it('never flags in bracket 4 (cEDH)', () => {
      const result = classifyDeadWeight(
        'Ad Nauseam',
        99,
        emptyCategories,
        emptyTargets,
        noComboCards,
        4,
        null,
        'rare'
      )

      expect(result).toBeNull()
    })
  })

  describe('priority ordering', () => {
    it('format_violation beats redundant', () => {
      const formatRules: FormatRules = {
        format_name: 'precon_mod',
        mandatory_cuts: ['Sol Ring'],
      }
      const categoryCount = new Map([['Ramp', 15]])
      const categoryTargets = new Map([['Ramp', 12]])

      const result = classifyDeadWeight(
        'Sol Ring',
        10,
        categoryCount,
        categoryTargets,
        noComboCards,
        1,
        formatRules,
        'uncommon'
      )

      expect(result!.flag).toBe('format_violation')
    })

    it('redundant beats off_strategy', () => {
      const categoryCount = new Map([['Draw', 15]])
      const categoryTargets = new Map([['Draw', 12]])

      const result = classifyDeadWeight(
        'Opt',
        20, // low synergy → would trigger off_strategy too
        categoryCount,
        categoryTargets,
        noComboCards,
        null,
        null,
        'common'
      )

      expect(result!.flag).toBe('redundant')
    })
  })
})

describe('DEFAULT_CATEGORY_TARGETS', () => {
  it('has expected categories defined', () => {
    expect(DEFAULT_CATEGORY_TARGETS['Ramp']).toBe(12)
    expect(DEFAULT_CATEGORY_TARGETS['Draw']).toBe(12)
    expect(DEFAULT_CATEGORY_TARGETS['Removal']).toBe(10)
    expect(DEFAULT_CATEGORY_TARGETS['Counterspell']).toBe(5)
    expect(DEFAULT_CATEGORY_TARGETS['Board Wipe']).toBe(4)
    expect(DEFAULT_CATEGORY_TARGETS['Recursion']).toBe(5)
    expect(DEFAULT_CATEGORY_TARGETS['Tutor']).toBe(5)
  })
})

describe('RARITY_ORDER', () => {
  it('is ordered from lowest to highest', () => {
    expect(RARITY_ORDER).toEqual(['common', 'uncommon', 'rare', 'mythic'])
  })
})
