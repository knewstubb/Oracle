import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  classifyCard,
  selectKeyCards,
  generatePrimer,
  computeAttributeScores,
  identifyWeaknesses,
  type CardData,
  type ScoringCategory,
  type ContributingCards,
  type KeyCard,
  type AttributeScores,
  type Weakness,
  type WeaknessSeverity,
} from './rating-engine'

/**
 * Map ScoringCategory values to their corresponding ContributingCards keys.
 */
const CATEGORY_TO_CONTRIBUTING_KEY: Record<ScoringCategory, keyof ContributingCards> = {
  tutor: 'tutors',
  drawEngine: 'drawEngines',
  recursion: 'recursion',
  removal: 'removal',
  counterspell: 'counterspells',
  boardWipe: 'boardWipes',
  fastMana: 'fastMana',
}

/**
 * Build a ContributingCards map from a list of cards by classifying each card
 * and placing its name into the appropriate contributing card lists.
 */
function buildContributingCards(cards: CardData[]): ContributingCards {
  const contributing: ContributingCards = {
    tutors: [],
    drawEngines: [],
    recursion: [],
    removal: [],
    counterspells: [],
    boardWipes: [],
    fastMana: [],
  }

  for (const card of cards) {
    const categories = classifyCard(card)
    for (const category of categories) {
      const key = CATEGORY_TO_CONTRIBUTING_KEY[category]
      contributing[key].push(card.cardName)
    }
  }

  return contributing
}

/**
 * Generator for CardData that is designed to match multiple scoring categories.
 * We craft oracle text and categories fields to trigger 2+ classification rules.
 */
const multiCategoryCardArb: fc.Arbitrary<CardData> = fc.record({
  cardName: fc.string({ minLength: 1, maxLength: 30 }).map(s => `Card_${s.replace(/\s/g, '_')}`),
  // Combine oracle text patterns that trigger multiple categories
  oracleText: fc.constantFrom(
    // Tutor + Draw Engine: "search your library" + "draw a card"
    'Search your library for a card, then draw a card.',
    // Tutor + Recursion: "search your library" + "return...from your graveyard"
    'Search your library for a card. Return target card from your graveyard to your hand.',
    // Draw Engine + Recursion: "draw a card" + "return...from your graveyard"
    'Draw a card. You may return target creature card from your graveyard to the battlefield.',
    // Board Wipe + Removal (via oracle "destroy all" + categories "Removal")
    'Destroy all creatures. They can\'t be regenerated.',
    // Fast Mana + Tutor: "add {G}" + "search your library" (cmc must be ≤ 2)
    '{T}: Add {G}. {T}, Sacrifice: Search your library for a basic land card.',
    // Counterspell needs Instant type line + "counter target" — combined with removal via categories
    'Counter target spell. Exile target creature.',
    // Tutor + Board Wipe: "search your library" + "exile all"
    'Exile all creatures. Then search your library for a card and put it into your hand.',
    // Recursion + Draw: "return...from your graveyard" + "draw a card"
    'Return target card from your graveyard to your hand. Draw a card.',
    // Fast Mana + Draw: "{T}: Add {C}" + "draw a card" (cmc ≤ 2)
    '{T}: Add {C}. When this enters the battlefield, draw a card.',
  ),
  typeLine: fc.constantFrom(
    'Instant',
    'Sorcery',
    'Creature — Human Wizard',
    'Artifact',
    'Enchantment',
  ),
  manaCost: fc.constantFrom('{0}', '{1}', '{2}', '{1}{G}', '{U}{U}', '{1}{B}', '{W}'),
  cmc: fc.constantFrom(0, 1, 2), // Keep cmc low to enable fast mana detection
  categories: fc.constantFrom(
    '["Tutor", "Draw"]',
    '["Removal", "Board Wipe"]',
    '["Ramp", "Tutor"]',
    '["Removal", "Recursion"]',
    '["Draw", "Recursion"]',
    '["Removal"]',
    '["Tutor"]',
    '["Draw"]',
    '["Ramp"]',
    '[]',
  ),
  isCommander: fc.constant(false),
})

