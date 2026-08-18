'use client'

import { useCallback, useMemo } from 'react'
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
// WorkbenchTab — Minimal freeform canvas for deck viewing
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

  // Position state — computed fresh each time deckCards changes
  // We use useMemo to derive initial positions, avoiding effect races
  const canvasPositions = useMemo<Record<string, CanvasCardPosition>>(() => {
    if (deckCards.length === 0) return {}
    
    console.log('[WorkbenchTab] Computing positions for', deckCards.length, 'cards')
    
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
    
    console.log('[WorkbenchTab] Computed', Object.keys(positions).length, 'positions')
    return positions
  }, [deckCards])

  // Handlers — for minimal canvas, position updates are not persisted
  // Cards get fresh positions on each render based on deck order
  const handlePositionUpdate = useCallback((
    id: string, 
    position: { x: number; y: number },
    category?: string
  ) => {
    // No-op for minimal canvas — positions are derived from deck order
    console.log('[WorkbenchTab] Position update (ignored):', id, position)
  }, [])

  const handleDragReassign = useCallback(async (cardName: string, newCategory: string) => {
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
  }, [deckId, queryClient])

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
        showToolbar={false}
        transparentBackground={true}
      />
    </div>
  )
}
