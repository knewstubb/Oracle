import { describe, it, expect } from 'vitest'
import {
  validateStrategyBrief,
  validateSkeleton,
  isWithinColourIdentity,
  isCommanderLegal,
} from './brew-validators'

// ---------------------------------------------------------------------------
// validateStrategyBrief
// ---------------------------------------------------------------------------

describe('validateStrategyBrief', () => {
  const validBrief = {
    commanderName: 'Muldrotha, the Gravetide',
    colourIdentity: ['B', 'G', 'U'],
    primaryWinCondition: 'Graveyard recursion value',
    secondaryWinCondition: 'Combo with Spore Frog lock',
    targetBracket: 3,
    knownIncludes: ['Spore Frog', 'Mulldrifter'],
    playstyleDescription: 'Midrange value with permanent recursion',
    budgetPreference: 'budget',
    budgetCeiling: 10,
  }

  it('accepts a valid StrategyBrief', () => {
    const result = validateStrategyBrief(validBrief)
    expect(result).not.toBeNull()
    expect(result!.commanderName).toBe('Muldrotha, the Gravetide')
    expect(result!.targetBracket).toBe(3)
  })

  it('accepts a valid brief without optional budgetCeiling', () => {
    const { budgetCeiling, ...noCeiling } = validBrief
    const result = validateStrategyBrief(noCeiling)
    expect(result).not.toBeNull()
    expect(result!.budgetCeiling).toBeUndefined()
  })

  it('rejects null', () => {
    expect(validateStrategyBrief(null)).toBeNull()
  })

  it('rejects undefined', () => {
    expect(validateStrategyBrief(undefined)).toBeNull()
  })

  it('rejects non-object', () => {
    expect(validateStrategyBrief('string')).toBeNull()
    expect(validateStrategyBrief(42)).toBeNull()
  })

  it('rejects missing commanderName', () => {
    const { commanderName, ...missing } = validBrief
    expect(validateStrategyBrief(missing)).toBeNull()
  })

  it('rejects empty commanderName', () => {
    expect(validateStrategyBrief({ ...validBrief, commanderName: '' })).toBeNull()
    expect(validateStrategyBrief({ ...validBrief, commanderName: '   ' })).toBeNull()
  })

  it('rejects empty colourIdentity array', () => {
    expect(validateStrategyBrief({ ...validBrief, colourIdentity: [] })).toBeNull()
  })

  it('rejects invalid colour letters', () => {
    expect(validateStrategyBrief({ ...validBrief, colourIdentity: ['X'] })).toBeNull()
    expect(validateStrategyBrief({ ...validBrief, colourIdentity: ['W', 'Z'] })).toBeNull()
  })

  it('accepts lowercase colour letters and normalises to uppercase', () => {
    const result = validateStrategyBrief({ ...validBrief, colourIdentity: ['b', 'g', 'u'] })
    expect(result).not.toBeNull()
    expect(result!.colourIdentity).toEqual(['B', 'G', 'U'])
  })

  it('rejects invalid targetBracket', () => {
    expect(validateStrategyBrief({ ...validBrief, targetBracket: 0 })).toBeNull()
    expect(validateStrategyBrief({ ...validBrief, targetBracket: 5 })).toBeNull()
    expect(validateStrategyBrief({ ...validBrief, targetBracket: 2.5 })).toBeNull()
  })

  it('accepts all valid targetBracket values', () => {
    for (const bracket of [1, 2, 3, 4]) {
      const result = validateStrategyBrief({ ...validBrief, targetBracket: bracket })
      expect(result).not.toBeNull()
      expect(result!.targetBracket).toBe(bracket)
    }
  })

  it('rejects invalid budgetPreference', () => {
    expect(validateStrategyBrief({ ...validBrief, budgetPreference: 'cheap' })).toBeNull()
    expect(validateStrategyBrief({ ...validBrief, budgetPreference: '' })).toBeNull()
  })

  it('accepts all valid budgetPreference values', () => {
    for (const pref of ['collection', 'budget', 'unrestricted']) {
      const result = validateStrategyBrief({ ...validBrief, budgetPreference: pref })
      expect(result).not.toBeNull()
    }
  })

  it('rejects non-array knownIncludes', () => {
    expect(validateStrategyBrief({ ...validBrief, knownIncludes: 'Spore Frog' })).toBeNull()
  })

  it('rejects knownIncludes with non-string items', () => {
    expect(validateStrategyBrief({ ...validBrief, knownIncludes: [1, 2] })).toBeNull()
  })

  it('accepts empty knownIncludes array', () => {
    const result = validateStrategyBrief({ ...validBrief, knownIncludes: [] })
    expect(result).not.toBeNull()
    expect(result!.knownIncludes).toEqual([])
  })

  it('rejects negative budgetCeiling', () => {
    expect(validateStrategyBrief({ ...validBrief, budgetCeiling: -5 })).toBeNull()
  })

  it('rejects zero budgetCeiling', () => {
    expect(validateStrategyBrief({ ...validBrief, budgetCeiling: 0 })).toBeNull()
  })

  it('rejects empty primaryWinCondition', () => {
    expect(validateStrategyBrief({ ...validBrief, primaryWinCondition: '' })).toBeNull()
  })

  it('rejects empty playstyleDescription', () => {
    expect(validateStrategyBrief({ ...validBrief, playstyleDescription: '  ' })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// validateSkeleton
// ---------------------------------------------------------------------------

describe('validateSkeleton', () => {
  function makeValidSkeleton(cardCount = 100) {
    // Distribute cards across categories to sum to cardCount
    const cards = Array.from({ length: cardCount }, (_, i) => ({
      cardName: `Card ${i + 1}`,
      ownershipStatus: 'owned' as const,
      price: 1.0 as number | null,
      overBudget: false,
      accepted: false,
    }))

    return {
      commanderName: 'Muldrotha, the Gravetide',
      colourIdentity: ['B', 'G', 'U'],
      totalCards: cardCount,
      categories: [
        { name: 'Ramp', cards: cards.slice(0, 12) },
        { name: 'Draw', cards: cards.slice(12, 22) },
        { name: 'Removal', cards: cards.slice(22, 30) },
        { name: 'Creatures', cards: cards.slice(30, 55) },
        { name: 'Lands', cards: cards.slice(55, 92) },
        { name: 'Utility', cards: cards.slice(92, cardCount) },
      ],
    }
  }

  it('accepts a valid 100-card skeleton', () => {
    const skeleton = makeValidSkeleton()
    const result = validateSkeleton(skeleton)
    expect(result).not.toBeNull()
    expect(result!.totalCards).toBe(100)
  })

  it('rejects null', () => {
    expect(validateSkeleton(null)).toBeNull()
  })

  it('rejects non-object', () => {
    expect(validateSkeleton('string')).toBeNull()
  })

  it('rejects skeleton with totalCards != 100', () => {
    const skeleton = makeValidSkeleton()
    skeleton.totalCards = 99
    expect(validateSkeleton(skeleton)).toBeNull()
  })

  it('rejects skeleton where card sum != 100', () => {
    const skeleton = makeValidSkeleton()
    // Remove a card from a category so sum is 99
    skeleton.categories[0].cards = skeleton.categories[0].cards.slice(0, -1)
    expect(validateSkeleton(skeleton)).toBeNull()
  })

  it('rejects skeleton with empty categories array', () => {
    expect(validateSkeleton({
      commanderName: 'Test',
      colourIdentity: ['W'],
      totalCards: 100,
      categories: [],
    })).toBeNull()
  })

  it('rejects category with empty name', () => {
    const skeleton = makeValidSkeleton()
    skeleton.categories[0].name = ''
    expect(validateSkeleton(skeleton)).toBeNull()
  })

  it('rejects category with empty cards array', () => {
    const skeleton = makeValidSkeleton()
    skeleton.categories[0].cards = []
    expect(validateSkeleton(skeleton)).toBeNull()
  })

  it('rejects card with invalid ownershipStatus', () => {
    const skeleton = makeValidSkeleton()
    ;(skeleton.categories[0].cards[0] as any).ownershipStatus = 'unknown'
    expect(validateSkeleton(skeleton)).toBeNull()
  })

  it('rejects card with empty cardName', () => {
    const skeleton = makeValidSkeleton()
    ;(skeleton.categories[0].cards[0] as any).cardName = ''
    expect(validateSkeleton(skeleton)).toBeNull()
  })

  it('rejects card with non-boolean overBudget', () => {
    const skeleton = makeValidSkeleton()
    ;(skeleton.categories[0].cards[0] as any).overBudget = 'yes'
    expect(validateSkeleton(skeleton)).toBeNull()
  })

  it('accepts card with null price', () => {
    const skeleton = makeValidSkeleton()
    skeleton.categories[0].cards[0].price = null
    const result = validateSkeleton(skeleton)
    expect(result).not.toBeNull()
  })

  it('rejects card with non-number non-null price', () => {
    const skeleton = makeValidSkeleton()
    ;(skeleton.categories[0].cards[0] as any).price = 'free'
    expect(validateSkeleton(skeleton)).toBeNull()
  })

  it('rejects missing commanderName', () => {
    const skeleton = makeValidSkeleton()
    delete (skeleton as any).commanderName
    expect(validateSkeleton(skeleton)).toBeNull()
  })

  it('rejects invalid colourIdentity', () => {
    const skeleton = makeValidSkeleton()
    skeleton.colourIdentity = ['X']
    expect(validateSkeleton(skeleton)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// isWithinColourIdentity
// ---------------------------------------------------------------------------

describe('isWithinColourIdentity', () => {
  it('colorless card is always within any identity', () => {
    expect(isWithinColourIdentity([], ['W', 'U', 'B', 'R', 'G'])).toBe(true)
    expect(isWithinColourIdentity([], ['R'])).toBe(true)
    expect(isWithinColourIdentity([], [])).toBe(true)
  })

  it('mono-colour card within matching commander', () => {
    expect(isWithinColourIdentity(['G'], ['B', 'G', 'U'])).toBe(true)
  })

  it('mono-colour card outside commander identity', () => {
    expect(isWithinColourIdentity(['R'], ['B', 'G', 'U'])).toBe(false)
  })

  it('multi-colour card fully within commander identity', () => {
    expect(isWithinColourIdentity(['B', 'G'], ['B', 'G', 'U'])).toBe(true)
  })

  it('multi-colour card partially outside commander identity', () => {
    expect(isWithinColourIdentity(['B', 'R'], ['B', 'G', 'U'])).toBe(false)
  })

  it('case-insensitive comparison', () => {
    expect(isWithinColourIdentity(['g'], ['B', 'G', 'U'])).toBe(true)
    expect(isWithinColourIdentity(['G'], ['b', 'g', 'u'])).toBe(true)
    expect(isWithinColourIdentity(['r'], ['B', 'G', 'U'])).toBe(false)
  })

  it('exact match (card CI equals commander CI)', () => {
    expect(isWithinColourIdentity(['W', 'U', 'B'], ['W', 'U', 'B'])).toBe(true)
  })

  it('five-colour commander accepts anything', () => {
    expect(isWithinColourIdentity(['W', 'U', 'B', 'R', 'G'], ['W', 'U', 'B', 'R', 'G'])).toBe(true)
    expect(isWithinColourIdentity(['R'], ['W', 'U', 'B', 'R', 'G'])).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isCommanderLegal
// ---------------------------------------------------------------------------

describe('isCommanderLegal', () => {
  it('returns true for legal cards', () => {
    expect(isCommanderLegal('Sol Ring')).toBe(true)
    expect(isCommanderLegal('Lightning Bolt')).toBe(true)
    expect(isCommanderLegal('Rhystic Study')).toBe(true)
  })

  it('returns false for banned cards', () => {
    expect(isCommanderLegal('Black Lotus')).toBe(false)
    expect(isCommanderLegal('Mana Crypt')).toBe(false)
    expect(isCommanderLegal('Dockside Extortionist')).toBe(false)
    expect(isCommanderLegal('Jeweled Lotus')).toBe(false)
    expect(isCommanderLegal('Nadu, Winged Wisdom')).toBe(false)
  })

  it('case-insensitive ban check', () => {
    expect(isCommanderLegal('black lotus')).toBe(false)
    expect(isCommanderLegal('BLACK LOTUS')).toBe(false)
    expect(isCommanderLegal('BlAcK LoTuS')).toBe(false)
  })

  it('handles Conspiracy type cards', () => {
    expect(isCommanderLegal('Backup Plan')).toBe(false)
    expect(isCommanderLegal('Power Play')).toBe(false)
  })

  it('handles ante cards', () => {
    expect(isCommanderLegal('Contract from Below')).toBe(false)
    expect(isCommanderLegal('Jeweled Bird')).toBe(false)
  })

  it('handles double-faced ban list entries', () => {
    expect(isCommanderLegal('Erayo, Soratami Ascendant // Erayo\'s Essence')).toBe(false)
  })
})
