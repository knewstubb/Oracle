'use client'

import { useState, useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DeckCard as GridDeckCard } from '@/components/CardGrid'
import type { 
  DeckCard, 
  CanvasCardPosition, 
  CommittedCommander 
} from '@/lib/brew-v2-types'
import { DeckCanvas } from '@/components/brew-v2/DeckCanvas'
import { getNextOpenPosition, CARD_DIMENSIONS, CANVAS_GAP } from '@/components/brew-v2/canvas-utils'
import { createDeckInvalidators } from '@/hooks/useDeckQueryKeys'
import { parseCategoriesCapped } from '@/lib/categoryUtils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkbenchTabProps {
  deckId: number
  cards: GridDeckCard[]
  commanderName: string
  commanderScryfallId?: string
}

// ---------------------------------------------------------------------------
// Position persistence
// ---------------------------------------------------------------------------

const POSITIONS_STORAGE_KEY = (deckId: number) => `workbench-positions-${deckId}`

function loadPositions(deckId: number): Record<string, CanvasCardPosition> {
  if (typeof window === 'undefined') return {}
  try {
    const stored = localStorage.getItem(POSITIONS_STORAGE_KEY(deckId))
    if (stored) return JSON.parse(stored)
  } catch {
    // Ignore parse errors
  }
  return {}
}

