import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildInvestigatorSystemPrompt,
  buildAnalystPrompt,
  formatDebriefNoteEntry,
} from './debrief-prompts'
import type { DebriefBrief, DeckCardWithOwnership } from './debrief-types'

describe('buildInvestigatorSystemPrompt', () => {
  it('includes the commander name and deck name', () => {
    const prompt = buildInvestigatorSystemPrompt('Muldrotha, the Gravetide', 'Grave Tidings')
    expect(prompt).toContain('Muldrotha, the Gravetide')
    expect(prompt).toContain('Grave Tidings')
  })

  it('mentions the 5-exchange limit', () => {
    const prompt = buildInvestigatorSystemPrompt('Yedora', 'Yedora the Explorer')
    expect(prompt).toContain('5')
  })

  it('instructs the model to ask about game outcome, problem cards, effective cards, opponent archetypes, and loss pattern', () => {
    const prompt = buildInvestigatorSystemPrompt('Auntie Blyte', 'Auntie-Social')
    expect(prompt.toLowerCase()).toContain('game outcome')
    expect(prompt.toLowerCase()).toContain('problem cards')
    expect(prompt.toLowerCase()).toContain('effective cards')
    expect(prompt.toLowerCase()).toContain('opponent archetypes')
    expect(prompt.toLowerCase()).toContain('loss')
  })

  it('instructs the model to produce a DebriefBrief JSON', () => {
    const prompt = buildInvestigatorSystemPrompt('Rocco', 'Rocco Secret')
    expect(prompt).toContain('DebriefBrief')
    expect(prompt).toContain('gameOutcome')
    expect(prompt).toContain('problemCards')
    expect(prompt).toContain('effectiveCards')
    expect(prompt).toContain('opponentArchetypes')
    expect(prompt).toContain('lossPattern')
    expect(prompt).toContain('userNotes')
  })

  it('instructs the model to be conversational and friendly', () => {
    const prompt = buildInvestigatorSystemPrompt('Muldrotha', 'Grave Tidings')
    expect(prompt.toLowerCase()).toContain('conversational')
    expect(prompt.toLowerCase()).toContain('friendly')
  })
})

