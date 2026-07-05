import { describe, it, expect } from 'vitest'
import {
  buildBrewInvestigatorPrompt,
  buildBriefExtractionPrompt,
  buildSkeletonGenerationPrompt,
  buildRefinementPrompt,
} from './brew-prompts'
import type { StrategyBrief, CategoryGroup } from '@/types/brew'

// ---------------------------------------------------------------------------
// buildBrewInvestigatorPrompt
// ---------------------------------------------------------------------------

describe('buildBrewInvestigatorPrompt', () => {
  describe('Path A (commander)', () => {
    it('includes the commander name', () => {
      const prompt = buildBrewInvestigatorPrompt('commander', 'Muldrotha, the Gravetide')
      expect(prompt).toContain('Muldrotha, the Gravetide')
    })

    it('asks about win condition, bracket, known includes, and playstyle', () => {
      const prompt = buildBrewInvestigatorPrompt('commander', 'Yedora, Grave Gardener')
      expect(prompt.toLowerCase()).toContain('win condition')
      expect(prompt.toLowerCase()).toContain('bracket')
      expect(prompt.toLowerCase()).toContain('known includes')
      expect(prompt.toLowerCase()).toContain('playstyle')
    })

    it('mentions the 6-exchange limit', () => {
      const prompt = buildBrewInvestigatorPrompt('commander', 'Auntie Blyte')
      expect(prompt).toContain('6')
    })

    it('instructs to produce a StrategyBrief JSON', () => {
      const prompt = buildBrewInvestigatorPrompt('commander', 'Rocco')
      expect(prompt).toContain('StrategyBrief')
      expect(prompt).toContain('commanderName')
      expect(prompt).toContain('colourIdentity')
      expect(prompt).toContain('primaryWinCondition')
      expect(prompt).toContain('targetBracket')
      expect(prompt).toContain('budgetPreference')
    })

    it('has a conversational and friendly tone', () => {
      const prompt = buildBrewInvestigatorPrompt('commander', 'Muldrotha')
      expect(prompt.toLowerCase()).toContain('conversational')
      expect(prompt.toLowerCase()).toContain('friendly')
    })

    it('asks about budget preference', () => {
      const prompt = buildBrewInvestigatorPrompt('commander', 'Muldrotha')
      expect(prompt.toLowerCase()).toContain('budget')
    })
  })

  describe('Path B (concept)', () => {
    it('includes the concept description', () => {
      const prompt = buildBrewInvestigatorPrompt('concept', undefined, 'A graveyard value engine that recurs permanents')
      expect(prompt).toContain('A graveyard value engine that recurs permanents')
    })

    it('instructs to help identify a commander first', () => {
      const prompt = buildBrewInvestigatorPrompt('concept', undefined, 'Squirrel tribal aggro')
      expect(prompt.toLowerCase()).toContain('commander')
      expect(prompt.toLowerCase()).toContain('suggest')
    })

    it('includes a pivot to strategy questions after commander confirmed', () => {
      const prompt = buildBrewInvestigatorPrompt('concept', undefined, 'Voltron with equipment')
      expect(prompt.toLowerCase()).toContain('win condition')
      expect(prompt.toLowerCase()).toContain('bracket')
      expect(prompt.toLowerCase()).toContain('playstyle')
    })

    it('mentions the 6-exchange limit', () => {
      const prompt = buildBrewInvestigatorPrompt('concept', undefined, 'Some concept')
      expect(prompt).toContain('6')
    })

    it('instructs to produce a StrategyBrief JSON', () => {
      const prompt = buildBrewInvestigatorPrompt('concept', undefined, 'Some concept')
      expect(prompt).toContain('StrategyBrief')
      expect(prompt).toContain('commanderName')
    })
  })
})

// ---------------------------------------------------------------------------
// buildBriefExtractionPrompt
// ---------------------------------------------------------------------------

