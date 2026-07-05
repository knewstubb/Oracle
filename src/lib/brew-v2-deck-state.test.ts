import { describe, it, expect } from 'vitest'
import { deckReducer, initialDeckState } from './brew-v2-deck-state'
import type { DeckCard, DeckState, CanvasCardPosition } from './brew-v2-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeckCard(name: string, category = 'Creatures'): DeckCard {
  return {
    card_name: name,
    primary_category: category,
    additional_categories: [],
    ownership_status: 'original',
    cmc: 3,
    type_line: 'Creature',
    oracle_text: '',
  }
}

function stateWithCards(cards: DeckCard[], positions: Record<string, CanvasCardPosition> = {}): DeckState {
  return {
    ...initialDeckState,
    cards,
    canvasPositions: positions,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deckReducer — updatePosition', () => {
  it('adds a new position when card has no existing position', () => {
    const state = stateWithCards([makeDeckCard('Sol Ring')])
    const result = deckReducer(state, {
      type: 'updatePosition',
      id: 'Sol Ring',
      position: { x: 100, y: 200 },
    })

    expect(result.canvasPositions['Sol Ring']).toBeDefined()
    expect(result.canvasPositions['Sol Ring'].x).toBe(100)
    expect(result.canvasPositions['Sol Ring'].y).toBe(200)
    expect(result.canvasPositions['Sol Ring'].type).toBe('deck')
    expect(result.canvasPositions['Sol Ring'].id).toBe('Sol Ring')
  })

  it('updates an existing position preserving the type', () => {
    const existingPos: CanvasCardPosition = {
      id: 'Lightning Bolt',
      x: 50,
      y: 50,
      type: 'deck',
      updatedAt: 1000,
    }
    const state = stateWithCards(
      [makeDeckCard('Lightning Bolt')],
      { 'Lightning Bolt': existingPos }
    )

    const result = deckReducer(state, {
      type: 'updatePosition',
      id: 'Lightning Bolt',
      position: { x: 300, y: 400 },
    })

    expect(result.canvasPositions['Lightning Bolt'].x).toBe(300)
    expect(result.canvasPositions['Lightning Bolt'].y).toBe(400)
    expect(result.canvasPositions['Lightning Bolt'].type).toBe('deck')
    expect(result.canvasPositions['Lightning Bolt'].updatedAt).toBeGreaterThan(1000)
  })

  it('does NOT change primary_category (position-only update)', () => {
    const card = makeDeckCard('Path to Exile', 'Removal')
    const state = stateWithCards([card], {
      'Path to Exile': { id: 'Path to Exile', x: 0, y: 0, type: 'deck', updatedAt: 1 },
    })

    const result = deckReducer(state, {
      type: 'updatePosition',
      id: 'Path to Exile',
      position: { x: 500, y: 600 },
    })

    // Card's category is unchanged
    expect(result.cards[0].primary_category).toBe('Removal')
    // Position is updated
    expect(result.canvasPositions['Path to Exile'].x).toBe(500)
    expect(result.canvasPositions['Path to Exile'].y).toBe(600)
  })

  it('stores category when explicitly provided', () => {
    const state = stateWithCards([makeDeckCard('Sol Ring', 'Ramp')])
    const result = deckReducer(state, {
      type: 'updatePosition',
      id: 'Sol Ring',
      position: { x: 100, y: 200 },
      category: 'Ramp',
    })

    expect(result.canvasPositions['Sol Ring'].category).toBe('Ramp')
  })

  it('preserves existing category when no category is passed', () => {
    const existingPos: CanvasCardPosition = {
      id: 'Counterspell',
      x: 50,
      y: 50,
      type: 'deck',
      updatedAt: 1000,
      category: 'Interaction',
    }
    const state = stateWithCards(
      [makeDeckCard('Counterspell', 'Interaction')],
      { 'Counterspell': existingPos }
    )

    const result = deckReducer(state, {
      type: 'updatePosition',
      id: 'Counterspell',
      position: { x: 300, y: 400 },
    })

    expect(result.canvasPositions['Counterspell'].category).toBe('Interaction')
    expect(result.canvasPositions['Counterspell'].x).toBe(300)
  })

  it('overwrites category when a new category is explicitly passed', () => {
    const existingPos: CanvasCardPosition = {
      id: 'Swords to Plowshares',
      x: 50,
      y: 50,
      type: 'deck',
      updatedAt: 1000,
      category: 'Removal',
    }
    const state = stateWithCards(
      [makeDeckCard('Swords to Plowshares', 'Interaction')],
      { 'Swords to Plowshares': existingPos }
    )

    const result = deckReducer(state, {
      type: 'updatePosition',
      id: 'Swords to Plowshares',
      position: { x: 200, y: 300 },
      category: 'Interaction',
    })

    expect(result.canvasPositions['Swords to Plowshares'].category).toBe('Interaction')
  })
})

describe('deckReducer — setCanvasPositions', () => {
  it('replaces all canvas positions', () => {
    const state = stateWithCards([], {
      oldCard: { id: 'oldCard', x: 10, y: 20, type: 'deck', updatedAt: 1 },
    })

    const newPositions: Record<string, CanvasCardPosition> = {
      newCard: { id: 'newCard', x: 100, y: 200, type: 'deck', updatedAt: 2 },
    }

    const result = deckReducer(state, {
      type: 'setCanvasPositions',
      positions: newPositions,
    })

    expect(result.canvasPositions).toEqual(newPositions)
    expect(result.canvasPositions['oldCard']).toBeUndefined()
  })
})

describe('deckReducer — dragReassign does NOT happen in free-form', () => {
  it('updatePosition does not call dragReassign logic', () => {
    const card = makeDeckCard('Swords to Plowshares', 'Removal')
    const state = stateWithCards([card])

    // In free-form mode, only updatePosition is dispatched (not dragReassign)
    const result = deckReducer(state, {
      type: 'updatePosition',
      id: 'Swords to Plowshares',
      position: { x: 250, y: 350 },
    })

    // Category unchanged — updatePosition never touches cards array
    expect(result.cards[0].primary_category).toBe('Removal')
  })
})