function savePositions(deckId: number, positions: Record<string, CanvasCardPosition>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(POSITIONS_STORAGE_KEY(deckId), JSON.stringify(positions))
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Position reducer
// ---------------------------------------------------------------------------

type PositionAction = 
  | { type: 'set'; positions: Record<string, CanvasCardPosition> }
  | { type: 'update'; id: string; position: { x: number; y: number }; category?: string }

function positionReducer(
  state: Record<string, CanvasCardPosition>,
  action: PositionAction
): Record<string, CanvasCardPosition> {
  switch (action.type) {
    case 'set':
      return action.positions
    case 'update':
      return {
        ...state,
        [action.id]: {
          id: action.id,
          x: action.position.x,
          y: action.position.y,
          type: 'deck',
          updatedAt: Date.now(),
          category: action.category,
        },
      }
    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// WorkbenchTab
// ---------------------------------------------------------------------------

export function WorkbenchTab({ 
  deckId, 
  cards: gridCards, 
  commanderName,
  commanderScryfallId,
}: WorkbenchTabProps) {
  const queryClient = useQueryClient()
  
  // Debug logging
  console.log('[WorkbenchTab] Received gridCards:', gridCards?.length, 'cards')
  console.log('[WorkbenchTab] First card:', gridCards?.[0])
  
  // Convert GridDeckCard[] to DeckCard[] for DeckCanvas
  // Use card.id as a unique identifier since card_name can have duplicates (basic lands)
  const deckCards = useMemo<(DeckCard & { uniqueId: string })[]>(() => {
    const validStatuses = new Set(['original', 'proxy', 'not_owned', 'generic'])
    const result = gridCards.map(card => {
      const parsed = parseCategoriesCapped(card.categories)
      // Normalize ownership status to a known value — prevents yellow "unknown" flash
      const rawStatus = card.allocation_role as string | undefined
      const ownership_status = (rawStatus && validStatuses.has(rawStatus) 
        ? rawStatus 
        : 'original') as DeckCard['ownership_status']
      return {
        card_name: card.card_name,
        uniqueId: String(card.id), // Use DB id for unique identification
        primary_category: parsed.primary_category || 'Other',
        additional_categories: parsed.additional_categories || [],
        ownership_status,
        cmc: 0, // Not needed for canvas display
        type_line: '',
        oracle_text: '',
      }
    })
    console.log('[WorkbenchTab] Converted deckCards:', result.length)
    return result
  }, [gridCards])

  // Build commander data
  const commander = useMemo<CommittedCommander | null>(() => {
    if (!commanderName) return null
    
    // Find commander card in the deck for art URL
    const commanderCard = gridCards.find(
      c => c.card_name === commanderName || c.is_commander
    )
    
    // Construct art URL from scryfall_id if available
    const artUrl = commanderCard?.scryfall_id
      ? `https://cards.scryfall.io/art_crop/front/${commanderCard.scryfall_id.charAt(0)}/${commanderCard.scryfall_id.charAt(1)}/${commanderCard.scryfall_id}.jpg`
      : ''
    
    return {
      name: commanderName,
      artUrl,
      typeLine: 'Legendary Creature', // Not available in GridDeckCard
      colourIdentity: [], // Not needed for display
      archetype: null,
    }
  }, [commanderName, gridCards])

  // Position state — start with computed positions, then allow updates
  const [canvasPositions, setCanvasPositions] = useState<Record<string, CanvasCardPosition>>({})
  
  // Initialize positions when deckCards change
  useEffect(() => {
    if (deckCards.length === 0) return
    
    // Check if we already have positions for all cards
    const allHavePositions = deckCards.every(card => canvasPositions[card.uniqueId])
    if (allHavePositions && Object.keys(canvasPositions).length > 0) return
    
    const positions: Record<string, CanvasCardPosition> = {}
    const { width: cardWidth, height: cardHeight } = CARD_DIMENSIONS.deckCard
    const CANVAS_WIDTH = 1200
    
    let x = 40
    let y = 60
    
    for (const card of deckCards) {
      positions[card.uniqueId] = {
        id: card.uniqueId,
        x,
        y,
        type: 'deck',
        updatedAt: Date.now(),
        category: card.primary_category,
      }
      
      x += cardWidth + 12
      if (x + cardWidth > CANVAS_WIDTH) {
        x = 40
        y += cardHeight + 12
      }
    }
    
    console.log('[WorkbenchTab] Setting positions for', Object.keys(positions).length, 'cards')
    setCanvasPositions(positions)
  }, [deckCards, canvasPositions])

  // Save positions to localStorage when they change
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (Object.keys(canvasPositions).length === 0) return
    
    // Debounce saves
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      savePositions(deckId, canvasPositions)
    }, 500)
    
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [deckId, canvasPositions])

  // Initialize positions for cards that don't have one
  // Use a ref to track if we've done initial position assignment to avoid infinite loops
  const hasInitializedRef = useRef(false)
  
  useEffect(() => {
    console.log('[WorkbenchTab] Position init effect - deckCards:', deckCards.length, 'positions:', Object.keys(canvasPositions).length)
    
    if (deckCards.length === 0) {
      console.log('[WorkbenchTab] No deck cards, skipping position init')
      return
    }
    if (hasInitializedRef.current) {
      console.log('[WorkbenchTab] Already initialized, skipping')
      return
    }
    
    // Build set of current card IDs
    const currentCardIds = new Set(deckCards.map(c => c.uniqueId))
    
    // Check which cards have valid positions
    const cardsWithPosition = deckCards.filter(card => canvasPositions[card.uniqueId])
    const cardsNeedingPosition = deckCards.filter(card => !canvasPositions[card.uniqueId])
    
    // Count stale positions (positions for cards that no longer exist)
    const stalePositionCount = Object.keys(canvasPositions).filter(id => !currentCardIds.has(id)).length
    
    console.log('[WorkbenchTab] Cards with position:', cardsWithPosition.length, 'needing:', cardsNeedingPosition.length, 'stale positions:', stalePositionCount)

    // If all cards have positions and no stale data, we're done
    if (cardsNeedingPosition.length === 0 && stalePositionCount === 0) {
      console.log('[WorkbenchTab] All cards have positions, marking initialized')
      hasInitializedRef.current = true
      return
    }

    // If there's significant stale data or many cards need positions, start fresh
    // This handles the common case of localStorage having old position IDs (card names) 
    // that don't match new IDs (DB row IDs)
    const startFresh = cardsNeedingPosition.length > deckCards.length * 0.3 || stalePositionCount > 5
    
    const { width: cardWidth, height: cardHeight } = CARD_DIMENSIONS.deckCard
    const newPositions: Record<string, CanvasCardPosition> = {}
    
    if (startFresh) {
      console.log('[WorkbenchTab] Starting fresh - too many cards need positions or stale data detected')
      // Assign all cards new positions
      for (const card of deckCards) {
        const { x, y } = getNextOpenPosition(
          Object.values(newPositions),
          cardWidth,
          cardHeight,
          1200,
          CANVAS_GAP
        )
        newPositions[card.uniqueId] = {
          id: card.uniqueId,
          x,
          y,
          type: 'deck',
          updatedAt: Date.now(),
          category: card.primary_category,
        }
      }
    } else {
      // Keep valid existing positions, add new ones for cards without
      for (const card of cardsWithPosition) {
        newPositions[card.uniqueId] = canvasPositions[card.uniqueId]
      }
      
      for (const card of cardsNeedingPosition) {
        const { x, y } = getNextOpenPosition(
          Object.values(newPositions),
          cardWidth,
          cardHeight,
          1200,
          CANVAS_GAP
        )
        newPositions[card.uniqueId] = {
          id: card.uniqueId,
          x,
          y,
          type: 'deck',
          updatedAt: Date.now(),
          category: card.primary_category,
        }
      }
    }

    console.log('[WorkbenchTab] Setting', Object.keys(newPositions).length, 'positions')
    setCanvasPositions(newPositions)
    hasInitializedRef.current = true
  }, [deckCards, canvasPositions])

  // Handlers
  const handlePositionUpdate = useCallback((
    id: string, 
    position: { x: number; y: number },
    category?: string
  ) => {
    setCanvasPositions(prev => ({
      ...prev,
      [id]: {
        id,
        x: position.x,
        y: position.y,
        type: 'deck',
        updatedAt: Date.now(),
        category,
      },
    }))
  }, [])

  const handleDragReassign = useCallback(async (cardName: string, newCategory: string) => {
    // Update local position with new category
    setCanvasPositions(prev => ({
      ...prev,
      [cardName]: {
        ...prev[cardName],
        id: cardName,
        x: prev[cardName]?.x ?? 0,
        y: prev[cardName]?.y ?? 0,
        type: 'deck',
        updatedAt: Date.now(),
        category: newCategory,
      },
    }))

    // Persist category change to DB
    try {
      await fetch(`/api/decks/${deckId}/cards/${encodeURIComponent(cardName)}/category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_category: newCategory }),
      })
      
      // Invalidate deck queries to refresh data
      const { invalidateDeck } = createDeckInvalidators(queryClient)
      invalidateDeck(String(deckId))
    } catch (err) {
      console.error('[WorkbenchTab] Failed to update category:', err)
    }
  }, [deckId, canvasPositions, queryClient])

  const handleDiscussCard = useCallback((cardName: string) => {
    // Could open Oracle sidebar with card context
    console.log('[WorkbenchTab] Discuss card:', cardName)
  }, [])

  console.log('[WorkbenchTab] Rendering with:', deckCards.length, 'cards,', Object.keys(canvasPositions).length, 'positions')

  return (
    <div className="h-full w-full">
      <DeckCanvas
        cards={deckCards}
        commander={commander}
        canvasPositions={canvasPositions}
        onPositionUpdate={handlePositionUpdate}
        onDragReassign={handleDragReassign}
        onDiscussCard={handleDiscussCard}
        initialLayoutMode="free-form"
        showToolbar={true}
        transparentBackground={true}
      />
    </div>
  )
}