describe('buildBriefExtractionPrompt', () => {
  const mockConversation = [
    { role: 'assistant', content: 'Hey! What are you thinking for Muldrotha?' },
    { role: 'user', content: 'I want to do graveyard recursion and win through value.' },
    { role: 'assistant', content: 'Nice! What bracket are you aiming for?' },
    { role: 'user', content: 'Bracket 3. I want it competitive but not cEDH.' },
  ]

  it('includes the conversation history', () => {
    const prompt = buildBriefExtractionPrompt(mockConversation, 'Muldrotha, the Gravetide')
    expect(prompt).toContain('graveyard recursion')
    expect(prompt).toContain('Bracket 3')
    expect(prompt).toContain('competitive but not cEDH')
  })

  it('includes the commander name in extraction instructions', () => {
    const prompt = buildBriefExtractionPrompt(mockConversation, 'Muldrotha, the Gravetide')
    expect(prompt).toContain('Muldrotha, the Gravetide')
  })

  it('lists all required StrategyBrief fields', () => {
    const prompt = buildBriefExtractionPrompt(mockConversation, 'Muldrotha')
    expect(prompt).toContain('commanderName')
    expect(prompt).toContain('colourIdentity')
    expect(prompt).toContain('primaryWinCondition')
    expect(prompt).toContain('secondaryWinCondition')
    expect(prompt).toContain('targetBracket')
    expect(prompt).toContain('knownIncludes')
    expect(prompt).toContain('playstyleDescription')
    expect(prompt).toContain('budgetPreference')
  })

  it('uses clear section delimiters', () => {
    const prompt = buildBriefExtractionPrompt(mockConversation, 'Muldrotha')
    expect(prompt).toContain('=== CONVERSATION HISTORY ===')
    expect(prompt).toContain('=== END CONVERSATION HISTORY ===')
    expect(prompt).toContain('=== EXTRACTION INSTRUCTIONS ===')
    expect(prompt).toContain('=== END EXTRACTION INSTRUCTIONS ===')
  })

  it('labels conversation roles correctly', () => {
    const prompt = buildBriefExtractionPrompt(mockConversation, 'Muldrotha')
    expect(prompt).toContain('User:')
    expect(prompt).toContain('Assistant:')
  })

  it('instructs to respond with only JSON', () => {
    const prompt = buildBriefExtractionPrompt(mockConversation, 'Muldrotha')
    expect(prompt).toContain('ONLY the JSON')
  })
})

// ---------------------------------------------------------------------------
// buildSkeletonGenerationPrompt
// ---------------------------------------------------------------------------

