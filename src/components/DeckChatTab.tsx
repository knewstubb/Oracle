'use client'

import { useRef, useCallback, useMemo, useState } from 'react'
import { useDeckChat } from '@/hooks/useDeckChat'
import { ChatPanel, type ChatPanelHandle } from '@/components/brew-v2/ChatPanel'
import { DeckCanvas } from '@/components/brew-v2/DeckCanvas'
import type { DeckCard as GridDeckCard } from '@/components/CardGrid'
import type { DeckCard as BrewDeckCard, CanvasCardPosition } from '@/lib/brew-v2-types'
import { getNextOpenPosition, CARD_DIMENSIONS, CANVAS_GAP } from '@/components/brew-v2/canvas-utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DeckChatTabProps {
  deckId: number
  commanderName: string
  cards: GridDeckCard[]
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function parsePrimaryCategory(raw: string | null | undefined): string {
  if (!raw) return 'Other'
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string')
      return parsed[0].replace(/\(top\)|\(bottom\)/gi, '').trim()
  } catch { /* */ }
  return raw.split(',')[0]?.trim().replace(/\(top\)|\(bottom\)/gi, '') || 'Other'
}

function parseAdditionalCategories(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 1) {
      return parsed.slice(1).map((c: string) => c.replace(/\(top\)|\(bottom\)/gi, '').trim())
    }
  } catch { /* */ }
  return []
}

/** Convert GridDeckCard to BrewDeckCard format */
function toBrewDeckCard(card: GridDeckCard): BrewDeckCard {
  return {
    card_name: card.card_name,
    primary_category: parsePrimaryCategory(card.categories),
    additional_categories: parseAdditionalCategories(card.categories),
    ownership_status: (card.allocation_role as BrewDeckCard['ownership_status']) || 'not_owned',
    mana_cost: card.mana_cost || undefined,
    mana_value: card.mana_value ?? 0,
    quantity: card.quantity || 1,
  }
}


/** Generate initial canvas positions grouped by category */
function generateInitialPositions(cards: BrewDeckCard[]): Record<string, CanvasCardPosition> {
  const positions: Record<string, CanvasCardPosition> = {}
  const { width: cardWidth, height: cardHeight } = CARD_DIMENSIONS.deckCard
  
  // Group cards by category
  const groups: Record<string, BrewDeckCard[]> = {}
  for (const card of cards) {
    const cat = card.primary_category || 'Other'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(card)
  }

  // Layout: categories as columns, cards stacked vertically
  const GROUP_GAP = 40
  const CARD_GAP = 12
  const HEADER_HEIGHT = 30
  const START_X = 40
  const START_Y = 40

  let currentX = START_X
  const sortedCategories = Object.keys(groups).sort()

  for (const category of sortedCategories) {
    const categoryCards = groups[category]
    let currentY = START_Y + HEADER_HEIGHT

    for (const card of categoryCards) {
      positions[card.card_name] = {
        id: card.card_name,
        x: currentX,
        y: currentY,
        type: 'deck',
        updatedAt: Date.now(),
        category: card.primary_category,
      }
      currentY += cardHeight + CARD_GAP
    }

    currentX += cardWidth + GROUP_GAP
  }

  return positions
}

// ---------------------------------------------------------------------------
// DeckChatTab — Deck viewing/editing with chat panel
// ---------------------------------------------------------------------------

export function DeckChatTab({ deckId, commanderName, cards }: DeckChatTabProps) {
  const { messages, sendMessage, isStreaming } = useDeckChat(deckId)
  const chatInputRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>
  const chatHandleRef = useRef<ChatPanelHandle>(null)
  
  // Convert cards to brew format
  const brewCards = useMemo(() => cards.map(toBrewDeckCard), [cards])
  
  // Canvas positions (local state for chat tab — not persisted)
  const [canvasPositions, setCanvasPositions] = useState<Record<string, CanvasCardPosition>>(() => 
    generateInitialPositions(brewCards)
  )


  // Handle position updates
  const handlePositionUpdate = useCallback((id: string, position: { x: number; y: number }, category?: string) => {
    setCanvasPositions(prev => ({
      ...prev,
      [id]: {
        id,
        x: position.x,
        y: position.y,
        type: 'deck',
        updatedAt: Date.now(),
        category,
      }
    }))
  }, [])

  // Handle category reassignment (for now just update local state)
  const handleDragReassign = useCallback((cardName: string, newCategory: string) => {
    // In the chat tab, category changes are visual only (not persisted)
    // Could add API call here to persist if needed
    console.log(`Card ${cardName} reassigned to ${newCategory}`)
  }, [])

  // Handle clicking a card to discuss it
  const handleDiscussCard = useCallback((cardName: string) => {
    chatHandleRef.current?.prefill(`Tell me about [[${cardName}]] — is it pulling its weight in this deck?`)
    chatHandleRef.current?.focus()
  }, [])

  // Handle adding a card from chat suggestions
  const handleAddCard = useCallback(async (cardName: string) => {
    // Don't add duplicates (check current cards)
    if (brewCards.some(c => c.card_name === cardName)) {
      console.log(`[DeckChatTab] Card already in deck: ${cardName}`)
      return
    }

    try {
      const res = await fetch(`/api/decks/${deckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardName }),
      })

      if (!res.ok) {
        const data = await res.json()
        console.error(`[DeckChatTab] Failed to add card:`, data.error)
        return
      }

      // Refresh the page to show the new card
      // TODO: Could optimistically add to local state instead for snappier UX
      window.location.reload()
    } catch (err) {
      console.error(`[DeckChatTab] Error adding card:`, err)
    }
  }, [deckId, brewCards])

  return (
    <div className="flex h-full min-h-0">
      {/* Left side: DeckCanvas */}
      <DeckCanvas
        cards={brewCards}
        canvasPositions={canvasPositions}
        onPositionUpdate={handlePositionUpdate}
        onDragReassign={handleDragReassign}
        onDiscussCard={handleDiscussCard}
        initialLayoutMode="free-form"
      />
      
      {/* Right side: Chat panel */}
      <ChatPanel
        messages={messages}
        onSend={sendMessage}
        inputRef={chatInputRef}
        handleRef={chatHandleRef}
        isStreaming={isStreaming}
        cardLinkMode="add"
        onCardAction={handleAddCard}
      />
    </div>
  )
}
