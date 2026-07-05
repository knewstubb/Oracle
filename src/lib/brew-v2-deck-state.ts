// ---------------------------------------------------------------------------
// Brew Mode V2 — Deck State Reducer & Persistence
// ---------------------------------------------------------------------------
// Contains both:
// 1. Pure reducer + helper functions for deck state management
// 2. Supabase-backed persistence for skeleton_json column
//
// Validates: Requirements 5.1, 5.5
// ---------------------------------------------------------------------------

import { createServerClient } from '@/lib/supabase'
import type { DeckCard, DeckState, CanvasCardPosition, CategoryHealth, DeckStatus, ArchivedItem } from './brew-v2-types'

// ---------------------------------------------------------------------------
// Action Types
// ---------------------------------------------------------------------------

export type DeckAction =
  | { type: 'addCard'; card: DeckCard }
  | { type: 'removeCard'; card_name: string }
  | { type: 'dragReassign'; card_name: string; targetCategory: string }
  | { type: 'addSuggestion'; card_name: string }
  | { type: 'setGenerating'; isGenerating: boolean }
  | { type: 'setSuggestions'; suggestions: DeckCard[] }
  | { type: 'updatePosition'; id: string; position: { x: number; y: number }; category?: string }
  | { type: 'setCanvasPositions'; positions: Record<string, CanvasCardPosition> }
  | { type: 'setArchive'; items: ArchivedItem[] }
  | { type: 'enrichCard'; card_name: string; cmc: number; type_line: string; oracle_text: string }

// ---------------------------------------------------------------------------
// Initial State
// ---------------------------------------------------------------------------

export const initialDeckState: DeckState = {
  cards: [],
  suggestions: [],
  isGenerating: false,
  canvasPositions: {},
  explorationArchive: [],
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function deckReducer(state: DeckState, action: DeckAction): DeckState {
  switch (action.type) {
    case 'addCard': {
      // Prevent duplicates — skip if card already exists in deck
      if (state.cards.some(c => c.card_name === action.card.card_name)) {
        return state
      }
      return {
        ...state,
        cards: [...state.cards, action.card],
      }
    }

    case 'removeCard': {
      return {
        ...state,
        cards: state.cards.filter((c) => c.card_name !== action.card_name),
      }
    }

    case 'dragReassign': {
      const card = state.cards.find(
        (c) => c.card_name === action.card_name
      )
      // No-op if card not found or already in target category
      if (!card || card.primary_category === action.targetCategory) {
        return state
      }
      return {
        ...state,
        cards: state.cards.map((c) =>
          c.card_name === action.card_name
            ? { ...c, primary_category: action.targetCategory }
            : c
        ),
      }
    }

    case 'addSuggestion': {
      const suggestion = state.suggestions.find(
        (s) => s.card_name === action.card_name
      )
      if (!suggestion) {
        return state
      }
      return {
        ...state,
        cards: [...state.cards, suggestion],
        suggestions: state.suggestions.filter(
          (s) => s.card_name !== action.card_name
        ),
      }
    }

    case 'setGenerating': {
      return {
        ...state,
        isGenerating: action.isGenerating,
      }
    }

    case 'setSuggestions': {
      return {
        ...state,
        suggestions: action.suggestions,
      }
    }

    case 'updatePosition': {
      const existing = state.canvasPositions[action.id]
      return {
        ...state,
        canvasPositions: {
          ...state.canvasPositions,
          [action.id]: {
            id: action.id,
            x: action.position.x,
            y: action.position.y,
            type: existing?.type ?? 'deck',
            updatedAt: Date.now(),
            category: action.category ?? existing?.category,
          },
        },
      }
    }

    case 'setCanvasPositions': {
      return {
        ...state,
        canvasPositions: action.positions,
      }
    }

    case 'setArchive': {
      return {
        ...state,
        explorationArchive: [...state.explorationArchive, ...action.items],
      }
    }

    case 'enrichCard': {
      return {
        ...state,
        cards: state.cards.map(card =>
          card.card_name === action.card_name
            ? { ...card, cmc: action.cmc, type_line: action.type_line, oracle_text: action.oracle_text }
            : card
        ),
      }
    }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Returns a map of primary_category → count of cards in that category.
 */
export function getCategoryCounts(
  state: DeckState
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const card of state.cards) {
    counts[card.primary_category] = (counts[card.primary_category] ?? 0) + 1
  }
  return counts
}

/**
 * Returns the total number of cards in the deck.
 */
export function getTotalCount(state: DeckState): number {
  return state.cards.length
}

/**
 * Computes health status for each category based on primary_category counts.
 * 
 * @param state - Current deck state
 * @param targets - Map of category name → target count (null means unmonitored)
 * @returns Array of CategoryHealth entries
 */
export function getCategoryHealth(
  state: DeckState,
  targets: Record<string, number | null>
): CategoryHealth[] {
  const counts = getCategoryCounts(state)
  const health: CategoryHealth[] = []

  for (const [name, target] of Object.entries(targets)) {
    const count = counts[name] ?? 0

    if (target === null) {
      health.push({ name, count, target, status: 'unmonitored' })
      continue
    }

    let status: CategoryHealth['status']
    if (count < target) {
      status = 'low'
    } else if (count > target) {
      status = 'high'
    } else {
      status = 'healthy'
    }

    health.push({ name, count, target, status })
  }

  return health
}


// ---------------------------------------------------------------------------
// Deck Deletion Guard
// ---------------------------------------------------------------------------

/**
 * Returns true if a deck with the given status is eligible for deletion.
 * Active decks are never deletable — only 'draft' and 'concept' statuses allow deletion.
 */
export function canDeleteDeck(status: DeckStatus | string): boolean {
  return status === 'draft' || status === 'concept'
}