describe('buildSkeletonGenerationPrompt', () => {
  const mockBrief: StrategyBrief = {
    commanderName: 'Muldrotha, the Gravetide',
    colourIdentity: ['B', 'G', 'U'],
    primaryWinCondition: 'Graveyard recursion value engine',
    secondaryWinCondition: 'Combo with Spore Frog lock',
    targetBracket: 3,
    knownIncludes: ['Spore Frog', 'Mulldrifter'],
    playstyleDescription: 'Midrange value with permanent recursion',
    budgetPreference: 'budget',
    budgetCeiling: 10,
  }

  const mockStaples = [
    { cardName: 'Sakura-Tribe Elder', synergy: 45 },
    { cardName: 'Shriekmaw', synergy: 38 },
  ]

  const mockCollection = [
    { cardName: 'Sol Ring', owned: true },
    { cardName: 'Arcane Signet', owned: true },
    { cardName: 'Rhystic Study', owned: false },
  ]

  const mockFills = [
    { cardName: 'Ravenous Chupacabra', price: 0.25 },
    { cardName: 'Wood Elves', price: 0.50 },
  ]

  it('includes the strategy brief section', () => {
    const prompt = buildSkeletonGenerationPrompt(mockBrief, mockStaples, mockCollection, mockFills)
    expect(prompt).toContain('=== STRATEGY BRIEF ===')
    expect(prompt).toContain('Muldrotha, the Gravetide')
    expect(prompt).toContain('Graveyard recursion value engine')
    expect(prompt).toContain('Bracket: 3')
  })

  it('includes EDHREC staples with synergy scores', () => {
    const prompt = buildSkeletonGenerationPrompt(mockBrief, mockStaples, mockCollection, mockFills)
    expect(prompt).toContain('=== EDHREC STAPLES ===')
    expect(prompt).toContain('Sakura-Tribe Elder (synergy: 45%)')
    expect(prompt).toContain('Shriekmaw (synergy: 38%)')
  })

  it('includes collection cards with ownership status', () => {
    const prompt = buildSkeletonGenerationPrompt(mockBrief, mockStaples, mockCollection, mockFills)
    expect(prompt).toContain('=== USER COLLECTION ===')
    expect(prompt).toContain('Sol Ring [✅ owned]')
    expect(prompt).toContain('Rhystic Study [⚠️ in another deck]')
  })

  it('includes Scryfall fill candidates with prices', () => {
    const prompt = buildSkeletonGenerationPrompt(mockBrief, mockStaples, mockCollection, mockFills)
    expect(prompt).toContain('=== SCRYFALL FILL CANDIDATES ===')
    expect(prompt).toContain('Ravenous Chupacabra ($0.25)')
    expect(prompt).toContain('Wood Elves ($0.50)')
  })

  it('instructs to produce exactly 100 cards', () => {
    const prompt = buildSkeletonGenerationPrompt(mockBrief, mockStaples, mockCollection, mockFills)
    expect(prompt).toContain('EXACTLY 100 cards')
    expect(prompt).toContain('total card count across ALL categories MUST equal exactly 100')
  })

  it('instructs to prioritize owned cards', () => {
    const prompt = buildSkeletonGenerationPrompt(mockBrief, mockStaples, mockCollection, mockFills)
    expect(prompt).toContain('Prioritise cards from the User Collection')
    expect(prompt).toContain('owned cards are free')
  })

  it('includes budget ceiling when budget preference is set', () => {
    const prompt = buildSkeletonGenerationPrompt(mockBrief, mockStaples, mockCollection, mockFills)
    expect(prompt).toContain('$10')
    expect(prompt).toContain('over-budget')
  })

  it('includes known includes instruction', () => {
    const prompt = buildSkeletonGenerationPrompt(mockBrief, mockStaples, mockCollection, mockFills)
    expect(prompt).toContain('Known Includes: Spore Frog, Mulldrifter')
    expect(prompt).toContain('ALWAYS include the Known Includes')
  })

  it('instructs to sort by ownership within categories', () => {
    const prompt = buildSkeletonGenerationPrompt(mockBrief, mockStaples, mockCollection, mockFills)
    expect(prompt).toContain('owned first, then proxy_candidate, then not_owned')
  })

  it('omits budget ceiling when preference is unrestricted', () => {
    const unrestrictedBrief: StrategyBrief = {
      ...mockBrief,
      budgetPreference: 'unrestricted',
      budgetCeiling: undefined,
    }
    const prompt = buildSkeletonGenerationPrompt(unrestrictedBrief, mockStaples, mockCollection, mockFills)
    expect(prompt).not.toContain('Budget Ceiling:')
    expect(prompt).not.toContain('Individual cards should not exceed')
  })

  it('uses clear section delimiters', () => {
    const prompt = buildSkeletonGenerationPrompt(mockBrief, mockStaples, mockCollection, mockFills)
    expect(prompt).toContain('=== STRATEGY BRIEF ===')
    expect(prompt).toContain('=== END STRATEGY BRIEF ===')
    expect(prompt).toContain('=== EDHREC STAPLES ===')
    expect(prompt).toContain('=== END EDHREC STAPLES ===')
    expect(prompt).toContain('=== USER COLLECTION ===')
    expect(prompt).toContain('=== END USER COLLECTION ===')
    expect(prompt).toContain('=== GENERATION INSTRUCTIONS ===')
    expect(prompt).toContain('=== END GENERATION INSTRUCTIONS ===')
  })
})

// ---------------------------------------------------------------------------
// buildRefinementPrompt
// ---------------------------------------------------------------------------

