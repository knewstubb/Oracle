import { describe, it, expect } from 'vitest'
import {
  interpolateScore,
  computeConsistencyRaw,
  computeResilienceRaw,
  computeInteractionRaw,
  computeSpeedRaw,
  computeAttributeScores,
  classifyCard,
  selectKeyCards,
  generatePrimer,
  identifyWeaknesses,
  type ScoringInputs,
  type CardData,
  type ContributingCards,
  type AttributeScores,
  type KeyCard,
} from './rating-engine'

describe('interpolateScore', () => {
  it('returns 1 when raw equals min threshold', () => {
    expect(interpolateScore(0, 0, 15)).toBe(1)
  })

  it('returns 10 when raw equals max threshold', () => {
    expect(interpolateScore(15, 0, 15)).toBe(10)
  })

  it('clamps to 1 when raw is below min threshold', () => {
    expect(interpolateScore(-5, 0, 15)).toBe(1)
  })

  it('clamps to 10 when raw exceeds max threshold', () => {
    expect(interpolateScore(20, 0, 15)).toBe(10)
  })

  it('returns a midrange integer for a midpoint raw value', () => {
    // At raw = 7.5, normalized = 0.5, scaled = 5.5, floor = 5
    expect(interpolateScore(7.5, 0, 15)).toBe(5)
  })

  it('always returns an integer', () => {
    const result = interpolateScore(3.7, 0, 12)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('applies floor rounding (not round)', () => {
    // raw = 10, min = 0, max = 15
    // normalized = 10/15 = 0.6667, scaled = 1 + 0.6667 * 9 = 7.0, floor = 7
    expect(interpolateScore(10, 0, 15)).toBe(7)
  })

  it('works with non-zero min thresholds', () => {
    // raw = 5, min = 2, max = 8 → normalized = 3/6 = 0.5, scaled = 5.5, floor = 5
    expect(interpolateScore(5, 2, 8)).toBe(5)
  })

  it('returns 1 for raw slightly above min (small raw values still floor to 1)', () => {
    // raw = 0.5, min = 0, max = 15 → normalized = 0.0333, scaled = 1.3, floor = 1
    expect(interpolateScore(0.5, 0, 15)).toBe(1)
  })

  it('returns 9 just below the max threshold', () => {
    // raw = 14, min = 0, max = 15 → normalized = 14/15 = 0.9333, scaled = 9.4, floor = 9
    expect(interpolateScore(14, 0, 15)).toBe(9)
  })
})


describe('computeConsistencyRaw', () => {
  it('returns 0 when all inputs are zero', () => {
    expect(computeConsistencyRaw({
      tutorCount: 0,
      drawEngineCount: 0,
      commanderCardAdvantageFlag: 0,
    })).toBe(0)
  })

  it('applies correct weights: tutors × 2, draw × 1, commander × 3', () => {
    expect(computeConsistencyRaw({
      tutorCount: 3,
      drawEngineCount: 5,
      commanderCardAdvantageFlag: 1,
    })).toBe(3 * 2 + 5 * 1 + 1 * 3) // 6 + 5 + 3 = 14
  })

  it('handles commander flag of 0 correctly', () => {
    expect(computeConsistencyRaw({
      tutorCount: 2,
      drawEngineCount: 4,
      commanderCardAdvantageFlag: 0,
    })).toBe(2 * 2 + 4 * 1 + 0) // 4 + 4 = 8
  })

  it('reaches max threshold (15) with high inputs', () => {
    expect(computeConsistencyRaw({
      tutorCount: 5,
      drawEngineCount: 2,
      commanderCardAdvantageFlag: 1,
    })).toBe(5 * 2 + 2 * 1 + 1 * 3) // 10 + 2 + 3 = 15
  })
})

describe('computeResilienceRaw', () => {
  it('returns 4 when only commander independence contributes (dep = 0)', () => {
    expect(computeResilienceRaw({
      recursionCount: 0,
      comboRedundancyCount: 0,
      commanderDependencyScore: 0,
    })).toBe(0 * 1.5 + 0 * 3 + (1 - 0) * 4) // 4
  })

  it('returns 0 when fully commander-dependent and no other inputs', () => {
    expect(computeResilienceRaw({
      recursionCount: 0,
      comboRedundancyCount: 0,
      commanderDependencyScore: 1,
    })).toBe(0) // 0 + 0 + 0
  })

  it('applies correct weights', () => {
    expect(computeResilienceRaw({
      recursionCount: 4,
      comboRedundancyCount: 2,
      commanderDependencyScore: 0.5,
    })).toBe(4 * 1.5 + 2 * 3 + (1 - 0.5) * 4) // 6 + 6 + 2 = 14
  })

  it('handles partial commander dependency', () => {
    expect(computeResilienceRaw({
      recursionCount: 2,
      comboRedundancyCount: 1,
      commanderDependencyScore: 0.3,
    })).toBeCloseTo(2 * 1.5 + 1 * 3 + 0.7 * 4) // 3 + 3 + 2.8 = 8.8
  })
})

describe('computeInteractionRaw', () => {
  it('returns 0 when all inputs are zero', () => {
    expect(computeInteractionRaw({
      removalPlusCounterspellCount: 0,
      boardWipeCount: 0,
    })).toBe(0)
  })

  it('applies removal × 1 and boardWipe × 2', () => {
    expect(computeInteractionRaw({
      removalPlusCounterspellCount: 6,
      boardWipeCount: 3,
    })).toBe(6 * 1 + 3 * 2) // 6 + 6 = 12
  })

  it('caps board wipe contribution at 4 wipes', () => {
    expect(computeInteractionRaw({
      removalPlusCounterspellCount: 6,
      boardWipeCount: 7,
    })).toBe(6 * 1 + 4 * 2) // 6 + 8 = 14
  })

  it('treats exactly 4 board wipes as the cap (not exceeded)', () => {
    expect(computeInteractionRaw({
      removalPlusCounterspellCount: 0,
      boardWipeCount: 4,
    })).toBe(0 + 4 * 2) // 8
  })

  it('handles high removal count without board wipes', () => {
    expect(computeInteractionRaw({
      removalPlusCounterspellCount: 14,
      boardWipeCount: 0,
    })).toBe(14)
  })
})

describe('computeSpeedRaw', () => {
  it('returns 0 when fast mana is 0 and CMC/turn are both >= 5', () => {
    expect(computeSpeedRaw({
      fastManaCount: 0,
      averageCmc: 5,
      estimatedFundamentalTurn: 5,
    })).toBe(0) // 0 + max(0, 0)*2 + max(0, 0)*2
  })

  it('clamps (5 - averageCmc) to 0 when averageCmc > 5', () => {
    expect(computeSpeedRaw({
      fastManaCount: 2,
      averageCmc: 6.5,
      estimatedFundamentalTurn: 3,
    })).toBe(2 * 1.5 + 0 * 2 + 2 * 2) // 3 + 0 + 4 = 7
  })

  it('clamps (5 - estimatedFundamentalTurn) to 0 when turn > 5', () => {
    expect(computeSpeedRaw({
      fastManaCount: 3,
      averageCmc: 3,
      estimatedFundamentalTurn: 7,
    })).toBe(3 * 1.5 + 2 * 2 + 0 * 2) // 4.5 + 4 + 0 = 8.5
  })

  it('computes a high raw score for very fast decks', () => {
    expect(computeSpeedRaw({
      fastManaCount: 6,
      averageCmc: 2,
      estimatedFundamentalTurn: 2,
    })).toBe(6 * 1.5 + 3 * 2 + 3 * 2) // 9 + 6 + 6 = 21
  })

  it('applies all three weights correctly for typical values', () => {
    expect(computeSpeedRaw({
      fastManaCount: 4,
      averageCmc: 3.5,
      estimatedFundamentalTurn: 4,
    })).toBe(4 * 1.5 + 1.5 * 2 + 1 * 2) // 6 + 3 + 2 = 11
  })
})

describe('computeAttributeScores', () => {
  const baseInputs: ScoringInputs = {
    tutorCount: 0,
    drawEngineCount: 0,
    commanderCardAdvantageFlag: 0,
    recursionCount: 0,
    comboRedundancyCount: 0,
    commanderDependencyScore: 0,
    removalPlusCounterspellCount: 0,
    boardWipeCount: 0,
    fastManaCount: 0,
    averageCmc: 5,
    estimatedFundamentalTurn: 5,
    commanderCmc: 5,
  }

  it('returns all scores as 1 when all inputs are minimal', () => {
    // consistency raw = 0, resilience raw = (1-0)*4 = 4, interaction raw = 0, speed raw = 0
    const scores = computeAttributeScores({
      ...baseInputs,
      commanderDependencyScore: 1, // makes resilience raw = 0 too
    })
    expect(scores.consistency).toBe(1)
    expect(scores.resilience).toBe(1)
    expect(scores.interaction).toBe(1)
    expect(scores.speed).toBe(1)
  })

  it('returns correct scores for a mid-range deck', () => {
    const inputs: ScoringInputs = {
      tutorCount: 3,
      drawEngineCount: 5,
      commanderCardAdvantageFlag: 1,
      recursionCount: 4,
      comboRedundancyCount: 1,
      commanderDependencyScore: 0.3,
      removalPlusCounterspellCount: 7,
      boardWipeCount: 3,
      fastManaCount: 4,
      averageCmc: 3.5,
      estimatedFundamentalTurn: 4,
      commanderCmc: 5,
    }

    const scores = computeAttributeScores(inputs)

    // Consistency raw: 3*2 + 5*1 + 1*3 = 14 → interpolate(14, 0, 15) → normalized=14/15=0.9333, scaled=9.4, floor=9
    expect(scores.consistency).toBe(9)

    // Resilience raw: 4*1.5 + 1*3 + 0.7*4 = 6 + 3 + 2.8 = 11.8 → interpolate(11.8, 0, 12) → normalized=11.8/12=0.9833, scaled=9.85, floor=9
    expect(scores.resilience).toBe(9)

    // Interaction raw: 7*1 + min(3,4)*2 = 7 + 6 = 13 → interpolate(13, 0, 14) → normalized=13/14=0.9286, scaled=9.357, floor=9
    expect(scores.interaction).toBe(9)

    // Speed raw: 4*1.5 + max(0, 5-3.5)*2 + max(0, 5-4)*2 = 6 + 3 + 2 = 11 → interpolate(11, 0, 15) → normalized=11/15=0.7333, scaled=7.6, floor=7
    expect(scores.speed).toBe(7)
  })

  it('returns all scores as integers in range [1, 10]', () => {
    const inputs: ScoringInputs = {
      tutorCount: 2,
      drawEngineCount: 3,
      commanderCardAdvantageFlag: 0,
      recursionCount: 2,
      comboRedundancyCount: 0,
      commanderDependencyScore: 0.5,
      removalPlusCounterspellCount: 4,
      boardWipeCount: 1,
      fastManaCount: 2,
      averageCmc: 4,
      estimatedFundamentalTurn: 4,
      commanderCmc: 4,
    }

    const scores = computeAttributeScores(inputs)

    for (const key of ['consistency', 'resilience', 'interaction', 'speed'] as const) {
      expect(scores[key]).toBeGreaterThanOrEqual(1)
      expect(scores[key]).toBeLessThanOrEqual(10)
      expect(Number.isInteger(scores[key])).toBe(true)
    }
  })

  it('correctly caps board wipes at 4 in interaction scoring', () => {
    const inputs: ScoringInputs = {
      ...baseInputs,
      removalPlusCounterspellCount: 6,
      boardWipeCount: 10, // should be capped at 4
    }

    const scores = computeAttributeScores(inputs)
    // Interaction raw: 6*1 + min(10,4)*2 = 6 + 8 = 14 → interpolate(14, 0, 14) = 10
    expect(scores.interaction).toBe(10)
  })

  it('higher inputs produce higher or equal scores', () => {
    const lowInputs: ScoringInputs = {
      ...baseInputs,
      tutorCount: 1,
      drawEngineCount: 2,
    }
    const highInputs: ScoringInputs = {
      ...baseInputs,
      tutorCount: 5,
      drawEngineCount: 8,
      commanderCardAdvantageFlag: 1,
    }

    const lowScores = computeAttributeScores(lowInputs)
    const highScores = computeAttributeScores(highInputs)

    expect(highScores.consistency).toBeGreaterThanOrEqual(lowScores.consistency)
  })

  it('handles zero commanderDependencyScore giving resilience contribution', () => {
    const inputs: ScoringInputs = {
      ...baseInputs,
      commanderDependencyScore: 0, // (1-0)*4 = 4
    }
    const scores = computeAttributeScores(inputs)
    // Resilience raw: 0 + 0 + 4 = 4 → interpolate(4, 0, 12) → normalized=4/12=0.3333, scaled=4.0, floor=4
    expect(scores.resilience).toBe(4)
  })
})


describe('classifyCard', () => {
  function makeCard(overrides: Partial<CardData>): CardData {
    return {
      cardName: 'Test Card',
      oracleText: '',
      typeLine: 'Creature',
      manaCost: '{2}',
      cmc: 2,
      categories: '[]',
      isCommander: false,
      ...overrides,
    }
  }

  it('classifies Demonic Tutor as a tutor (oracle text "search your library")', () => {
    const card = makeCard({
      cardName: 'Demonic Tutor',
      oracleText: 'Search your library for a card, put that card into your hand, then shuffle.',
      typeLine: 'Sorcery',
      manaCost: '{1}{B}',
      cmc: 2,
      categories: '["Tutor"]',
    })
    const result = classifyCard(card)
    expect(result).toContain('tutor')
  })

  it('classifies Phyrexian Arena as a draw engine (categories includes "Draw")', () => {
    const card = makeCard({
      cardName: 'Phyrexian Arena',
      oracleText: 'At the beginning of your upkeep, you draw a card and you lose 1 life.',
      typeLine: 'Enchantment',
      manaCost: '{1}{B}{B}',
      cmc: 3,
      categories: '["Draw"]',
    })
    const result = classifyCard(card)
    expect(result).toContain('drawEngine')
  })

  it('classifies Eternal Witness as recursion (oracle text "return" + "from your graveyard")', () => {
    const card = makeCard({
      cardName: 'Eternal Witness',
      oracleText: 'When Eternal Witness enters the battlefield, you may return target card from your graveyard to your hand.',
      typeLine: 'Creature — Human Shaman',
      manaCost: '{1}{G}{G}',
      cmc: 3,
      categories: '[]',
    })
    const result = classifyCard(card)
    expect(result).toContain('recursion')
  })

  it('classifies Swords to Plowshares as removal (categories includes "Removal")', () => {
    const card = makeCard({
      cardName: 'Swords to Plowshares',
      oracleText: 'Exile target creature. Its controller gains life equal to its power.',
      typeLine: 'Instant',
      manaCost: '{W}',
      cmc: 1,
      categories: '["Removal"]',
    })
    const result = classifyCard(card)
    expect(result).toContain('removal')
  })

  it('classifies Counterspell as a counterspell (Instant + "counter target")', () => {
    const card = makeCard({
      cardName: 'Counterspell',
      oracleText: 'Counter target spell.',
      typeLine: 'Instant',
      manaCost: '{U}{U}',
      cmc: 2,
      categories: '[]',
    })
    const result = classifyCard(card)
    expect(result).toContain('counterspell')
  })

  it('classifies Wrath of God as a board wipe (oracle text "destroy all")', () => {
    const card = makeCard({
      cardName: 'Wrath of God',
      oracleText: "Destroy all creatures. They can't be regenerated.",
      typeLine: 'Sorcery',
      manaCost: '{2}{W}{W}',
      cmc: 4,
      categories: '[]',
    })
    const result = classifyCard(card)
    expect(result).toContain('boardWipe')
  })

  it('classifies Sol Ring as fast mana (cmc ≤ 2 + oracle text "add" + mana symbol)', () => {
    const card = makeCard({
      cardName: 'Sol Ring',
      oracleText: '{T}: Add {C}{C}.',
      typeLine: 'Artifact',
      manaCost: '{1}',
      cmc: 1,
      categories: '["Ramp"]',
    })
    const result = classifyCard(card)
    expect(result).toContain('fastMana')
  })

  it('classifies a multi-category card (removal + board wipe)', () => {
    const card = makeCard({
      cardName: 'Cyclonic Rift',
      oracleText: 'Return target nonland permanent you don\'t control to its owner\'s hand. Overload {6}{U} (You may cast this spell for its overload cost. If you do, change "target" to "each".) — Exile all nonland permanents you don\'t control.',
      typeLine: 'Instant',
      manaCost: '{1}{U}',
      cmc: 2,
      categories: '["Removal", "Board Wipe"]',
    })
    const result = classifyCard(card)
    expect(result).toContain('removal')
    expect(result).toContain('boardWipe')
  })

  it('returns empty array for a vanilla creature with no matching categories', () => {
    const card = makeCard({
      cardName: 'Grizzly Bears',
      oracleText: '',
      typeLine: 'Creature — Bear',
      manaCost: '{1}{G}',
      cmc: 2,
      categories: '[]',
    })
    const result = classifyCard(card)
    expect(result).toHaveLength(0)
  })

  it('detects tutor from categories even when oracle text has no match', () => {
    const card = makeCard({
      cardName: 'Worldly Tutor',
      oracleText: 'Search your library for a creature card, reveal it, then shuffle and put it on top.',
      typeLine: 'Instant',
      manaCost: '{G}',
      cmc: 1,
      categories: '["Tutor"]',
    })
    const result = classifyCard(card)
    expect(result).toContain('tutor')
  })

  it('detects draw engine from oracle text even when categories is empty', () => {
    const card = makeCard({
      cardName: 'Harmonize',
      oracleText: 'Draw a card. Draw a card. Draw a card.',
      typeLine: 'Sorcery',
      manaCost: '{2}{G}{G}',
      cmc: 4,
      categories: '[]',
    })
    const result = classifyCard(card)
    expect(result).toContain('drawEngine')
  })

  it('does not classify a high-CMC ramp card as fast mana', () => {
    const card = makeCard({
      cardName: 'Boundless Realms',
      oracleText: 'Search your library for up to X basic land cards...',
      typeLine: 'Sorcery',
      manaCost: '{6}{G}',
      cmc: 7,
      categories: '["Ramp"]',
    })
    const result = classifyCard(card)
    expect(result).not.toContain('fastMana')
  })

  it('does not classify a non-instant as counterspell', () => {
    const card = makeCard({
      cardName: 'Mystic Snake',
      oracleText: 'When Mystic Snake enters the battlefield, counter target spell.',
      typeLine: 'Creature — Snake',
      manaCost: '{1}{G}{U}{U}',
      cmc: 4,
      categories: '[]',
    })
    const result = classifyCard(card)
    expect(result).not.toContain('counterspell')
  })

  it('handles malformed categories JSON gracefully', () => {
    const card = makeCard({
      cardName: 'Bad Data Card',
      oracleText: 'Draw a card.',
      typeLine: 'Sorcery',
      cmc: 2,
      categories: 'not valid json',
    })
    // Should still classify from oracle text
    const result = classifyCard(card)
    expect(result).toContain('drawEngine')
  })

  it('uses case-insensitive matching on oracle text', () => {
    const card = makeCard({
      cardName: 'UPPER CASE TUTOR',
      oracleText: 'SEARCH YOUR LIBRARY for a card.',
      typeLine: 'Sorcery',
      cmc: 2,
      categories: '[]',
    })
    const result = classifyCard(card)
    expect(result).toContain('tutor')
  })

  it('classifies fast mana via oracle text add + mana symbol without Ramp category', () => {
    const card = makeCard({
      cardName: 'Mana Crypt',
      oracleText: 'At the beginning of your upkeep, flip a coin. If you lose the flip, Mana Crypt deals 3 damage to you.\n{T}: Add {C}{C}.',
      typeLine: 'Artifact',
      manaCost: '{0}',
      cmc: 0,
      categories: '[]',
    })
    const result = classifyCard(card)
    expect(result).toContain('fastMana')
  })
})


describe('selectKeyCards', () => {
  function makeCard(overrides: Partial<CardData>): CardData {
    return {
      cardName: 'Test Card',
      oracleText: '',
      typeLine: 'Creature',
      manaCost: '{2}',
      cmc: 2,
      categories: '[]',
      isCommander: false,
      ...overrides,
    }
  }

  const emptyContributing: ContributingCards = {
    tutors: [],
    drawEngines: [],
    recursion: [],
    removal: [],
    counterspells: [],
    boardWipes: [],
    fastMana: [],
  }

  it('places commander first in the key cards list', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Muldrotha, the Gravetide', isCommander: true, oracleText: 'You may play lands and cast spells from your graveyard.' }),
      makeCard({ cardName: 'Sol Ring', oracleText: '{T}: Add {C}{C}.', cmc: 1, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Demonic Tutor', oracleText: 'Search your library for a card.', categories: '["Tutor"]' }),
      makeCard({ cardName: 'Eternal Witness', oracleText: 'Return target card from your graveyard to your hand.', categories: '["Recursion"]' }),
      makeCard({ cardName: 'Counterspell', oracleText: 'Counter target spell.', typeLine: 'Instant', categories: '[]' }),
      makeCard({ cardName: 'Phyrexian Arena', oracleText: 'Draw a card.', categories: '["Draw"]' }),
      makeCard({ cardName: 'Swords to Plowshares', oracleText: 'Exile target creature.', categories: '["Removal"]' }),
      makeCard({ cardName: 'Wrath of God', oracleText: 'Destroy all creatures.', cmc: 4, categories: '[]' }),
      makeCard({ cardName: 'Reanimate', oracleText: 'Return target creature from your graveyard to the battlefield.', categories: '["Recursion"]' }),
    ]

    const result = selectKeyCards(cards, emptyContributing, [])
    expect(result[0].cardName).toBe('Muldrotha, the Gravetide')
    expect(result[0].priorityTier).toBe('commander')
  })

  it('places combo pieces after commander', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Korvold', isCommander: true }),
      makeCard({ cardName: 'Food Chain', oracleText: 'Exile a creature you control: Add X mana.', cmc: 3, categories: '[]' }),
      makeCard({ cardName: 'Eternal Scourge', oracleText: 'You may cast this from exile.', cmc: 3, categories: '[]' }),
      makeCard({ cardName: 'Sol Ring', oracleText: '{T}: Add {C}{C}.', cmc: 1, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Demonic Tutor', oracleText: 'Search your library for a card.', categories: '["Tutor"]' }),
      makeCard({ cardName: 'Phyrexian Arena', oracleText: 'Draw a card.', categories: '["Draw"]' }),
      makeCard({ cardName: 'Beast Within', categories: '["Removal"]' }),
      makeCard({ cardName: 'Arcane Signet', oracleText: '{T}: Add one mana.', cmc: 2, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Birds of Paradise', oracleText: '{T}: Add one mana of any color.', cmc: 1, categories: '["Ramp"]' }),
    ]

    const comboCards = ['Food Chain', 'Eternal Scourge']
    const result = selectKeyCards(cards, emptyContributing, comboCards)

    expect(result[0].priorityTier).toBe('commander')
    expect(result[1].priorityTier).toBe('combo')
    expect(result[2].priorityTier).toBe('combo')
    expect(['Food Chain', 'Eternal Scourge']).toContain(result[1].cardName)
    expect(['Food Chain', 'Eternal Scourge']).toContain(result[2].cardName)
  })

  it('places multi-category cards after combo pieces', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Korvold', isCommander: true }),
      makeCard({ cardName: 'Cyclonic Rift', oracleText: 'Exile all nonland permanents.', typeLine: 'Instant', cmc: 2, categories: '["Removal", "Board Wipe"]' }),
      makeCard({ cardName: 'Sol Ring', oracleText: '{T}: Add {C}{C}.', cmc: 1, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Phyrexian Arena', oracleText: 'Draw a card.', categories: '["Draw"]' }),
      makeCard({ cardName: 'Beast Within', categories: '["Removal"]' }),
      makeCard({ cardName: 'Eternal Witness', oracleText: 'Return target card from your graveyard to your hand.', categories: '["Recursion"]' }),
      makeCard({ cardName: 'Counterspell', oracleText: 'Counter target spell.', typeLine: 'Instant' }),
      makeCard({ cardName: 'Arcane Signet', oracleText: '{T}: Add one mana.', cmc: 2, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Birds of Paradise', oracleText: '{T}: Add one mana of any color.', cmc: 1, categories: '["Ramp"]' }),
    ]

    const result = selectKeyCards(cards, emptyContributing, [])

    expect(result[0].priorityTier).toBe('commander')
    // Cyclonic Rift has 2 categories (removal + boardWipe) -> multi-category
    expect(result[1].cardName).toBe('Cyclonic Rift')
    expect(result[1].priorityTier).toBe('multi-category')
  })

  it('fills synergy tier after other tiers', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Korvold', isCommander: true }),
      makeCard({ cardName: 'Sol Ring', oracleText: '{T}: Add {C}{C}.', cmc: 1, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Demonic Tutor', oracleText: 'Search your library for a card.', categories: '["Tutor"]' }),
      makeCard({ cardName: 'Phyrexian Arena', oracleText: 'Draw a card.', categories: '["Draw"]' }),
      makeCard({ cardName: 'Beast Within', categories: '["Removal"]' }),
      makeCard({ cardName: 'Eternal Witness', oracleText: 'Return target card from your graveyard to your hand.', categories: '["Recursion"]' }),
      makeCard({ cardName: 'Counterspell', oracleText: 'Counter target spell.', typeLine: 'Instant' }),
      makeCard({ cardName: 'Arcane Signet', oracleText: '{T}: Add one mana.', cmc: 2, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Nature\'s Claim', categories: '["Removal"]' }),
      makeCard({ cardName: 'Mystic Remora', oracleText: 'Draw a card.', categories: '["Draw"]' }),
    ]

    const result = selectKeyCards(cards, emptyContributing, [])

    // Commander first, then rest are synergy (single-category each)
    expect(result[0].priorityTier).toBe('commander')
    // The remaining cards should all be 'synergy' tier (single category each)
    const synergyCards = result.filter(kc => kc.priorityTier === 'synergy')
    expect(synergyCards.length).toBeGreaterThan(0)
  })

  it('returns between 8 and 10 cards for a deck with many qualifying cards', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Commander', isCommander: true }),
      makeCard({ cardName: 'Tutor 1', oracleText: 'Search your library for a card.', categories: '["Tutor"]' }),
      makeCard({ cardName: 'Tutor 2', oracleText: 'Search your library for a card.', categories: '["Tutor"]' }),
      makeCard({ cardName: 'Draw 1', oracleText: 'Draw a card.', categories: '["Draw"]' }),
      makeCard({ cardName: 'Draw 2', oracleText: 'Draw a card.', categories: '["Draw"]' }),
      makeCard({ cardName: 'Removal 1', categories: '["Removal"]' }),
      makeCard({ cardName: 'Removal 2', categories: '["Removal"]' }),
      makeCard({ cardName: 'Recursion 1', oracleText: 'Return target card from your graveyard to your hand.', categories: '["Recursion"]' }),
      makeCard({ cardName: 'Ramp 1', oracleText: '{T}: Add {G}.', cmc: 1, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Ramp 2', oracleText: '{T}: Add {G}.', cmc: 1, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Ramp 3', oracleText: '{T}: Add {G}.', cmc: 2, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Multi 1', oracleText: 'Search your library for a card. Draw a card.', categories: '["Tutor", "Draw"]' }),
      makeCard({ cardName: 'Counter 1', oracleText: 'Counter target spell.', typeLine: 'Instant' }),
    ]

    const result = selectKeyCards(cards, emptyContributing, [])
    expect(result.length).toBeGreaterThanOrEqual(8)
    expect(result.length).toBeLessThanOrEqual(10)
  })

  it('stops at 10 cards even when more qualifying cards exist', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Commander', isCommander: true }),
      ...Array.from({ length: 15 }, (_, i) =>
        makeCard({ cardName: `Tutor ${i}`, oracleText: 'Search your library for a card.', categories: '["Tutor"]' })
      ),
    ]

    const result = selectKeyCards(cards, emptyContributing, [])
    expect(result.length).toBe(10)
  })

  it('returns all matching cards when fewer than 8 qualify', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Commander', isCommander: true }),
      makeCard({ cardName: 'Sol Ring', oracleText: '{T}: Add {C}{C}.', cmc: 1, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Vanilla 1', oracleText: '' }),
      makeCard({ cardName: 'Vanilla 2', oracleText: '' }),
      makeCard({ cardName: 'Vanilla 3', oracleText: '' }),
    ]

    const result = selectKeyCards(cards, emptyContributing, [])
    // Only commander + Sol Ring qualify (2 cards)
    expect(result.length).toBe(2)
    expect(result.length).toBeLessThan(8)
  })

  it('does not duplicate cards across tiers', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Korvold', isCommander: true }),
      // This card is both a combo piece AND multi-category
      makeCard({ cardName: 'Food Chain', oracleText: 'Search your library for a card. Draw a card.', cmc: 3, categories: '["Tutor", "Draw"]' }),
      makeCard({ cardName: 'Sol Ring', oracleText: '{T}: Add {C}{C}.', cmc: 1, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Demonic Tutor', oracleText: 'Search your library for a card.', categories: '["Tutor"]' }),
      makeCard({ cardName: 'Phyrexian Arena', oracleText: 'Draw a card.', categories: '["Draw"]' }),
      makeCard({ cardName: 'Beast Within', categories: '["Removal"]' }),
      makeCard({ cardName: 'Eternal Witness', oracleText: 'Return target card from your graveyard to your hand.', categories: '["Recursion"]' }),
      makeCard({ cardName: 'Ramp 1', oracleText: '{T}: Add {G}.', cmc: 1, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Ramp 2', oracleText: '{T}: Add {G}.', cmc: 2, categories: '["Ramp"]' }),
    ]

    const comboCards = ['Food Chain']
    const result = selectKeyCards(cards, emptyContributing, comboCards)

    // Food Chain should appear only once (as combo piece, not also as multi-category)
    const foodChainEntries = result.filter(kc => kc.cardName === 'Food Chain')
    expect(foodChainEntries.length).toBe(1)
    expect(foodChainEntries[0].priorityTier).toBe('combo')
  })

  it('generates reasons with max 150 characters', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Commander', isCommander: true }),
      makeCard({ cardName: 'Food Chain', categories: '["Ramp"]', cmc: 1, oracleText: '{T}: Add {G}.' }),
      makeCard({ cardName: 'Eternal Witness', oracleText: 'Return target card from your graveyard to your hand.', categories: '["Recursion"]' }),
      makeCard({ cardName: 'Multi Card', oracleText: 'Search your library for a card. Draw a card.', categories: '["Tutor", "Draw"]' }),
      makeCard({ cardName: 'Removal 1', categories: '["Removal"]' }),
      makeCard({ cardName: 'Removal 2', categories: '["Removal"]' }),
      makeCard({ cardName: 'Draw 1', oracleText: 'Draw a card.', categories: '["Draw"]' }),
      makeCard({ cardName: 'Draw 2', oracleText: 'Draw a card.', categories: '["Draw"]' }),
      makeCard({ cardName: 'Ramp 1', oracleText: '{T}: Add {G}.', cmc: 1, categories: '["Ramp"]' }),
    ]

    const comboCards = ['Food Chain']
    const result = selectKeyCards(cards, emptyContributing, comboCards)

    for (const keyCard of result) {
      expect(keyCard.reason.length).toBeLessThanOrEqual(150)
    }
  })

  it('assigns correct priority tier labels', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Commander', isCommander: true }),
      makeCard({ cardName: 'Combo A', oracleText: 'Do something.', categories: '["Removal"]' }),
      makeCard({ cardName: 'Multi Role', oracleText: 'Search your library for a card. Return target card from your graveyard to your hand.', categories: '["Tutor"]' }),
      makeCard({ cardName: 'Single Role', oracleText: 'Draw a card.', categories: '["Draw"]' }),
      makeCard({ cardName: 'Ramp 1', oracleText: '{T}: Add {G}.', cmc: 1, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Ramp 2', oracleText: '{T}: Add {G}.', cmc: 2, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Removal 1', categories: '["Removal"]' }),
      makeCard({ cardName: 'Draw 1', oracleText: 'Draw a card.', categories: '["Draw"]' }),
      makeCard({ cardName: 'Counter 1', oracleText: 'Counter target spell.', typeLine: 'Instant' }),
    ]

    const comboCards = ['Combo A']
    const result = selectKeyCards(cards, emptyContributing, comboCards)

    const tiers = result.map(kc => kc.priorityTier)
    expect(tiers[0]).toBe('commander')
    expect(tiers[1]).toBe('combo')

    // Valid tier values
    for (const keyCard of result) {
      expect(['commander', 'combo', 'multi-category', 'synergy']).toContain(keyCard.priorityTier)
    }
  })

  it('sorts within a tier by category count (descending)', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Commander', isCommander: true }),
      // 3 categories: tutor + drawEngine + fastMana (cmc ≤ 2, Ramp category)
      makeCard({ cardName: 'Triple Role', oracleText: 'Search your library for a card. Draw a card.', cmc: 1, categories: '["Tutor", "Draw", "Ramp"]' }),
      // 2 categories: removal + boardWipe
      makeCard({ cardName: 'Double Role', oracleText: 'Destroy all creatures.', categories: '["Removal"]' }),
      makeCard({ cardName: 'Single 1', categories: '["Removal"]' }),
      makeCard({ cardName: 'Single 2', oracleText: 'Draw a card.', categories: '["Draw"]' }),
      makeCard({ cardName: 'Single 3', oracleText: '{T}: Add {G}.', cmc: 1, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Single 4', categories: '["Removal"]' }),
      makeCard({ cardName: 'Single 5', oracleText: 'Draw a card.', categories: '["Draw"]' }),
      makeCard({ cardName: 'Single 6', oracleText: '{T}: Add {G}.', cmc: 2, categories: '["Ramp"]' }),
    ]

    const result = selectKeyCards(cards, emptyContributing, [])

    // After commander, multi-category cards should appear first, with Triple Role (3 cats) before Double Role (2 cats)
    const multiCatCards = result.filter(kc => kc.priorityTier === 'multi-category')
    expect(multiCatCards.length).toBeGreaterThanOrEqual(2)
    expect(multiCatCards[0].cardName).toBe('Triple Role')
    expect(multiCatCards[1].cardName).toBe('Double Role')
  })

  it('commander that is also a combo piece only appears once as commander', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Korvold', isCommander: true }),
      makeCard({ cardName: 'Sol Ring', oracleText: '{T}: Add {C}{C}.', cmc: 1, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Tutor 1', oracleText: 'Search your library for a card.', categories: '["Tutor"]' }),
      makeCard({ cardName: 'Draw 1', oracleText: 'Draw a card.', categories: '["Draw"]' }),
      makeCard({ cardName: 'Removal 1', categories: '["Removal"]' }),
      makeCard({ cardName: 'Recursion 1', oracleText: 'Return target card from your graveyard to your hand.', categories: '["Recursion"]' }),
      makeCard({ cardName: 'Ramp 1', oracleText: '{T}: Add {G}.', cmc: 2, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Ramp 2', oracleText: '{T}: Add {G}.', cmc: 1, categories: '["Ramp"]' }),
    ]

    // Commander is listed as a combo card
    const comboCards = ['Korvold', 'Sol Ring']
    const result = selectKeyCards(cards, emptyContributing, comboCards)

    const korvoldEntries = result.filter(kc => kc.cardName === 'Korvold')
    expect(korvoldEntries.length).toBe(1)
    expect(korvoldEntries[0].priorityTier).toBe('commander')
  })

  it('returns empty array when no cards qualify (all vanilla, no commander)', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Vanilla 1', oracleText: '' }),
      makeCard({ cardName: 'Vanilla 2', oracleText: '' }),
      makeCard({ cardName: 'Vanilla 3', oracleText: '' }),
    ]

    const result = selectKeyCards(cards, emptyContributing, [])
    expect(result).toHaveLength(0)
  })
})


describe('identifyWeaknesses', () => {
  function makeCard(overrides: Partial<CardData>): CardData {
    return {
      cardName: 'Test Card',
      oracleText: '',
      typeLine: 'Creature',
      manaCost: '{2}',
      cmc: 2,
      categories: '[]',
      isCommander: false,
      ...overrides,
    }
  }

  const baseContributing: ContributingCards = {
    tutors: [],
    drawEngines: [],
    recursion: [],
    removal: [],
    counterspells: [],
    boardWipes: [],
    fastMana: [],
  }

  const highScores: AttributeScores = {
    consistency: 7,
    resilience: 7,
    interaction: 7,
    speed: 7,
  }

  it('detects graveyard dependency as Critical when recursion >= 5 and < 2 protection cards', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Muldrotha', isCommander: true, oracleText: 'You may play permanents from your graveyard.' }),
      makeCard({ cardName: 'Eternal Witness', oracleText: 'Return target card from your graveyard to your hand.' }),
      makeCard({ cardName: 'Regrowth', oracleText: 'Return target card from your graveyard to your hand.' }),
      makeCard({ cardName: 'Reanimate', oracleText: 'Return target creature card from your graveyard to the battlefield.' }),
      makeCard({ cardName: 'Animate Dead', oracleText: 'Return target creature card from your graveyard to the battlefield.' }),
      makeCard({ cardName: 'Sun Titan', oracleText: 'Return target permanent with mana value 3 or less from your graveyard to the battlefield.' }),
      // No graveyard protection cards (no "shuffle" + "graveyard" or "return" + "from exile")
      makeCard({ cardName: 'Sol Ring', oracleText: '{T}: Add {C}{C}.', typeLine: 'Artifact', cmc: 1 }),
    ]

    const contributing: ContributingCards = {
      ...baseContributing,
      recursion: ['Eternal Witness', 'Regrowth', 'Reanimate', 'Animate Dead', 'Sun Titan'],
    }

    const result = identifyWeaknesses(cards, contributing, highScores, 'Muldrotha')

    const graveyardWeakness = result.find((w) => w.description.includes('graveyard'))
    expect(graveyardWeakness).toBeDefined()
    expect(graveyardWeakness!.severity).toBe('Critical')
    expect(graveyardWeakness!.hateCards).toContain('Rest in Peace')
    expect(graveyardWeakness!.hateCards).toContain("Grafdigger's Cage")
  })

  it('detects graveyard dependency as Moderate when recursion >= 5 and >= 2 protection cards', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Muldrotha', isCommander: true, oracleText: 'You may play permanents from your graveyard.' }),
      makeCard({ cardName: 'Eternal Witness', oracleText: 'Return target card from your graveyard to your hand.' }),
      makeCard({ cardName: 'Regrowth', oracleText: 'Return target card from your graveyard to your hand.' }),
      makeCard({ cardName: 'Reanimate', oracleText: 'Return target creature card from your graveyard to the battlefield.' }),
      makeCard({ cardName: 'Animate Dead', oracleText: 'Return target creature card from your graveyard to the battlefield.' }),
      makeCard({ cardName: 'Sun Titan', oracleText: 'Return target permanent from your graveyard to the battlefield.' }),
      // Graveyard protection: cards with "shuffle" + "graveyard"
      makeCard({ cardName: "Gaea's Blessing", oracleText: 'Shuffle target card from your graveyard into your library.' }),
      makeCard({ cardName: 'Eldrazi Titan', oracleText: 'When this is put into a graveyard, shuffle your graveyard into your library.' }),
    ]

    const contributing: ContributingCards = {
      ...baseContributing,
      recursion: ['Eternal Witness', 'Regrowth', 'Reanimate', 'Animate Dead', 'Sun Titan'],
    }

    const result = identifyWeaknesses(cards, contributing, highScores, 'Muldrotha')

    const graveyardWeakness = result.find((w) => w.description.includes('graveyard'))
    expect(graveyardWeakness).toBeDefined()
    expect(graveyardWeakness!.severity).toBe('Moderate')
  })

  it('detects low interaction as Moderate when interaction score <= 3', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Commander', isCommander: true, oracleText: 'Tap: Create a token.' }),
      makeCard({ cardName: 'Creature 1', oracleText: '' }),
      makeCard({ cardName: 'Creature 2', oracleText: '' }),
    ]

    const lowInteractionScores: AttributeScores = {
      consistency: 5,
      resilience: 5,
      interaction: 2,
      speed: 5,
    }

    const result = identifyWeaknesses(cards, baseContributing, lowInteractionScores, 'Commander')

    const interactionWeakness = result.find((w) => w.description.includes('interaction'))
    expect(interactionWeakness).toBeDefined()
    expect(interactionWeakness!.severity).toBe('Moderate')
    expect(interactionWeakness!.hateCards).toContain('Stax pieces')
    expect(interactionWeakness!.hateCards).toContain('fast combo decks')
  })

  it('detects slow speed as Moderate when speed score <= 3', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Commander', isCommander: true, oracleText: 'Tap: Create a token.' }),
    ]

    const slowScores: AttributeScores = {
      consistency: 5,
      resilience: 5,
      interaction: 5,
      speed: 3,
    }

    const result = identifyWeaknesses(cards, baseContributing, slowScores, 'Commander')

    const speedWeakness = result.find((w) => w.description.includes('speed') || w.description.includes('Slow'))
    expect(speedWeakness).toBeDefined()
    expect(speedWeakness!.severity).toBe('Moderate')
    expect(speedWeakness!.hateCards).toContain('Aggressive decks')
    expect(speedWeakness!.hateCards).toContain('fast combo')
  })

  it('detects artifact-heavy vulnerability as Minor when >= 10 artifacts and < 2 artifact recursion', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Commander', isCommander: true, oracleText: 'Tap: Create a token.' }),
      ...Array.from({ length: 12 }, (_, i) =>
        makeCard({ cardName: `Artifact ${i}`, oracleText: '{T}: Do something.', typeLine: 'Artifact' })
      ),
    ]

    const result = identifyWeaknesses(cards, baseContributing, highScores, 'Commander')

    const artifactWeakness = result.find((w) => w.description.includes('Artifact-heavy') || w.description.includes('artifact'))
    expect(artifactWeakness).toBeDefined()
    expect(artifactWeakness!.severity).toBe('Minor')
    expect(artifactWeakness!.hateCards).toContain('Collector Ouphe')
    expect(artifactWeakness!.hateCards).toContain('Null Rod')
    expect(artifactWeakness!.hateCards).toContain('Stony Silence')
    expect(artifactWeakness!.hateCards).toContain('Vandalblast')
  })

  it('returns empty array when no weaknesses are detected', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Commander', isCommander: true, oracleText: 'Tap: Create a token.' }),
      makeCard({ cardName: 'Hexproof Boots', oracleText: 'Equipped creature has hexproof and indestructible.', typeLine: 'Artifact — Equipment' }),
      makeCard({ cardName: 'Counterspell', oracleText: 'Counter target spell.', typeLine: 'Instant' }),
      makeCard({ cardName: 'Creature 1', oracleText: '' }),
      makeCard({ cardName: 'Creature 2', oracleText: '' }),
    ]

    // Contributing cards have some recursion but not >= 5
    const contributing: ContributingCards = {
      ...baseContributing,
      recursion: ['Card A', 'Card B'],
      tutors: ['Card C', 'Card D'],
    }

    const result = identifyWeaknesses(cards, contributing, highScores, 'Commander')

    expect(result).toHaveLength(0)
  })

  it('detects commander dependency as Critical when commander provides engine and < 2 protection cards', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Korvold, Fae-Cursed King', isCommander: true, oracleText: 'Whenever you sacrifice a permanent, draw a card and put a +1/+1 counter on Korvold.' }),
      makeCard({ cardName: 'Creature 1', oracleText: '' }),
      makeCard({ cardName: 'Creature 2', oracleText: '' }),
    ]

    const result = identifyWeaknesses(cards, baseContributing, highScores, 'Korvold, Fae-Cursed King')

    const commanderWeakness = result.find((w) => w.description.includes('commander') || w.description.includes('Commander'))
    expect(commanderWeakness).toBeDefined()
    expect(commanderWeakness!.severity).toBe('Critical')
    expect(commanderWeakness!.hateCards).toContain('Darksteel Mutation')
    expect(commanderWeakness!.hateCards).toContain('Imprisoned in the Moon')
  })

  it('detects commander dependency as Moderate when protection cards are available', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Korvold, Fae-Cursed King', isCommander: true, oracleText: 'Whenever you sacrifice a permanent, draw a card and put a +1/+1 counter on Korvold.' }),
      makeCard({ cardName: 'Lightning Greaves', oracleText: 'Equipped creature has shroud and haste.', typeLine: 'Artifact — Equipment' }),
      makeCard({ cardName: "Swiftfoot Boots", oracleText: 'Equipped creature has hexproof and haste.', typeLine: 'Artifact — Equipment' }),
      makeCard({ cardName: 'Creature 1', oracleText: '' }),
    ]

    const result = identifyWeaknesses(cards, baseContributing, highScores, 'Korvold, Fae-Cursed King')

    const commanderWeakness = result.find((w) => w.description.includes('commander') || w.description.includes('Commander'))
    expect(commanderWeakness).toBeDefined()
    expect(commanderWeakness!.severity).toBe('Moderate')
  })

  it('detects single win condition weakness when combo redundancy is low', () => {
    const contributing: ContributingCards = {
      ...baseContributing,
      recursion: ['Card A'],
      boardWipes: ['Wrath'],
      tutors: [],
    }

    const cards: CardData[] = [
      makeCard({ cardName: 'Commander', isCommander: true, oracleText: 'Tap: Create a token.' }),
    ]

    const result = identifyWeaknesses(cards, contributing, highScores, 'Commander')

    const winConWeakness = result.find((w) => w.description.includes('win condition') || w.description.includes('redundancy'))
    expect(winConWeakness).toBeDefined()
    expect(winConWeakness!.severity).toBe('Moderate')
    expect(winConWeakness!.hateCards).toContain('Surgical Extraction')
  })

  it('can detect multiple weaknesses simultaneously', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Muldrotha', isCommander: true, oracleText: 'You may play permanents from your graveyard. Draw a card whenever a permanent enters from your graveyard.' }),
      ...Array.from({ length: 5 }, (_, i) =>
        makeCard({ cardName: `Recursion ${i}`, oracleText: 'Return target card from your graveyard to your hand.' })
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeCard({ cardName: `Artifact ${i}`, oracleText: '{T}: Something.', typeLine: 'Artifact' })
      ),
    ]

    const contributing: ContributingCards = {
      ...baseContributing,
      recursion: ['Recursion 0', 'Recursion 1', 'Recursion 2', 'Recursion 3', 'Recursion 4'],
      tutors: [],
      boardWipes: [],
    }

    const lowScores: AttributeScores = {
      consistency: 5,
      resilience: 5,
      interaction: 2,
      speed: 2,
    }

    const result = identifyWeaknesses(cards, contributing, lowScores, 'Muldrotha')

    // Should have at least graveyard dependency, low interaction, slow speed, and artifact vulnerability
    expect(result.length).toBeGreaterThanOrEqual(4)

    const severities = result.map((w) => w.severity)
    expect(severities).toContain('Critical')
    expect(severities).toContain('Moderate')
    expect(severities).toContain('Minor')
  })

  it('every weakness has valid severity and non-empty hateCards', () => {
    const cards: CardData[] = [
      makeCard({ cardName: 'Muldrotha', isCommander: true, oracleText: 'Draw a card at the beginning of your upkeep.' }),
      ...Array.from({ length: 6 }, (_, i) =>
        makeCard({ cardName: `Recursion ${i}`, oracleText: 'Return target card from your graveyard to your hand.' })
      ),
    ]

    const contributing: ContributingCards = {
      ...baseContributing,
      recursion: ['Recursion 0', 'Recursion 1', 'Recursion 2', 'Recursion 3', 'Recursion 4', 'Recursion 5'],
    }

    const lowScores: AttributeScores = {
      consistency: 5,
      resilience: 5,
      interaction: 3,
      speed: 3,
    }

    const result = identifyWeaknesses(cards, contributing, lowScores, 'Muldrotha')

    for (const weakness of result) {
      expect(['Critical', 'Moderate', 'Minor']).toContain(weakness.severity)
      expect(weakness.hateCards.length).toBeGreaterThan(0)
      expect(weakness.description.length).toBeGreaterThan(0)
    }
  })
})