describe('buildAnalystPrompt', () => {
  const mockBrief: DebriefBrief = {
    gameOutcome: 'loss',
    problemCards: ['Sol Ring', 'Cultivate'],
    effectiveCards: ['Mulldrifter', 'Spore Frog'],
    opponentArchetypes: ['Mono-Red Aggro', 'Simic Ramp'],
    lossPattern: 'Mana flooded in mid-game while opponents established board dominance',
    userNotes: 'Drew too many lands in a row',
  }

  const mockDeckCards: DeckCardWithOwnership[] = [
    { card_name: 'Muldrotha, the Gravetide', quantity: 1, categories: 'Commander', is_commander: true, ownership_status: 'original' },
    { card_name: 'Sol Ring', quantity: 1, categories: 'Ramp', is_commander: false, ownership_status: 'original' },
    { card_name: 'Mulldrifter', quantity: 1, categories: 'Draw', is_commander: false, ownership_status: 'proxy' },
    { card_name: 'Spore Frog', quantity: 1, categories: 'Protection', is_commander: false, ownership_status: null },
  ]

  const mockStrategy = {
    win_condition: 'Graveyard recursion value engine with Muldrotha',
    bracket: 3,
    frustration: 'Getting graveyard hated out',
    strategy_notes: 'Focus on permanent-based interaction',
  }

  it('includes the debrief brief section', () => {
    const prompt = buildAnalystPrompt(mockBrief, mockDeckCards, mockStrategy)
    expect(prompt).toContain('=== DEBRIEF BRIEF ===')
    expect(prompt).toContain('Game Outcome: loss')
    expect(prompt).toContain('Sol Ring, Cultivate')
    expect(prompt).toContain('Mulldrifter, Spore Frog')
    expect(prompt).toContain('Mono-Red Aggro, Simic Ramp')
    expect(prompt).toContain('Mana flooded')
    expect(prompt).toContain('Drew too many lands')
  })

  it('includes strategy context when provided', () => {
    const prompt = buildAnalystPrompt(mockBrief, mockDeckCards, mockStrategy)
    expect(prompt).toContain('=== DECK STRATEGY CONTEXT ===')
    expect(prompt).toContain('Win Condition: Graveyard recursion value engine with Muldrotha')
    expect(prompt).toContain('Bracket: 3')
    expect(prompt).toContain('Frustration Points: Getting graveyard hated out')
    expect(prompt).toContain('Strategy Notes: Focus on permanent-based interaction')
  })

  it('omits strategy section when strategy is null', () => {
    const prompt = buildAnalystPrompt(mockBrief, mockDeckCards, null)
    expect(prompt).not.toContain('=== DECK STRATEGY CONTEXT ===')
  })

  it('includes the full deck list with ownership status', () => {
    const prompt = buildAnalystPrompt(mockBrief, mockDeckCards, null)
    expect(prompt).toContain('=== DECK LIST ===')
    expect(prompt).toContain('1x Muldrotha, the Gravetide (Commander) [original]')
    expect(prompt).toContain('1x Sol Ring [original]')
    expect(prompt).toContain('1x Mulldrifter [proxy]')
    expect(prompt).toContain('1x Spore Frog [not_owned]')
  })

  it('includes instructions for producing JSON recommendations', () => {
    const prompt = buildAnalystPrompt(mockBrief, mockDeckCards, mockStrategy)
    expect(prompt).toContain('=== INSTRUCTIONS ===')
    expect(prompt).toContain('cutCard')
    expect(prompt).toContain('addCard')
    expect(prompt).toContain('reason')
    expect(prompt).toContain('ownershipStatus')
    expect(prompt).toContain('1–5')
    expect(prompt).toContain('highest impact first')
  })

  it('instructs to prefer owned cards', () => {
    const prompt = buildAnalystPrompt(mockBrief, mockDeckCards, mockStrategy)
    expect(prompt).toContain('Prefer cards the user already owns')
  })

  it('instructs to consider lossPattern and problemCards for cuts', () => {
    const prompt = buildAnalystPrompt(mockBrief, mockDeckCards, mockStrategy)
    expect(prompt).toContain('lossPattern')
    expect(prompt).toContain('problemCards')
  })

  it('handles deck cards with null ownership_status', () => {
    const cards: DeckCardWithOwnership[] = [
      { card_name: 'Forest', quantity: 1, categories: 'Land', is_commander: false, ownership_status: null },
    ]
    const prompt = buildAnalystPrompt(mockBrief, cards, null)
    expect(prompt).toContain('1x Forest')
    expect(prompt).not.toContain('1x Forest [')
  })
})

describe('formatDebriefNoteEntry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-22T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats a complete note entry with session ID, date, cut, add, and reason', () => {
    const result = formatDebriefNoteEntry(42, {
      cutCard: 'Sol Ring',
      addCard: 'Arcane Signet',
      reason: 'Better color fixing for 3-color mana base',
    })

    expect(result).toBe(
      '### Debrief #42 — 2026-06-22\n- **Cut:** Sol Ring\n- **Add:** Arcane Signet\n- **Reason:** Better color fixing for 3-color mana base'
    )
  })

  it('includes the session ID in the heading', () => {
    const result = formatDebriefNoteEntry(7, {
      cutCard: 'Card A',
      addCard: 'Card B',
      reason: 'Test reason',
    })
    expect(result).toContain('Debrief #7')
  })

  it('includes the current date', () => {
    const result = formatDebriefNoteEntry(1, {
      cutCard: 'X',
      addCard: 'Y',
      reason: 'Z',
    })
    expect(result).toContain('2026-06-22')
  })
})