describe('buildRefinementPrompt', () => {
  const mockBrief: StrategyBrief = {
    commanderName: 'Muldrotha, the Gravetide',
    colourIdentity: ['B', 'G', 'U'],
    primaryWinCondition: 'Graveyard recursion',
    secondaryWinCondition: 'Combo finish',
    targetBracket: 3,
    knownIncludes: [],
    playstyleDescription: 'Midrange value',
    budgetPreference: 'budget',
    budgetCeiling: 10,
  }

  const mockCategory: CategoryGroup = {
    name: 'Ramp',
    cards: [
      { cardName: 'Sol Ring', ownershipStatus: 'owned', price: 3.0, overBudget: false, accepted: false },
      { cardName: 'Sakura-Tribe Elder', ownershipStatus: 'owned', price: 0.50, overBudget: false, accepted: false },
      { cardName: 'Mana Crypt', ownershipStatus: 'not_owned', price: 150.0, overBudget: true, accepted: false },
    ],
  }

  describe('swap action', () => {
    it('asks for a single replacement for the target card', () => {
      const prompt = buildRefinementPrompt(mockBrief, mockCategory, 'swap', 'Mana Crypt')
      expect(prompt).toContain('SINGLE replacement')
      expect(prompt).toContain('Mana Crypt')
    })

    it('includes deck context (commander, colour identity, bracket)', () => {
      const prompt = buildRefinementPrompt(mockBrief, mockCategory, 'swap', 'Mana Crypt')
      expect(prompt).toContain('Muldrotha, the Gravetide')
      expect(prompt).toContain('B, G, U')
      expect(prompt).toContain('Bracket: 3')
    })

    it('includes category context with current cards', () => {
      const prompt = buildRefinementPrompt(mockBrief, mockCategory, 'swap', 'Mana Crypt')
      expect(prompt).toContain('Category: Ramp')
      expect(prompt).toContain('Sol Ring')
      expect(prompt).toContain('Sakura-Tribe Elder')
    })

    it('specifies colour identity constraint', () => {
      const prompt = buildRefinementPrompt(mockBrief, mockCategory, 'swap', 'Mana Crypt')
      expect(prompt).toContain('colour identity: B, G, U')
    })

    it('specifies Commander format legality', () => {
      const prompt = buildRefinementPrompt(mockBrief, mockCategory, 'swap', 'Mana Crypt')
      expect(prompt).toContain('legal in Commander')
    })

    it('includes budget constraint when applicable', () => {
      const prompt = buildRefinementPrompt(mockBrief, mockCategory, 'swap', 'Mana Crypt')
      expect(prompt).toContain('$10')
    })
  })

  describe('alternatives action', () => {
    it('asks for 3-5 alternatives', () => {
      const prompt = buildRefinementPrompt(mockBrief, mockCategory, 'alternatives', 'Sol Ring')
      expect(prompt).toContain('3-5 alternative')
    })

    it('references the target card and category', () => {
      const prompt = buildRefinementPrompt(mockBrief, mockCategory, 'alternatives', 'Sol Ring')
      expect(prompt).toContain('Sol Ring')
      expect(prompt).toContain('Ramp')
    })

    it('specifies functional role matching', () => {
      const prompt = buildRefinementPrompt(mockBrief, mockCategory, 'alternatives', 'Sol Ring')
      expect(prompt).toContain('functional role')
    })

    it('specifies colour identity constraint', () => {
      const prompt = buildRefinementPrompt(mockBrief, mockCategory, 'alternatives', 'Sol Ring')
      expect(prompt).toContain('colour identity: B, G, U')
    })

    it('instructs to not include cards already in the category', () => {
      const prompt = buildRefinementPrompt(mockBrief, mockCategory, 'alternatives', 'Sol Ring')
      expect(prompt).toContain('Not already be in the current category')
    })

    it('instructs to respond with only JSON', () => {
      const prompt = buildRefinementPrompt(mockBrief, mockCategory, 'alternatives', 'Sol Ring')
      expect(prompt).toContain('ONLY the JSON')
    })
  })

  it('uses clear section delimiters', () => {
    const prompt = buildRefinementPrompt(mockBrief, mockCategory, 'swap', 'Sol Ring')
    expect(prompt).toContain('=== DECK CONTEXT ===')
    expect(prompt).toContain('=== END DECK CONTEXT ===')
    expect(prompt).toContain('=== CATEGORY CONTEXT ===')
    expect(prompt).toContain('=== END CATEGORY CONTEXT ===')
    expect(prompt).toContain('=== INSTRUCTIONS ===')
    expect(prompt).toContain('=== END INSTRUCTIONS ===')
  })
})
