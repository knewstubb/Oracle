'use client'

import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DeckCard as GridDeckCard } from '@/components/CardGrid'
import type { 
  DeckCard, 
  CanvasCardPosition, 
  CommittedCommander 
} from '@/lib/brew-v2-types'
import { DeckCanvas } from '@/components/brew-v2/DeckCanvas'
import { CARD_DIMENSIONS } from '@/components/brew-v2/canvas-utils'
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
// Helpers
// ---------------------------------------------------------------------------

function computeInitialPositions(
  deckCards: { uniqueId: string; primary_category: string }[]
): Record<string, CanvasCardPosition> {
  if (deckCards.length === 0) return {}
  
  const positions: Record<string, CanvasCardPosition> = {}
  const { width: cardWidth, height: cardHeight } = CARD_DIMENSIONS.deckCard
  const CANVAS_WIDTH = 1200
  const GAP = 12
  
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
    
    x += cardWidth + GAP
    if (x + cardWidth > CANVAS_WIDTH) {
      x = 40
      y += cardHeight + GAP
    }
  }
  
  return positions
}

// ---------------------------------------------------------------------------
// WorkbenchTab — Minimal freeform canvas for deck viewing
// ---------------------------------------------------------------------------

export function WorkbenchTab({ 
  deckId, 
  cards: gridCards, 
  commanderName,
  commanderScryfallId,
}: WorkbenchTabProps) {
  const queryClient = useQueryClient()
  
  // Convert GridDeckCard[] to DeckCard[] for DeckCanvas
  const deckCards = useMemo<(DeckCard & { uniqueId: string })[]>(() => {
    const validStatuses = new Set(['original', 'proxy', 'not_owned', 'generic'])
    return gridCards.map(card => {
      const parsed = parseCategoriesCapped(card.categories)
      const rawStatus = card.allocation_role as string | undefined
      const ownership_status = (rawStatus && validStatuses.has(rawStatus) 
        ? rawStatus 
        : 'original') as DeckCard['ownership_status']
      return {
        card_name: card.card_name,
        uniqueId: String(card.id),
        primary_category: parsed.primary_category || 'Other',
        additional_categories: parsed.additional_categories || [],
        ownership_status,
        cmc: 0,
        type_line: '',
        oracle_text: '',
      }
    })
  }, [gridCards])

  // Build commander data
  const commander = useMemo<CommittedCommander | null>(() => {
    if (!commanderName) return null
    
    const commanderCard = gridCards.find(
      c => c.card_name === commanderName || c.is_commander
    )
    
    const artUrl = commanderCard?.scryfall_id
      ? `https://cards.scryfall.io/art_crop/front/${commanderCard.scryfall_id.charAt(0)}/${commanderCard.scryfall_id.charAt(1)}/${commanderCard.scryfall_id}.jpg`
      : ''
    
    return {
      name: commanderName,
      artUrl,
      typeLine: 'Legendary Creature',
      colourIdentity: [],
      archetype: null,
    }
  }, [commanderName, gridCards])

  // Position state — initialized from deckCards, updated on drag
  const [canvasPositions, setCanvasPositions] = useState<Record<string, CanvasCardPosition>>(() => 
    computeInitialPositions(deckCards)
  )

  // Re-initialize positions when deckCards changes (new cards added/removed)
  // Use a ref to track the card IDs to detect changes
  const currentCardIds = useMemo(() => new Set(deckCards.map(c => c.uniqueId)), [deckCards])
  const positionCardIds = useMemo(() => new Set(Object.keys(canvasPositions)), [canvasPositions])
  
  // If cards changed, recompute positions for missing cards
  if (deckCards.length > 0 && (currentCardIds.size !== positionCardIds.size || 
      [...currentCardIds].some(id => !positionCardIds.has(id)))) {
    // Merge: keep existing positions, add new ones for new cards
    const newPositions = { ...canvasPositions }
    const { width: cardWidth, height: cardHeight } = CARD_DIMENSIONS.deckCard
    const GAP = 12
    
    // Find the rightmost/bottommost position to continue from
    let maxX = 40
    let maxY = 60
    for (const pos of Object.values(canvasPositions)) {
      if (pos.y > maxY || (pos.y === maxY && pos.x > maxX)) {
        maxX = pos.x
        maxY = pos.y
      }
    }
    let x = maxX + cardWidth + GAP
    let y = maxY
    if (x + cardWidth > 1200) {
      x = 40
      y += cardHeight + GAP
    }
    
    for (const card of deckCards) {
      if (!canvasPositions[card.uniqueId]) {
        newPositions[card.uniqueId] = {
          id: card.uniqueId,
          x,
          y,
          type: 'deck',
          updatedAt: Date.now(),
          category: card.primary_category,
        }
        x += cardWidth + GAP
        if (x + cardWidth > 1200) {
          x = 40
          y += cardHeight + GAP
        }
      }
    }
    
    // Schedule state update (can't call setState during render)
    setTimeout(() => setCanvasPositions(newPositions), 0)
  }

  // Handle position updates from dragging
  const handlePositionUpdate = useCallback((
    id: string, 
    position: { x: number; y: number },
    category?: string
  ) => {
    setCanvasPositions(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        id,
        x: position.x,
        y: position.y,
        type: 'deck',
        updatedAt: Date.now(),
        category: category ?? prev[id]?.category,
      },
    }))
  }, [])

  const handleDragReassign = useCallback(async (cardName: string, newCategory: string) => {
    try {
      await fetch(`/api/decks/${deckId}/cards/${encodeURIComponent(cardName)}/category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_category: newCategory }),
      })
      
      const { invalidateDeck } = createDeckInvalidators(queryClient)
      invalidateDeck(String(deckId))
    } catch (err) {
      console.error('[WorkbenchTab] Failed to update category:', err)
    }
  }, [deckId, queryClient])

  const handleDiscussCard = useCallback((cardName: string) => {
    console.log('[WorkbenchTab] Discuss card:', cardName)
  }, [])

  if (deckCards.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-white/50">
        <p>No cards in deck</p>
      </div>
    )
  }

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
        showToolbar={false}
        transparentBackground={true}
      />
    </div>
  )
}