describe('generatePrimer', () => {
  function makeCard(overrides: Partial<CardData>): CardData {
    return {
      cardName: 'Test Card',
      oracleText: '',
      typeLine: 'Creature',
      manaCost: '{2}',
      cmc: 2,
      categories: '[]',
      isCommander: false,
      ...overrides,
    }
  }

  const sampleCards: CardData[] = [
    makeCard({ cardName: 'Muldrotha, the Gravetide', isCommander: true, oracleText: 'You may play lands and cast spells from your graveyard.', cmc: 6 }),
    makeCard({ cardName: 'Sol Ring', oracleText: '{T}: Add {C}{C}.', cmc: 1, categories: '["Ramp"]' }),
    makeCard({ cardName: 'Arcane Signet', oracleText: '{T}: Add one mana of any color in your commander\'s color identity.', cmc: 2, categories: '["Ramp"]' }),
    makeCard({ cardName: 'Demonic Tutor', oracleText: 'Search your library for a card, put that card into your hand, then shuffle.', cmc: 2, categories: '["Tutor"]' }),
    makeCard({ cardName: 'Rhystic Study', oracleText: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.', cmc: 3, categories: '["Draw"]' }),
    makeCard({ cardName: 'Eternal Witness', oracleText: 'When Eternal Witness enters the battlefield, you may return target card from your graveyard to your hand.', cmc: 3, categories: '["Recursion"]' }),
    makeCard({ cardName: 'Swords to Plowshares', oracleText: 'Exile target creature.', typeLine: 'Instant', cmc: 1, categories: '["Removal"]' }),
    makeCard({ cardName: 'Counterspell', oracleText: 'Counter target spell.', typeLine: 'Instant', cmc: 2 }),
    makeCard({ cardName: 'Thassa\'s Oracle', oracleText: 'When Thassa\'s Oracle enters the battlefield, look at the top X cards... If X is greater than or equal to the number of cards in your library, you win the game.', cmc: 2 }),
    makeCard({ cardName: 'Forest', oracleText: '', typeLine: 'Basic Land — Forest', cmc: 0, categories: '[]' }),
  ]

  const sampleKeyCards: KeyCard[] = [
    { cardName: 'Muldrotha, the Gravetide', reason: 'Commander', priorityTier: 'commander' },
    { cardName: 'Thassa\'s Oracle', reason: 'Combo win condition', priorityTier: 'combo' },
    { cardName: 'Demonic Tutor', reason: 'Multi-role tutor', priorityTier: 'multi-category' },
    { cardName: 'Rhystic Study', reason: 'Draw engine', priorityTier: 'synergy' },
    { cardName: 'Sol Ring', reason: 'Fast mana', priorityTier: 'synergy' },
  ]

  const sampleScores: AttributeScores = {
    consistency: 7,
    resilience: 6,
    interaction: 5,
    speed: 4,
  }

  it('returns a valid Primer object with all required fields', () => {
    const primer = generatePrimer('Muldrotha, the Gravetide', sampleCards, sampleKeyCards, sampleScores)

    expect(primer).toHaveProperty('coreStrategy')
    expect(primer).toHaveProperty('mulliganPriorities')
    expect(primer).toHaveProperty('keyTips')
  })

  it('coreStrategy contains the commander name', () => {
    const primer = generatePrimer('Muldrotha, the Gravetide', sampleCards, sampleKeyCards, sampleScores)

    expect(primer.coreStrategy).toContain('Muldrotha, the Gravetide')
  })

  it('coreStrategy is 2-3 sentences', () => {
    const primer = generatePrimer('Muldrotha, the Gravetide', sampleCards, sampleKeyCards, sampleScores)

    // Count sentences by splitting on '. ' and filtering non-empty
    const sentences = primer.coreStrategy.split(/\.\s+/).filter(s => s.trim().length > 0)
    // Account for the fact the last sentence ends with a period
    const sentenceCount = primer.coreStrategy.endsWith('.')
      ? sentences.length
      : sentences.length
    expect(sentenceCount).toBeGreaterThanOrEqual(2)
    expect(sentenceCount).toBeLessThanOrEqual(3)
  })

  it('coreStrategy references at least one win condition', () => {
    const primer = generatePrimer('Muldrotha, the Gravetide', sampleCards, sampleKeyCards, sampleScores)

    // Should reference Thassa's Oracle (combo keyCard) or another card
    const referencesWinCon = primer.coreStrategy.includes("Thassa's Oracle")
      || primer.coreStrategy.includes('win condition')
      || sampleCards.some(c => !c.isCommander && primer.coreStrategy.includes(c.cardName))
    expect(referencesWinCon).toBe(true)
  })

  it('mulliganPriorities has 3-5 items', () => {
    const primer = generatePrimer('Muldrotha, the Gravetide', sampleCards, sampleKeyCards, sampleScores)

    expect(primer.mulliganPriorities.length).toBeGreaterThanOrEqual(3)
    expect(primer.mulliganPriorities.length).toBeLessThanOrEqual(5)
  })

  it('each mulligan priority is at most 30 words', () => {
    const primer = generatePrimer('Muldrotha, the Gravetide', sampleCards, sampleKeyCards, sampleScores)

    for (const item of primer.mulliganPriorities) {
      const wordCount = item.split(/\s+/).filter(w => w.length > 0).length
      expect(wordCount).toBeLessThanOrEqual(30)
    }
  })

  it('keyTips has 3-5 items', () => {
    const primer = generatePrimer('Muldrotha, the Gravetide', sampleCards, sampleKeyCards, sampleScores)

    expect(primer.keyTips.length).toBeGreaterThanOrEqual(3)
    expect(primer.keyTips.length).toBeLessThanOrEqual(5)
  })

  it('each key tip is at most 30 words', () => {
    const primer = generatePrimer('Muldrotha, the Gravetide', sampleCards, sampleKeyCards, sampleScores)

    for (const tip of primer.keyTips) {
      const wordCount = tip.split(/\s+/).filter(w => w.length > 0).length
      expect(wordCount).toBeLessThanOrEqual(30)
    }
  })

  it('each key tip references at least one card name from the deck', () => {
    const primer = generatePrimer('Muldrotha, the Gravetide', sampleCards, sampleKeyCards, sampleScores)

    const allCardNames = [
      ...sampleCards.map(c => c.cardName),
      ...sampleKeyCards.map(kc => kc.cardName),
    ]

    for (const tip of primer.keyTips) {
      const referencesCard = allCardNames.some(name => tip.includes(name))
      expect(referencesCard).toBe(true)
    }
  })

  it('works with minimal deck (few cards, few key cards)', () => {
    const minimalCards: CardData[] = [
      makeCard({ cardName: 'Korvold, Fae-Cursed King', isCommander: true, cmc: 5, oracleText: 'Whenever you sacrifice a permanent, draw a card.' }),
      makeCard({ cardName: 'Sol Ring', oracleText: '{T}: Add {C}{C}.', cmc: 1, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Forest', typeLine: 'Basic Land — Forest', cmc: 0 }),
    ]

    const minimalKeyCards: KeyCard[] = [
      { cardName: 'Korvold, Fae-Cursed King', reason: 'Commander', priorityTier: 'commander' },
    ]

    const scores: AttributeScores = { consistency: 3, resilience: 3, interaction: 3, speed: 3 }
    const primer = generatePrimer('Korvold, Fae-Cursed King', minimalCards, minimalKeyCards, scores)

    expect(primer.coreStrategy).toContain('Korvold, Fae-Cursed King')
    expect(primer.mulliganPriorities.length).toBeGreaterThanOrEqual(3)
    expect(primer.keyTips.length).toBeGreaterThanOrEqual(3)
  })

  it('adjusts primer based on high speed score', () => {
    const fastScores: AttributeScores = { consistency: 5, resilience: 5, interaction: 5, speed: 9 }
    const primer = generatePrimer('Muldrotha, the Gravetide', sampleCards, sampleKeyCards, fastScores)

    // With high speed, should have more mulligan priorities
    expect(primer.mulliganPriorities.length).toBeGreaterThanOrEqual(4)
  })

  it('adjusts primer based on high-CMC commander', () => {
    const expensiveCards: CardData[] = [
      makeCard({ cardName: 'Omnath, Locus of Creation', isCommander: true, cmc: 7, oracleText: 'Landfall — Draw a card.' }),
      makeCard({ cardName: 'Sol Ring', oracleText: '{T}: Add {C}{C}.', cmc: 1, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Arcane Signet', oracleText: '{T}: Add one mana.', cmc: 2, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Cultivate', oracleText: 'Search your library for up to two basic land cards.', cmc: 3, categories: '["Ramp"]' }),
      makeCard({ cardName: 'Rhystic Study', oracleText: 'Draw a card.', cmc: 3, categories: '["Draw"]' }),
    ]

    const expensiveKeyCards: KeyCard[] = [
      { cardName: 'Omnath, Locus of Creation', reason: 'Commander', priorityTier: 'commander' },
      { cardName: 'Sol Ring', reason: 'Fast mana', priorityTier: 'synergy' },
      { cardName: 'Cultivate', reason: 'Ramp', priorityTier: 'synergy' },
    ]

    const scores: AttributeScores = { consistency: 5, resilience: 5, interaction: 5, speed: 3 }
    const primer = generatePrimer('Omnath, Locus of Creation', expensiveCards, expensiveKeyCards, scores)

    // Should mention needing more lands for high-CMC commander
    expect(primer.mulliganPriorities.length).toBeGreaterThanOrEqual(3)
    // The first mulligan priority should reference lands
    expect(primer.mulliganPriorities[0].toLowerCase()).toContain('land')
  })

  it('archetype label reflects highest score attribute', () => {
    // Speed is highest → "aggressive"
    const fastScores: AttributeScores = { consistency: 3, resilience: 3, interaction: 3, speed: 9 }
    const primer = generatePrimer('Muldrotha, the Gravetide', sampleCards, sampleKeyCards, fastScores)
    expect(primer.coreStrategy).toContain('aggressive')

    // Interaction is highest → "interactive"
    const interactiveScores: AttributeScores = { consistency: 3, resilience: 3, interaction: 9, speed: 3 }
    const primer2 = generatePrimer('Muldrotha, the Gravetide', sampleCards, sampleKeyCards, interactiveScores)
    expect(primer2.coreStrategy).toContain('interactive')
  })
})