describe('Feature: deck-ratings, Property 2: Multi-Category Independent Counting', () => {
  /**
   * **Validates: Requirements 1.6, 2.1**
   *
   * Property 2: Multi-Category Independent Counting
   * For any card that matches N scoring categories (where N ≥ 2), the card
   * SHALL appear in exactly N contributing card lists, and each attribute score
   * that uses those categories SHALL include that card's contribution independently.
   */
  it('a card matching N >= 2 categories appears in exactly N contributing card lists', () => {
    fc.assert(
      fc.property(multiCategoryCardArb, (card) => {
        const categories = classifyCard(card)

        // Only test cards that match 2+ categories
        if (categories.length < 2) return true // vacuously true for single-category cards

        // Build contributing cards from a single-card deck
        const contributing = buildContributingCards([card])

        // Count how many contributing lists contain this card
        let listAppearances = 0
        const allLists: (keyof ContributingCards)[] = [
          'tutors',
          'drawEngines',
          'recursion',
          'removal',
          'counterspells',
          'boardWipes',
          'fastMana',
        ]

        for (const key of allLists) {
          if (contributing[key].includes(card.cardName)) {
            listAppearances++
          }
        }

        // The card should appear in exactly N lists (one per category matched)
        expect(listAppearances).toBe(categories.length)
      }),
      { numRuns: 100 }
    )
  })

  it('each category classification maps to the correct contributing cards key', () => {
    fc.assert(
      fc.property(multiCategoryCardArb, (card) => {
        const categories = classifyCard(card)

        if (categories.length < 2) return true

        const contributing = buildContributingCards([card])

        // For each category the card was classified into, it must appear
        // in that specific contributing cards list
        for (const category of categories) {
          const key = CATEGORY_TO_CONTRIBUTING_KEY[category]
          expect(contributing[key]).toContain(card.cardName)
        }

        // And it must NOT appear in lists for categories it wasn't classified into
        const nonMatchingCategories = (
          Object.keys(CATEGORY_TO_CONTRIBUTING_KEY) as ScoringCategory[]
        ).filter((c) => !categories.includes(c))

        for (const category of nonMatchingCategories) {
          const key = CATEGORY_TO_CONTRIBUTING_KEY[category]
          expect(contributing[key]).not.toContain(card.cardName)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('multi-category cards in a deck contribute independently to each category count', () => {
    fc.assert(
      fc.property(
        fc.array(multiCategoryCardArb, { minLength: 3, maxLength: 10 }),
        (cards) => {
          // Assign unique names to avoid collisions
          const namedCards = cards.map((card, i) => ({
            ...card,
            cardName: `TestCard_${i}`,
          }))

          const contributing = buildContributingCards(namedCards)

          // For each card, verify independent counting
          for (const card of namedCards) {
            const categories = classifyCard(card)
            if (categories.length < 2) continue

            // The card should appear in exactly N lists
            let appearances = 0
            const allKeys: (keyof ContributingCards)[] = [
              'tutors',
              'drawEngines',
              'recursion',
              'removal',
              'counterspells',
              'boardWipes',
              'fastMana',
            ]

            for (const key of allKeys) {
              if (contributing[key].includes(card.cardName)) {
                appearances++
              }
            }

            expect(appearances).toBe(categories.length)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Feature: deck-ratings, Property 4: Contributing Cards Completeness', () => {
  /**
   * **Validates: Requirements 2.1**
   *
   * Property 4: Contributing Cards Completeness
   * For any deck, every card name in the contributing cards lists SHALL correspond
   * to a card that was classified into that category by classifyCard, and every
   * card classified into a category SHALL appear in that category's contributing list.
   */

  // Generator for CardData with varied oracle text patterns
  const cardDataArb: fc.Arbitrary<CardData> = fc.record({
    cardName: fc.string({ minLength: 1, maxLength: 30 }).map(s => `Card_${s.replace(/\s/g, '_')}`),
    oracleText: fc.constantFrom(
      'Search your library for a card and put it into your hand.',
      'Draw a card.',
      'Return target creature card from your graveyard to the battlefield.',
      'Counter target spell.',
      'Destroy all creatures.',
      'Exile all artifacts and enchantments.',
      '{T}: Add {G}.',
      '{T}: Add {C}{C}.',
      'Whenever a creature dies, draw a card.',
      'Search your library for a basic land card. Draw a card.',
      'Return target card from your graveyard to your hand. Draw a card.',
      'Destroy target creature or planeswalker.',
      '',
      'Flying. Vigilance.',
      'At the beginning of your upkeep, you may pay {2}. If you do, draw a card.',
    ),
    typeLine: fc.constantFrom(
      'Instant',
      'Sorcery',
      'Creature — Elf Druid',
      'Artifact',
      'Enchantment',
      'Creature — Human Wizard',
      'Land',
      'Instant — Arcane',
    ),
    manaCost: fc.constantFrom('{0}', '{1}', '{2}', '{1}{G}', '{U}{U}', '{2}{B}{B}', '{3}{W}{W}', '{R}'),
    cmc: fc.integer({ min: 0, max: 8 }),
    categories: fc.constantFrom(
      '[]',
      '["Tutor"]',
      '["Draw"]',
      '["Recursion"]',
      '["Removal"]',
      '["Board Wipe"]',
      '["Ramp"]',
      '["Tutor","Draw"]',
      '["Removal","Recursion"]',
      '["Ramp","Draw"]',
    ),
    isCommander: fc.boolean(),
  })

  const deckArb = fc.array(cardDataArb, { minLength: 5, maxLength: 20 })

  it('every card in contributing lists was classified into that category', () => {
    fc.assert(
      fc.property(deckArb, (deck) => {
        // Assign unique names to avoid collisions in contributing lists
        const namedDeck = deck.map((card, i) => ({
          ...card,
          cardName: `TestCard_${i}`,
        }))

        const contributingCards = buildContributingCards(namedDeck)

        // For each category's contributing list, verify every card name was classified into that category
        for (const [category, key] of Object.entries(CATEGORY_TO_CONTRIBUTING_KEY) as [ScoringCategory, keyof ContributingCards][]) {
          const cardNamesInList = contributingCards[key]
          for (const cardName of cardNamesInList) {
            const card = namedDeck.find(c => c.cardName === cardName)
            expect(card).toBeDefined()
            const classifiedCategories = classifyCard(card!)
            expect(classifiedCategories).toContain(category)
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it('every card classified into a category appears in that categorys contributing list', () => {
    fc.assert(
      fc.property(deckArb, (deck) => {
        // Assign unique names to avoid collisions
        const namedDeck = deck.map((card, i) => ({
          ...card,
          cardName: `TestCard_${i}`,
        }))

        const contributingCards = buildContributingCards(namedDeck)

        // For each card in the deck, verify it appears in all categories it was classified into
        for (const card of namedDeck) {
          const classifiedCategories = classifyCard(card)
          for (const cat of classifiedCategories) {
            const key = CATEGORY_TO_CONTRIBUTING_KEY[cat]
            expect(contributingCards[key]).toContain(card.cardName)
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})


// ---------------------------------------------------------------------------
// Property 5: Key Card Output Structure
// ---------------------------------------------------------------------------

describe('Feature: deck-ratings, Property 5: Key Card Output Structure', () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.3**
   *
   * Property 5: Key Card Output Structure
   * For any deck with 8 or more qualifying cards, `selectKeyCards` SHALL return
   * between 8 and 10 Key Cards inclusive, each with a reason of at most 150
   * characters, ordered such that commander appears first, then combo pieces,
   * then multi-category cards, then synergy cards.
   */

  // Generator for cards that will qualify (have at least 1 scoring category)
  const qualifyingCardArb: fc.Arbitrary<CardData> = fc.record({
    cardName: fc.string({ minLength: 1, maxLength: 20 }).map(
      (s, idx) => `Card_${s.replace(/[^a-zA-Z0-9]/g, 'x')}_${Math.random().toString(36).slice(2, 6)}`
    ),
    oracleText: fc.constantFrom(
      'Search your library for a card and put it into your hand.',
      'Draw a card. Then draw another card.',
      'Return target creature card from your graveyard to the battlefield.',
      'Counter target spell.',
      'Destroy all creatures.',
      '{T}: Add {G}.',
      '{T}: Add {C}.',
      'Search your library for a basic land card and draw a card.',
      'Return target card from your graveyard to your hand. Draw a card.',
      'Destroy target creature. Draw a card.',
      'Exile all artifacts and enchantments.',
      'Search your library for a creature card. Return target card from your graveyard.',
    ),
    typeLine: fc.constantFrom(
      'Instant',
      'Sorcery',
      'Creature — Elf Druid',
      'Artifact',
      'Enchantment',
      'Creature — Human Wizard',
    ),
    manaCost: fc.constantFrom('{0}', '{1}', '{2}', '{1}{G}', '{U}', '{R}'),
    cmc: fc.constantFrom(0, 1, 2),
    categories: fc.constantFrom(
      '["Tutor"]',
      '["Draw"]',
      '["Recursion"]',
      '["Removal"]',
      '["Ramp"]',
      '["Board Wipe"]',
      '["Tutor","Draw"]',
      '["Removal","Recursion"]',
      '["Ramp","Draw"]',
    ),
    isCommander: fc.constant(false),
  })

  // Generate a deck with 1 commander + many qualifying cards
  const deckWithEnoughQualifyingCardsArb = fc
    .array(qualifyingCardArb, { minLength: 12, maxLength: 25 })
    .map((cards) => {
      // Assign unique names and make first card the commander
      const uniqueCards = cards.map((card, i) => ({
        ...card,
        cardName: `TestCard_${i}`,
        isCommander: i === 0,
      }))
      return uniqueCards
    })

  // Generator for combo card names (a subset of card names from the deck)
  function comboCardsFromDeck(deck: CardData[]): string[] {
    // Pick 2-3 non-commander cards as combo pieces
    const nonCommanders = deck.filter((c) => !c.isCommander)
    return nonCommanders.slice(0, 3).map((c) => c.cardName)
  }

  // Define tier ordering
  const TIER_ORDER: Record<KeyCard['priorityTier'], number> = {
    commander: 0,
    combo: 1,
    'multi-category': 2,
    synergy: 3,
  }

  it('returns 8-10 key cards when deck has 8+ qualifying cards', () => {
    fc.assert(
      fc.property(deckWithEnoughQualifyingCardsArb, (deck) => {
        const contributingCards = buildContributingCards(deck)
        const comboCards = comboCardsFromDeck(deck)

        const result = selectKeyCards(deck, contributingCards, comboCards)

        // Count qualifying cards: cards that have at least 1 category OR are commander OR are combo
        const comboSet = new Set(comboCards)
        const qualifyingCount = deck.filter((card) => {
          if (card.isCommander) return true
          if (comboSet.has(card.cardName)) return true
          return classifyCard(card).length >= 1
        }).length

        // Only assert 8-10 range when there are genuinely 8+ qualifying cards
        if (qualifyingCount >= 8) {
          expect(result.length).toBeGreaterThanOrEqual(8)
          expect(result.length).toBeLessThanOrEqual(10)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('every key card has a reason of at most 150 characters', () => {
    fc.assert(
      fc.property(deckWithEnoughQualifyingCardsArb, (deck) => {
        const contributingCards = buildContributingCards(deck)
        const comboCards = comboCardsFromDeck(deck)

        const result = selectKeyCards(deck, contributingCards, comboCards)

        for (const keyCard of result) {
          expect(keyCard.reason.length).toBeLessThanOrEqual(150)
          expect(keyCard.reason.length).toBeGreaterThan(0)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('commander is always the first card when present', () => {
    fc.assert(
      fc.property(deckWithEnoughQualifyingCardsArb, (deck) => {
        const contributingCards = buildContributingCards(deck)
        const comboCards = comboCardsFromDeck(deck)

        const result = selectKeyCards(deck, contributingCards, comboCards)

        // Deck always has a commander (index 0)
        const hasCommander = deck.some((c) => c.isCommander)
        if (hasCommander && result.length > 0) {
          expect(result[0].priorityTier).toBe('commander')
        }
      }),
      { numRuns: 100 }
    )
  })

  it('cards are ordered: commander → combo → multi-category → synergy (tiers do not interleave)', () => {
    fc.assert(
      fc.property(deckWithEnoughQualifyingCardsArb, (deck) => {
        const contributingCards = buildContributingCards(deck)
        const comboCards = comboCardsFromDeck(deck)

        const result = selectKeyCards(deck, contributingCards, comboCards)

        // Verify non-decreasing tier order
        for (let i = 1; i < result.length; i++) {
          const prevTierOrder = TIER_ORDER[result[i - 1].priorityTier]
          const currTierOrder = TIER_ORDER[result[i].priorityTier]
          expect(currTierOrder).toBeGreaterThanOrEqual(prevTierOrder)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('each key card has a valid priorityTier value', () => {
    fc.assert(
      fc.property(deckWithEnoughQualifyingCardsArb, (deck) => {
        const contributingCards = buildContributingCards(deck)
        const comboCards = comboCardsFromDeck(deck)

        const result = selectKeyCards(deck, contributingCards, comboCards)

        const validTiers: KeyCard['priorityTier'][] = [
          'commander',
          'combo',
          'multi-category',
          'synergy',
        ]

        for (const keyCard of result) {
          expect(validTiers).toContain(keyCard.priorityTier)
        }
      }),
      { numRuns: 100 }
    )
  })
})


describe('Feature: deck-ratings, Property 6: Primer Structural Validity', () => {
  /**
   * **Validates: Requirements 4.1, 4.2, 4.3**
   *
   * Property 6: Primer Structural Validity
   * For any deck, the generated Primer SHALL have:
   * - coreStrategy of 2-3 sentences that includes the commander name
   * - mulliganPriorities of 3-5 items each containing at most 30 words
   * - keyTips of 3-5 items each containing at most 30 words where each tip
   *   references at least one card name present in the deck
   */

  // Import generatePrimer, selectKeyCards, and related types
  // (already imported classifyCard, CardData, ContributingCards at top of file)

  // Generator for a commander card
  const commanderNameArb = fc.constantFrom(
    'Muldrotha, the Gravetide',
    'Korvold, Fae-Cursed King',
    'Yedora, Grave Gardener',
    'Atraxa, Praetors\' Voice',
    'Prossh, Skyraider of Kher',
    'Teysa Karlov',
    'Krenko, Mob Boss',
    'Meren of Clan Nel Toth',
  )

  // Generator for non-commander cards with various oracle text patterns
  const nonCommanderCardArb: fc.Arbitrary<CardData> = fc.record({
    cardName: fc.constantFrom(
      'Sol Ring',
      'Demonic Tutor',
      'Rhystic Study',
      'Cyclonic Rift',
      'Beast Within',
      'Eternal Witness',
      'Sakura-Tribe Elder',
      'Kodama\'s Reach',
      'Cultivate',
      'Arcane Signet',
      'Phyrexian Arena',
      'Swords to Plowshares',
      'Path to Exile',
      'Counterspell',
      'Swan Song',
      'Damnation',
      'Toxic Deluge',
      'Reanimate',
      'Living Death',
      'Skullclamp',
      'Lightning Greaves',
      'Swiftfoot Boots',
      'Command Tower',
      'Heroic Intervention',
      'Teferi\'s Protection',
    ),
    oracleText: fc.constantFrom(
      '{T}: Add {C}{C}.',
      'Search your library for a card and put it into your hand.',
      'At the beginning of your upkeep, draw a card.',
      'Return target permanent to its owner\'s hand. Overload {6}{U}.',
      'Destroy target noncreature permanent.',
      'When this creature enters the battlefield, return target card from your graveyard to your hand.',
      'Sacrifice this creature: Search your library for a basic land card.',
      'Search your library for up to two basic land cards.',
      'Search your library for a basic land card, put it onto the battlefield tapped, then draw a card.',
      '{T}: Add one mana of any color.',
      'At the beginning of your upkeep, you draw a card and you lose 1 life.',
      'Exile target creature.',
      'Exile target creature. Its controller gains life equal to its power.',
      'Counter target spell.',
      'Counter target noncreature spell.',
      'Destroy all creatures. They can\'t be regenerated.',
      'Each creature gets -X/-X until end of turn.',
      'Put target creature card from a graveyard onto the battlefield under your control.',
      'Each player sacrifices all creatures, then returns all creature cards from their graveyard to the battlefield.',
      'Equipped creature gets +1/-1. Whenever equipped creature dies, draw two cards.',
      'Equipped creature has shroud and haste.',
      'Equipped creature has hexproof and haste.',
      '{T}: Add one mana of any color in your commander\'s color identity.',
      'You and permanents you control gain hexproof and indestructible until end of turn.',
      'Your permanents gain indestructible until end of turn. Draw a card.',
    ),
    typeLine: fc.constantFrom(
      'Artifact',
      'Sorcery',
      'Enchantment',
      'Instant',
      'Creature — Snake Shaman',
      'Creature — Spirit',
      'Creature — Human Wizard',
      'Artifact — Equipment',
      'Land',
    ),
    manaCost: fc.constantFrom('{0}', '{1}', '{2}', '{1}{G}', '{U}{U}', '{1}{B}', '{2}{B}{B}', '{3}{W}{W}', '{R}', '{1}{U}'),
    cmc: fc.integer({ min: 0, max: 6 }),
    categories: fc.constantFrom(
      '[]',
      '["Tutor"]',
      '["Draw"]',
      '["Recursion"]',
      '["Removal"]',
      '["Board Wipe"]',
      '["Ramp"]',
      '["Tutor","Draw"]',
      '["Removal","Recursion"]',
      '["Ramp","Draw"]',
      '["Protection"]',
    ),
    isCommander: fc.constant(false),
  })

  // Generate a deck with a commander + 10-30 non-commander cards (enough for generatePrimer)
  const deckWithCommanderArb = fc.tuple(
    commanderNameArb,
    fc.array(nonCommanderCardArb, { minLength: 10, maxLength: 30 }),
    fc.record({
      oracleText: fc.constantFrom(
        'Whenever a permanent is put into your graveyard from the battlefield, draw a card.',
        'Whenever you sacrifice a permanent, draw a card, create a Treasure token, and put a +1/+1 counter on this creature.',
        'Whenever a nontoken creature you control dies, you may put it on top of your library.',
        'At the beginning of your end step, proliferate.',
        'Whenever you cast a creature spell, create two 0/1 Kobold creature tokens.',
        'Whenever another creature you own dies, you may exile it. If you do, return it at the beginning of the next end step.',
        '{T}: Add {R}{R}{R}. Activate only if you control three or more Goblins.',
        'At the beginning of your end step, return target creature card with power less than or equal to the number of experience counters you have from your graveyard to the battlefield.',
      ),
      typeLine: fc.constantFrom(
        'Legendary Creature — Elemental',
        'Legendary Creature — Dragon Noble',
        'Legendary Creature — Treefolk',
        'Legendary Creature — Phyrexian Angel Horror',
        'Legendary Creature — Dragon',
        'Legendary Creature — Human Advisor',
        'Legendary Creature — Goblin Warrior',
        'Legendary Creature — Human Shaman',
      ),
      manaCost: fc.constantFrom('{3}{B}{G}{U}', '{2}{B}{R}{G}', '{2}{G}', '{G}{W}{U}{B}', '{3}{B}{R}{G}', '{W}{B}', '{2}{R}', '{3}{B}{G}'),
      cmc: fc.integer({ min: 2, max: 7 }),
      categories: fc.constant('[]'),
    }),
  ).map(([commanderName, nonCommanderCards, commanderProps]) => {
    // Ensure unique card names
    const usedNames = new Set<string>()
    const uniqueCards = nonCommanderCards.filter(card => {
      if (usedNames.has(card.cardName)) return false
      usedNames.add(card.cardName)
      return true
    })

    const commander: CardData = {
      cardName: commanderName,
      oracleText: commanderProps.oracleText,
      typeLine: commanderProps.typeLine,
      manaCost: commanderProps.manaCost,
      cmc: commanderProps.cmc,
      categories: commanderProps.categories,
      isCommander: true,
    }

    return {
      commanderName,
      cards: [commander, ...uniqueCards],
    }
  })

  it('coreStrategy contains the commander name and is 2-3 sentences', () => {
    fc.assert(
      fc.property(deckWithCommanderArb, ({ commanderName, cards }) => {
        // Build contributing cards and select key cards (prerequisites for generatePrimer)
        const contributing = buildContributingCards(cards)
        const keyCards = selectKeyCards(cards, contributing, [])
        const scores = computeAttributeScores({
          tutorCount: contributing.tutors.length,
          drawEngineCount: contributing.drawEngines.length,
          commanderCardAdvantageFlag: 0,
          recursionCount: contributing.recursion.length,
          comboRedundancyCount: 0,
          commanderDependencyScore: 0.3,
          removalPlusCounterspellCount: contributing.removal.length + contributing.counterspells.length,
          boardWipeCount: contributing.boardWipes.length,
          fastManaCount: contributing.fastMana.length,
          averageCmc: 3.0,
          estimatedFundamentalTurn: 4,
          commanderCmc: cards.find(c => c.isCommander)?.cmc ?? 4,
        })

        const primer = generatePrimer(commanderName, cards, keyCards, scores)

        // Verify coreStrategy contains the commander name
        expect(primer.coreStrategy).toContain(commanderName)

        // Count sentences by splitting on sentence-ending punctuation
        const sentences = primer.coreStrategy
          .split(/[.!?]+/)
          .map(s => s.trim())
          .filter(s => s.length > 0)

        expect(sentences.length).toBeGreaterThanOrEqual(2)
        expect(sentences.length).toBeLessThanOrEqual(3)
      }),
      { numRuns: 100 }
    )
  })

  it('mulliganPriorities has 3-5 items, each with at most 30 words', () => {
    fc.assert(
      fc.property(deckWithCommanderArb, ({ commanderName, cards }) => {
        const contributing = buildContributingCards(cards)
        const keyCards = selectKeyCards(cards, contributing, [])
        const scores = computeAttributeScores({
          tutorCount: contributing.tutors.length,
          drawEngineCount: contributing.drawEngines.length,
          commanderCardAdvantageFlag: 0,
          recursionCount: contributing.recursion.length,
          comboRedundancyCount: 0,
          commanderDependencyScore: 0.3,
          removalPlusCounterspellCount: contributing.removal.length + contributing.counterspells.length,
          boardWipeCount: contributing.boardWipes.length,
          fastManaCount: contributing.fastMana.length,
          averageCmc: 3.0,
          estimatedFundamentalTurn: 4,
          commanderCmc: cards.find(c => c.isCommander)?.cmc ?? 4,
        })

        const primer = generatePrimer(commanderName, cards, keyCards, scores)

        // 3-5 items
        expect(primer.mulliganPriorities.length).toBeGreaterThanOrEqual(3)
        expect(primer.mulliganPriorities.length).toBeLessThanOrEqual(5)

        // Each item is at most 30 words
        for (const item of primer.mulliganPriorities) {
          const wordCount = item.split(/\s+/).filter(w => w.length > 0).length
          expect(wordCount).toBeLessThanOrEqual(30)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('keyTips has 3-5 items, each with at most 30 words, each referencing at least one card name', () => {
    fc.assert(
      fc.property(deckWithCommanderArb, ({ commanderName, cards }) => {
        const contributing = buildContributingCards(cards)
        const keyCards = selectKeyCards(cards, contributing, [])
        const scores = computeAttributeScores({
          tutorCount: contributing.tutors.length,
          drawEngineCount: contributing.drawEngines.length,
          commanderCardAdvantageFlag: 0,
          recursionCount: contributing.recursion.length,
          comboRedundancyCount: 0,
          commanderDependencyScore: 0.3,
          removalPlusCounterspellCount: contributing.removal.length + contributing.counterspells.length,
          boardWipeCount: contributing.boardWipes.length,
          fastManaCount: contributing.fastMana.length,
          averageCmc: 3.0,
          estimatedFundamentalTurn: 4,
          commanderCmc: cards.find(c => c.isCommander)?.cmc ?? 4,
        })

        const primer = generatePrimer(commanderName, cards, keyCards, scores)

        // 3-5 items
        expect(primer.keyTips.length).toBeGreaterThanOrEqual(3)
        expect(primer.keyTips.length).toBeLessThanOrEqual(5)

        // Collect all card names in the deck (including commander)
        const allCardNames = cards.map(c => c.cardName)

        for (const tip of primer.keyTips) {
          // Each tip is at most 30 words
          const wordCount = tip.split(/\s+/).filter(w => w.length > 0).length
          expect(wordCount).toBeLessThanOrEqual(30)

          // Each tip references at least one card name from the deck
          const referencesACard = allCardNames.some(name => tip.includes(name))
          expect(referencesACard).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })
})


describe('Feature: deck-ratings, Property 7: Weakness Severity Invariant', () => {
  /**
   * **Validates: Requirements 5.1, 5.2**
   *
   * Property 7: Weakness Severity Invariant
   * For any identified weakness, its severity SHALL be one of 'Critical', 'Moderate',
   * or 'Minor', and a weakness classified as Critical SHALL correspond to a core strategy
   * dependency where the deck contains fewer than 2 mitigation cards for the relevant hate type.
   */

  // identifyWeaknesses is imported at the top of the file

  const VALID_SEVERITIES = ['Critical', 'Moderate', 'Minor'] as const

  /**
   * Generator for CardData with varied oracle text patterns that can trigger
   * different weakness detection paths.
   */
  const cardDataArb: fc.Arbitrary<CardData> = fc.record({
    cardName: fc.string({ minLength: 1, maxLength: 20 }).map(s => `Card_${s.replace(/\s/g, '_')}`),
    oracleText: fc.constantFrom(
      // Recursion cards (trigger graveyard dependency)
      'Return target creature card from your graveyard to the battlefield.',
      'Return target card from your graveyard to your hand.',
      'Return all creature cards from your graveyard to the battlefield.',
      'You may cast target creature card from your graveyard.',
      'Return up to two cards from your graveyard to your hand.',
      // Graveyard protection cards
      'Shuffle your graveyard into your library.',
      'Return target card from exile to your hand.',
      // Commander protection cards
      'Target creature gains hexproof until end of turn.',
      'Target creature gains indestructible until end of turn.',
      'Creatures you control gain shroud until end of turn.',
      // Counterspells
      'Counter target spell.',
      'Counter target noncreature spell.',
      // Generic cards (no special detection)
      'Flying. Vigilance.',
      'Trample.',
      '',
      'Whenever a creature enters the battlefield, you gain 1 life.',
      'Destroy target creature.',
      '{T}: Add {G}.',
      'Draw a card.',
      'Search your library for a basic land card.',
      // Artifact cards for artifact vulnerability
      '{T}: Add {C}.',
      'Equipped creature gets +2/+2.',
    ),
    typeLine: fc.constantFrom(
      'Creature — Zombie',
      'Instant',
      'Sorcery',
      'Artifact',
      'Artifact — Equipment',
      'Enchantment',
      'Creature — Elf Druid',
      'Creature — Human Wizard',
      'Land',
    ),
    manaCost: fc.constantFrom('{0}', '{1}', '{2}', '{1}{G}', '{U}{U}', '{2}{B}', '{3}{W}{W}'),
    cmc: fc.integer({ min: 0, max: 7 }),
    categories: fc.constantFrom(
      '[]',
      '["Recursion"]',
      '["Removal"]',
      '["Draw"]',
      '["Ramp"]',
      '["Tutor"]',
      '["Board Wipe"]',
      '["Removal","Recursion"]',
    ),
    isCommander: fc.constant(false),
  })

  /**
   * Generator for a commander card that may or may not provide card advantage.
   */
  const commanderCardArb: fc.Arbitrary<CardData> = fc.record({
    cardName: fc.constantFrom('TestCommander', 'Muldrotha', 'Korvold', 'Atraxa'),
    oracleText: fc.constantFrom(
      // Commanders that provide engine (triggers commander dependency)
      'Whenever you cast a spell, draw a card.',
      'At the beginning of your upkeep, search your library for a card.',
      'Look at the top three cards of your library.',
      // Commanders without card advantage (no commander dependency)
      'Flying, trample.',
      'Double strike.',
      'Whenever this creature attacks, create a 1/1 token.',
      '',
    ),
    typeLine: fc.constant('Legendary Creature — Elder Dragon'),
    manaCost: fc.constantFrom('{3}{B}{G}', '{2}{U}{B}{R}', '{4}{G}{W}'),
    cmc: fc.constantFrom(4, 5, 6),
    categories: fc.constant('[]'),
    isCommander: fc.constant(true),
  })

  /**
   * Generator for AttributeScores with varying interaction and speed scores.
   */
  const scoresArb: fc.Arbitrary<AttributeScores> = fc.record({
    consistency: fc.integer({ min: 1, max: 10 }),
    resilience: fc.integer({ min: 1, max: 10 }),
    interaction: fc.integer({ min: 1, max: 10 }),
    speed: fc.integer({ min: 1, max: 10 }),
  })

  /**
   * Generator for ContributingCards with varying recursion counts
   * to trigger graveyard dependency detection.
   */
  const contributingCardsArb: fc.Arbitrary<ContributingCards> = fc.record({
    tutors: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 0, maxLength: 5 }),
    drawEngines: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 0, maxLength: 5 }),
    recursion: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 0, maxLength: 10 }),
    removal: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 0, maxLength: 5 }),
    counterspells: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 0, maxLength: 5 }),
    boardWipes: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 0, maxLength: 5 }),
    fastMana: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 0, maxLength: 5 }),
  })

  it('every weakness has a valid severity of Critical, Moderate, or Minor', () => {
    fc.assert(
      fc.property(
        fc.array(cardDataArb, { minLength: 5, maxLength: 25 }),
        commanderCardArb,
        scoresArb,
        contributingCardsArb,
        (nonCommanderCards, commanderCard, scores, contributingCards) => {
          const cards = [commanderCard, ...nonCommanderCards]
          const weaknesses = identifyWeaknesses(
            cards,
            contributingCards,
            scores,
            commanderCard.cardName
          )

          for (const weakness of weaknesses) {
            expect(VALID_SEVERITIES).toContain(weakness.severity)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('every weakness has a non-empty description string', () => {
    fc.assert(
      fc.property(
        fc.array(cardDataArb, { minLength: 5, maxLength: 25 }),
        commanderCardArb,
        scoresArb,
        contributingCardsArb,
        (nonCommanderCards, commanderCard, scores, contributingCards) => {
          const cards = [commanderCard, ...nonCommanderCards]
          const weaknesses = identifyWeaknesses(
            cards,
            contributingCards,
            scores,
            commanderCard.cardName
          )

          for (const weakness of weaknesses) {
            expect(typeof weakness.description).toBe('string')
            expect(weakness.description.length).toBeGreaterThan(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('every weakness has a non-empty hateCards array of strings', () => {
    fc.assert(
      fc.property(
        fc.array(cardDataArb, { minLength: 5, maxLength: 25 }),
        commanderCardArb,
        scoresArb,
        contributingCardsArb,
        (nonCommanderCards, commanderCard, scores, contributingCards) => {
          const cards = [commanderCard, ...nonCommanderCards]
          const weaknesses = identifyWeaknesses(
            cards,
            contributingCards,
            scores,
            commanderCard.cardName
          )

          for (const weakness of weaknesses) {
            expect(Array.isArray(weakness.hateCards)).toBe(true)
            expect(weakness.hateCards.length).toBeGreaterThan(0)
            for (const hateCard of weakness.hateCards) {
              expect(typeof hateCard).toBe('string')
              expect(hateCard.length).toBeGreaterThan(0)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Critical graveyard weakness only appears when recursion >= 5 AND < 2 graveyard protection cards', () => {
    fc.assert(
      fc.property(
        fc.array(cardDataArb, { minLength: 5, maxLength: 25 }),
        commanderCardArb,
        scoresArb,
        contributingCardsArb,
        (nonCommanderCards, commanderCard, scores, contributingCards) => {
          const cards = [commanderCard, ...nonCommanderCards]
          const weaknesses = identifyWeaknesses(
            cards,
            contributingCards,
            scores,
            commanderCard.cardName
          )

          // Find graveyard-related Critical weaknesses
          const criticalGraveyardWeaknesses = weaknesses.filter(
            (w) => w.severity === 'Critical' && w.description.toLowerCase().includes('graveyard')
          )

          for (const _weakness of criticalGraveyardWeaknesses) {
            // A Critical graveyard weakness requires:
            // 1. recursion count >= 5 in contributing cards
            expect(contributingCards.recursion.length).toBeGreaterThanOrEqual(5)

            // 2. < 2 graveyard protection cards in the deck
            // Graveyard protection: cards with "shuffle" + "graveyard" OR "return" + "from exile"
            const graveyardProtectionCount = cards.filter((card) => {
              const text = card.oracleText.toLowerCase()
              return (
                (text.includes('shuffle') && text.includes('graveyard')) ||
                (text.includes('return') && text.includes('from exile'))
              )
            }).length

            expect(graveyardProtectionCount).toBeLessThan(2)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Critical commander dependency weakness only appears when commander is engine AND < 2 protection cards', () => {
    fc.assert(
      fc.property(
        fc.array(cardDataArb, { minLength: 5, maxLength: 25 }),
        commanderCardArb,
        scoresArb,
        contributingCardsArb,
        (nonCommanderCards, commanderCard, scores, contributingCards) => {
          const cards = [commanderCard, ...nonCommanderCards]
          const weaknesses = identifyWeaknesses(
            cards,
            contributingCards,
            scores,
            commanderCard.cardName
          )

          // Find commander-related Critical weaknesses
          const criticalCommanderWeaknesses = weaknesses.filter(
            (w) => w.severity === 'Critical' && w.description.toLowerCase().includes('commander dep')
          )

          for (const _weakness of criticalCommanderWeaknesses) {
            // A Critical commander weakness requires < 2 commander protection cards
            // Commander protection: cards with "hexproof", "indestructible", "shroud"
            // OR instants with "counter target"
            const commanderProtectionCount = cards.filter((card) => {
              const text = card.oracleText.toLowerCase()
              const typeLine = card.typeLine.toLowerCase()
              const grantsProtection =
                text.includes('hexproof') ||
                text.includes('indestructible') ||
                text.includes('shroud')
              const isCounterspell =
                typeLine.includes('instant') && text.includes('counter target')
              return grantsProtection || isCounterspell
            }).length

            expect(commanderProtectionCount).toBeLessThan(2)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
