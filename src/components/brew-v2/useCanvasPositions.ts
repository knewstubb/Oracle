// ---------------------------------------------------------------------------
// useCanvasPositions — manages canvas card positions with debounced persistence
// ---------------------------------------------------------------------------

import { useCallback, useRef } from 'react'
import type { CanvasCardPosition, DeckCard } from '@/lib/brew-v2-types'
import type { DeckAction } from '@/lib/brew-v2-deck-state'
import { getNextOpenPosition, CARD_DIMENSIONS, CANVAS_GAP } from './canvas-utils'

/** Default canvas width assumption for initial position calculations */
const DEFAULT_CANVAS_WIDTH = 1200

interface UseCanvasPositionsOptions {
  sessionId: number | null
  canvasPositions: Record<string, CanvasCardPosition>
  dispatchDeck: React.Dispatch<DeckAction>
}

interface UseCanvasPositionsReturn {
  /** Callback for BrewCanvas onPositionUpdate — updates local state and schedules persistence */
  handlePositionUpdate: (id: string, position: { x: number; y: number }, category?: string) => void
  /** Assign positions to new deck cards that don't have one yet */
  assignPositionsToNewCards: (cards: DeckCard[]) => void
}

export function useCanvasPositions({
  sessionId,
  canvasPositions,
  dispatchDeck,
}: UseCanvasPositionsOptions): UseCanvasPositionsReturn {
  // Keep a ref to the latest positions for local state management
  const positionsRef = useRef(canvasPositions)
  positionsRef.current = canvasPositions

  // --- Debounced persistence to server ---
  // NOTE: Position persistence is now handled by useBrewAutosave via skeleton_json.
  // This schedulePersist is kept as a no-op to maintain the hook's interface.
  // The local state management (handlePositionUpdate, assignPositionsToNewCards) still works.
  const schedulePersist = useCallback(() => {
    // No-op: positions now persist through the unified useBrewAutosave hook
    // which watches deckState.canvasPositions via skeleton_json serialization.
  }, [])

  // --- Handle position update from drag end ---
  const handlePositionUpdate = useCallback(
    (id: string, position: { x: number; y: number }, category?: string) => {
      dispatchDeck({ type: 'updatePosition', id, position, category })
      schedulePersist()
    },
    [dispatchDeck, schedulePersist]
  )

  // --- Assign positions to new cards that don't have one ---
  const assignPositionsToNewCards = useCallback(
    (cards: DeckCard[]) => {
      const existing = Object.values(positionsRef.current)
      let currentPositions = [...existing]

      for (const card of cards) {
        if (positionsRef.current[card.card_name]) continue // Already has a position

        const { x, y } = getNextOpenPosition(
          currentPositions,
          CARD_DIMENSIONS.deckCard.width,
          CARD_DIMENSIONS.deckCard.height,
          DEFAULT_CANVAS_WIDTH,
          CANVAS_GAP
        )

        const newPos: CanvasCardPosition = {
          id: card.card_name,
          x,
          y,
          type: 'deck',
          updatedAt: Date.now(),
        }

        // Add to running list so next card doesn't overlap
        currentPositions.push(newPos)

        // Dispatch to state (include category for mode-toggle detection)
        dispatchDeck({ type: 'updatePosition', id: card.card_name, position: { x, y }, category: card.primary_category })
      }

      // Schedule a single persist after all positions are assigned
      schedulePersist()
    },
    [dispatchDeck, schedulePersist]
  )

  return {
    handlePositionUpdate,
    assignPositionsToNewCards,
  }
}
