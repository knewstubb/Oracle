import { describe, it, expect } from 'vitest'
import {
  createSession,
  commitCommander,
  saveConcept,
  saveDraft,
} from './brew-v2-session'
import type { BrewSessionState, CommanderOption } from './brew-v2-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCommander(overrides?: Partial<CommanderOption>): CommanderOption {
  return {
    name: 'Muldrotha, the Gravetide',
    artUrl: 'https://example.com/art.jpg',
    colourIdentity: ['B', 'G', 'U'],
    description: 'Sultai value recursion commander',
    owned: true,
    scryfallId: 'abc-123',
    ...overrides,
  }
}

function makeExploringSession(
  overrides?: Partial<BrewSessionState>
): BrewSessionState {
  return {
    ...createSession(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------

describe('createSession', () => {
  it('starts in exploring phase', () => {
    const session = createSession()
    expect(session.phase).toBe('exploring')
  })

  it('has no commander', () => {
    const session = createSession()
    expect(session.commander).toBeNull()
  })

  it('has empty decision log with all three sections', () => {
    const session = createSession()
    expect(session.decisionLog).toEqual({
      strategy: [],
      parameters: [],
      constraints: [],
    })
  })

  it('has no deck state', () => {
    const session = createSession()
    expect(session.deckState).toBeNull()
  })

  it('has empty assessment cache', () => {
    const session = createSession()
    expect(session.assessmentCache.size).toBe(0)
  })

  it('has null sessionId', () => {
    const session = createSession()
    expect(session.sessionId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// commitCommander
// ---------------------------------------------------------------------------

describe('commitCommander', () => {
  it('transitions phase from exploring to building', () => {
    const session = createSession()
    const commander = makeCommander()
    const result = commitCommander(session, commander)
    expect(result.phase).toBe('building')
  })

  it('stores the commander data', () => {
    const session = createSession()
    const commander = makeCommander({ name: 'Korvold, Fae-Cursed King' })
    const result = commitCommander(session, commander)
    expect(result.commander).not.toBeNull()
    expect(result.commander!.name).toBe('Korvold, Fae-Cursed King')
    expect(result.commander!.colourIdentity).toEqual(commander.colourIdentity)
    expect(result.commander!.artUrl).toBe(commander.artUrl)
  })

  it('extracts archetype from decision log strategy entries', () => {
    const session = makeExploringSession({
      decisionLog: {
        strategy: [
          {
            id: '1',
            key: 'ARCHETYPE',
            value: 'Aristocrats',
            sourceQuote: 'sacrifice themed',
            timestamp: Date.now(),
          },
        ],
        parameters: [],
        constraints: [],
      },
    })
    const commander = makeCommander()
    const result = commitCommander(session, commander)
    expect(result.commander!.archetype).toBe('Aristocrats')
  })

  it('sets archetype to null when no archetype in decision log', () => {
    const session = createSession()
    const commander = makeCommander()
    const result = commitCommander(session, commander)
    expect(result.commander!.archetype).toBeNull()
  })

  it('initializes deck state with empty cards, suggestions, and isGenerating true', () => {
    const session = createSession()
    const commander = makeCommander()
    const result = commitCommander(session, commander)
    expect(result.deckState).toEqual({
      cards: [],
      suggestions: [],
      isGenerating: true,
      canvasPositions: {},
      explorationArchive: [],
    })
  })

  it('preserves decision log across transition', () => {
    const session = makeExploringSession({
      decisionLog: {
        strategy: [
          {
            id: '1',
            key: 'PLAYSTYLE',
            value: 'Engine',
            sourceQuote: 'build a machine',
            timestamp: 1000,
          },
        ],
        parameters: [
          {
            id: '2',
            key: 'COLOUR IDENTITY',
            value: 'Sultai (BUG)',
            sourceQuote: 'sultai colours',
            timestamp: 2000,
          },
        ],
        constraints: [],
      },
    })
    const result = commitCommander(session, makeCommander())
    expect(result.decisionLog).toEqual(session.decisionLog)
  })

  it('preserves assessment cache across transition', () => {
    const session = makeExploringSession()
    session.assessmentCache.set('Sol Ring', {
      pros: ['Efficient mana'],
      cons: ['Everyone has it'],
      fit_score: 9,
      fit_note: 'Auto-include',
    })
    const result = commitCommander(session, makeCommander())
    expect(result.assessmentCache.get('Sol Ring')).toBeDefined()
  })

  it('does NOT revert phase when already in building', () => {
    const session = createSession()
    const commander1 = makeCommander({ name: 'Muldrotha, the Gravetide' })
    const building = commitCommander(session, commander1)

    // Try to commit again — should return same state
    const commander2 = makeCommander({ name: 'Korvold, Fae-Cursed King' })
    const result = commitCommander(building, commander2)

    expect(result.phase).toBe('building')
    expect(result.commander!.name).toBe('Muldrotha, the Gravetide')
    expect(result).toBe(building) // Same reference — no mutation
  })

  it('is case-insensitive when matching archetype key', () => {
    const session = makeExploringSession({
      decisionLog: {
        strategy: [
          {
            id: '1',
            key: 'archetype',
            value: 'Voltron',
            sourceQuote: 'suit up',
            timestamp: Date.now(),
          },
        ],
        parameters: [],
        constraints: [],
      },
    })
    const result = commitCommander(session, makeCommander())
    expect(result.commander!.archetype).toBe('Voltron')
  })
})

// ---------------------------------------------------------------------------
// saveConcept
// ---------------------------------------------------------------------------

describe('saveConcept', () => {
  it('returns session state when in exploring phase', () => {
    const session = createSession()
    const result = saveConcept(session)
    expect(result.phase).toBe('exploring')
  })

  it('preserves decision log in the returned state', () => {
    const session = makeExploringSession({
      decisionLog: {
        strategy: [
          {
            id: '1',
            key: 'ARCHETYPE',
            value: 'Tokens',
            sourceQuote: 'token generation',
            timestamp: 1000,
          },
        ],
        parameters: [],
        constraints: [],
      },
    })
    const result = saveConcept(session)
    expect(result.decisionLog.strategy).toHaveLength(1)
    expect(result.decisionLog.strategy[0].value).toBe('Tokens')
  })

  it('returns unchanged state when in building phase', () => {
    const session = commitCommander(createSession(), makeCommander())
    const result = saveConcept(session)
    expect(result).toBe(session) // Same reference — no-op
  })
})

// ---------------------------------------------------------------------------
// saveDraft
// ---------------------------------------------------------------------------

describe('saveDraft', () => {
  it('returns session state when in building phase', () => {
    const session = commitCommander(createSession(), makeCommander())
    const result = saveDraft(session)
    expect(result.phase).toBe('building')
  })

  it('preserves deck state in the returned state', () => {
    const session = commitCommander(createSession(), makeCommander())
    const result = saveDraft(session)
    expect(result.deckState).toEqual({
      cards: [],
      suggestions: [],
      isGenerating: true,
      canvasPositions: {},
      explorationArchive: [],
    })
  })

  it('returns unchanged state when in exploring phase', () => {
    const session = createSession()
    const result = saveDraft(session)
    expect(result).toBe(session) // Same reference — no-op
  })
})
