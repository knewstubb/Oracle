'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { DeckCard, CanvasCardPosition, CommittedCommander } from '@/lib/brew-v2-types'
import type { StructuredCategories } from '@/lib/categoryUtils'
import { CanvasViewport } from './CanvasViewport'
import { CanvasToolbar } from './CanvasToolbar'
import { useCanvasZoom } from './useCanvasZoom'
import { useCanvasDrag } from './useCanvasDrag'
import { useMarqueeSelect } from './useMarqueeSelect'
import { CanvasDeckCard } from './CanvasDeckCard'
import { CommanderCard } from './CommanderCard'
import { PiledColumn } from './PiledColumn'
import { CurveView } from './CurveView'
import { getNextOpenPosition, CARD_DIMENSIONS, CANVAS_GAP } from './canvas-utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DeckCanvasProps {
  /** The deck's cards - can include optional uniqueId for duplicate card names */
  cards: (DeckCard & { uniqueId?: string })[]

  /** Optional committed commander to display */
  commander?: CommittedCommander | null

  /** Canvas positions for all items */
  canvasPositions: Record<string, CanvasCardPosition>

  /** Called when a card/commander position changes */
  onPositionUpdate: (id: string, position: { x: number; y: number }, category?: string) => void

  /** Called when a card is dragged to a new category */
  onDragReassign: (cardName: string, newCategory: string) => void

  /** Called when the discuss action is triggered on a card */
  onDiscussCard: (cardName: string) => void

  /** Called when secondary categories are updated (optional) */
  onSecondaryCategories?: (cardName: string, additional: string[]) => void

  /** Initial layout mode (default: 'free-form') */
  initialLayoutMode?: 'free-form' | 'piled' | 'curve'

  /** Whether to show the toolbar (default: true) */
  showToolbar?: boolean

  /** Additional content to render in the toolbar area */
  toolbarExtra?: React.ReactNode

  /** Additional overlay content (e.g., archive panel) */
  overlayContent?: React.ReactNode

  /** Use transparent background (default: false) */
  transparentBackground?: boolean
}

// ---------------------------------------------------------------------------
// DeckCanvas — Shared spatial canvas for deck cards
// ---------------------------------------------------------------------------

/**
 * A reusable canvas component for displaying and interacting with deck cards.
 * Supports:
 * - Three layout modes: free-form, piled, curve
 * - Pan (space+drag) and zoom (scroll wheel)
 * - Marquee multi-selection
 * - Drag to reposition cards
 * - Category reassignment
 * - Commander card display
 *
 * Used by:
 * - BrewCanvas (for Phase 2 building)
 * - DeckChatTab (for deck viewing/editing with chat)
 */
export function DeckCanvas({
  cards,
  commander,
  canvasPositions,
  onPositionUpdate,
  onDragReassign,
  onDiscussCard,
  onSecondaryCategories,
  initialLayoutMode = 'free-form',
  showToolbar = true,
  toolbarExtra,
  overlayContent,
  transparentBackground = false,
}: DeckCanvasProps) {
  // ---- Layout mode state ----
  const [layoutMode, setLayoutMode] = useState<'free-form' | 'piled' | 'curve'>(initialLayoutMode)
  const prevLayoutModeRef = useRef<'free-form' | 'piled' | 'curve'>(initialLayoutMode)

  // ---- Pan state (space+drag) ----
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const panOffsetRef = useRef(panOffset)
  panOffsetRef.current = panOffset
  const [isPanning, setIsPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  // Track spacebar for pan mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setSpaceHeld(true)
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false)
        setIsPanning(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // ---- Mode toggle: position preservation (piled → free-form) ----
  // Also handles initial free-form mode if positions are missing
  useEffect(() => {
    const prevMode = prevLayoutModeRef.current
    prevLayoutModeRef.current = layoutMode

    // Only act in free-form mode
    if (layoutMode !== 'free-form') return
    if (cards.length === 0) return

    const cardsNeedingPosition: string[] = []

    for (const card of cards) {
      // Use uniqueId if available (for decks with duplicate card names)
      const posId = card.uniqueId ?? card.card_name
      const existing = canvasPositions[posId]
      if (!existing) {
        cardsNeedingPosition.push(posId)
      } else if (prevMode === 'piled' && existing.category && existing.category !== card.primary_category) {
        // Only reset category on piled→free-form transition
        cardsNeedingPosition.push(posId)
      }
    }

    if (cardsNeedingPosition.length === 0) return
    
    console.log('[DeckCanvas] Assigning positions for', cardsNeedingPosition.length, 'cards (prevMode:', prevMode, ')')

    const existingPositions = Object.values(canvasPositions).filter(
      (pos) => !cardsNeedingPosition.includes(pos.id)
    )

    const canvasWidth = 1200
    const { width: cardWidth, height: cardHeight } = CARD_DIMENSIONS.deckCard

    for (const posId of cardsNeedingPosition) {
      const card = cards.find((c) => (c.uniqueId ?? c.card_name) === posId)
      if (!card) continue

      const newPos = getNextOpenPosition(
        existingPositions,
        cardWidth,
        cardHeight,
        canvasWidth,
        CANVAS_GAP
      )

      onPositionUpdate(posId, newPos, card.primary_category)

      existingPositions.push({
        id: posId,
        x: newPos.x,
        y: newPos.y,
        type: 'deck',
        updatedAt: Date.now(),
        category: card.primary_category,
      })
    }
  }, [layoutMode, cards, canvasPositions, onPositionUpdate])

  // ---- Zoom hook ----
  const {
    zoomLevel,
    zoomIn,
    zoomOut,
    handleWheel,
    effectiveView,
    isAutoSwitched,
    setManualView,
    clearOverride,
  } = useCanvasZoom(100, panOffsetRef, setPanOffset)

  // ---- Drag hook ----
  const handleDragEnd = useCallback(
    (id: string, delta: { x: number; y: number }) => {
      const existing = canvasPositions[id]
      if (existing) {
        onPositionUpdate(id, {
          x: existing.x + delta.x,
          y: existing.y + delta.y,
        })
      } else {
        onPositionUpdate(id, { x: delta.x, y: delta.y })
      }
    },
    [canvasPositions, onPositionUpdate]
  )

  // ---- Marquee selection ----
  const {
    selectedIds,
    isSelecting,
    marqueeRect,
    handleMarqueePointerDown,
    handleMarqueePointerMove,
    handleMarqueePointerUp,
    clearSelection,
  } = useMarqueeSelect({
    canvasPositions,
    zoomLevel: zoomLevel / 100,
    panOffset,
    isPanning,
    cardWidth: effectiveView === 'card' ? 180 : 168,
    cardHeight: effectiveView === 'card' ? 252 : 32,
  })

  const { draggingId, dragOffset, zIndexMap, getPointerProps } = useCanvasDrag({
    onDragEnd: handleDragEnd,
    onGroupDragEnd: (ids, delta) => {
      for (const id of ids) {
        const existing = canvasPositions[id]
        if (existing) {
          onPositionUpdate(id, {
            x: existing.x + delta.x,
            y: existing.y + delta.y,
          })
        }
      }
    },
    selectedIds,
    onClearSelection: clearSelection,
    zoomLevel: zoomLevel / 100,
  })

  // ---- Canvas pointer handlers (pan + marquee) ----
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (spaceHeld) {
      e.preventDefault()
      setIsPanning(true)
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } else {
      const target = e.target as HTMLElement
      if (!target.closest('[data-testid^="deck-card-"], [data-testid="committed-commander"]')) {
        handleMarqueePointerDown(e)
      }
    }
  }, [spaceHeld, panOffset, handleMarqueePointerDown])

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      setPanOffset({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy })
    } else {
      handleMarqueePointerMove(e)
    }
  }, [isPanning, handleMarqueePointerMove])

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false)
    } else {
      handleMarqueePointerUp(e)
    }
  }, [isPanning, handleMarqueePointerUp])

  // ---- View density change handler ----
  const handleViewDensityChange = useCallback(
    (view: 'card' | 'name') => {
      setManualView(view)
    },
    [setManualView]
  )

  // ---- Available categories (derived from cards) ----
  const availableCategories = useMemo(() => {
    const categories = new Set<string>()
    for (const card of cards) {
      if (card.primary_category !== 'Other') {
        categories.add(card.primary_category)
      }
    }
    const sorted = Array.from(categories).sort()
    sorted.push('Other')
    return sorted
  }, [cards])

  // ---- Category editing handler ----
  const handleCategoryChange = useCallback(
    (cardName: string, updated: StructuredCategories) => {
      const card = cards.find((c) => c.card_name === cardName)
      if (!card) return

      if (updated.primary_category !== card.primary_category) {
        onDragReassign(cardName, updated.primary_category)
      }

      if (onSecondaryCategories) {
        onSecondaryCategories(cardName, updated.additional_categories)
      }
    },
    [cards, onDragReassign, onSecondaryCategories]
  )

  // ---- Group by Category action ----
  const handleGroupByCategory = useCallback(() => {
    if (cards.length === 0) return

    const groups: Record<string, string[]> = {}
    for (const card of cards) {
      const cat = card.primary_category || 'Other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(card.card_name)
    }

    const CARD_WIDTH = 190
    const CARD_HEIGHT = 270
    const GROUP_GAP = 40
    const CARD_GAP = 12
    const HEADER_HEIGHT = 30
    const START_X = 40
    const START_Y = 40

    let currentX = START_X
    const sortedCategories = Object.keys(groups).sort()

    for (const category of sortedCategories) {
      const cardNames = groups[category]
      let currentY = START_Y + HEADER_HEIGHT

      for (const cardName of cardNames) {
        onPositionUpdate(cardName, { x: currentX, y: currentY }, category)
        currentY += CARD_HEIGHT + CARD_GAP
      }

      currentX += CARD_WIDTH + GROUP_GAP
    }
  }, [cards, onPositionUpdate])

  // ---- Render content based on layout mode ----
  const renderContent = () => {
    console.log('[DeckCanvas] renderContent - cards:', cards.length, 'positions:', Object.keys(canvasPositions).length, 'layoutMode:', layoutMode)
    
    // Commander card (always shown in free-form mode if present)
    const isCommanderDragging = draggingId === 'commander'
    const commanderOffset = isCommanderDragging ? dragOffset : null

    const commanderCard = commander && layoutMode === 'free-form' ? (
      <div
        key="committed-commander"
        className="absolute"
        style={{
          transform: `translate3d(${(canvasPositions['commander']?.x ?? 20) + (commanderOffset?.x ?? 0)}px, ${(canvasPositions['commander']?.y ?? 20) + (commanderOffset?.y ?? 0)}px, 0)`,
          zIndex: isCommanderDragging ? 9999 : 2,
          opacity: isCommanderDragging ? 0.85 : 1,
        }}
        data-testid="committed-commander"
      >
        <CommanderCard
          commander={commander}
          pointerProps={getPointerProps('commander')}
          isDragging={isCommanderDragging}
          dragOffset={commanderOffset}
          onDiscuss={onDiscussCard}
        />
      </div>
    ) : null

    if (layoutMode === 'curve') {
      return <CurveView cards={cards} zoomLevel={zoomLevel} />
    }

    if (layoutMode === 'piled') {
      const grouped = cards.reduce<Record<string, DeckCard[]>>(
        (acc, card) => {
          const cat = card.primary_category
          if (!acc[cat]) acc[cat] = []
          acc[cat].push(card)
          return acc
        },
        {}
      )

      return (
        <div className="flex gap-4 p-4" data-testid="piled-columns">
          {Object.entries(grouped).map(([category, categoryCards]) => (
            <PiledColumn
              key={category}
              category={category}
              cards={categoryCards}
              healthStatus="unmonitored"
              onDragIn={(cardName) => onDragReassign(cardName, category)}
              isDragTarget={false}
            />
          ))}
        </div>
      )
    }

    // Free-form mode
    console.log('[DeckCanvas] Rendering free-form mode with', cards.length, 'cards, positions:', Object.keys(canvasPositions).length)
    
    // Compute fallback positions for cards without saved positions
    // This ensures cards are always visible even if position assignment fails
    const fallbackPositions: Record<string, { x: number; y: number }> = {}
    let fallbackX = 40
    let fallbackY = 60
    const CARD_WIDTH = 190
    const CARD_HEIGHT = 270
    const GAP = 12
    
    for (const card of cards) {
      const posId = card.uniqueId ?? card.card_name
      if (!canvasPositions[posId]) {
        fallbackPositions[posId] = { x: fallbackX, y: fallbackY }
        fallbackX += CARD_WIDTH + GAP
        if (fallbackX > 1000) {
          fallbackX = 40
          fallbackY += CARD_HEIGHT + GAP
        }
      }
    }
    
    if (Object.keys(fallbackPositions).length > 0) {
      console.log('[DeckCanvas] Using fallback positions for', Object.keys(fallbackPositions).length, 'cards')
    }
    
    return (
      <>
        {commanderCard}
        {cards.map((card) => {
          // Use uniqueId if available (for decks with duplicate card names like basic lands)
          const posId = card.uniqueId ?? card.card_name
          const pos = canvasPositions[posId] ?? fallbackPositions[posId]
          const isDragging = draggingId === posId
          const isInGroupDrag = selectedIds.has(posId) && draggingId !== null && selectedIds.has(draggingId ?? '') && selectedIds.size > 1
          const offset = isDragging ? dragOffset : (isInGroupDrag ? dragOffset : null)
          const cardZIndex = zIndexMap.get(posId) ?? 1

          return (
            <CanvasDeckCard
              key={posId}
              card={card}
              position={{ x: pos?.x ?? 0, y: pos?.y ?? 0 }}
              viewDensity={effectiveView}
              zoomLevel={zoomLevel / 100}
              pointerProps={getPointerProps(posId)}
              isDragging={isDragging}
              isSelected={selectedIds.has(posId)}
              cardZIndex={cardZIndex}
              dragOffset={offset}
              onDiscuss={onDiscussCard}
              availableCategories={availableCategories}
              onCategoryChange={handleCategoryChange}
            />
          )
        })}
      </>
    )
  }

  return (
    <div
      className={`relative flex flex-1 flex-col overflow-hidden ${transparentBackground ? 'bg-transparent' : 'bg-[#0d0d0d]'} ${spaceHeld ? 'cursor-grab' : ''} ${isPanning ? '!cursor-grabbing' : ''}`}
      data-testid="deck-canvas"
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
    >
      {/* Toolbar */}
      {showToolbar && (
        <CanvasToolbar
          zoomLevel={zoomLevel}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          layoutMode={layoutMode}
          onLayoutModeChange={setLayoutMode}
          viewDensity={effectiveView}
          onViewDensityChange={handleViewDensityChange}
          isAutoSwitched={isAutoSwitched}
          onClearViewOverride={clearOverride}
          disableViewDensity={layoutMode === 'curve'}
          onGroupByCategory={layoutMode === 'free-form' ? handleGroupByCategory : undefined}
        />
      )}

      {/* Canvas Viewport */}
      <CanvasViewport
        zoomLevel={zoomLevel}
        panOffset={panOffset}
        onWheel={handleWheel}
      >
        {renderContent()}
      </CanvasViewport>

      {/* Marquee selection rectangle overlay */}
      {isSelecting && marqueeRect && (
        <div
          className="absolute pointer-events-none border-2 border-[#378ADD] bg-[rgba(55,138,221,0.1)] rounded-sm"
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y + (showToolbar ? 34 : 0),
            width: marqueeRect.width,
            height: marqueeRect.height,
          }}
        />
      )}

      {/* Additional overlay content */}
      {overlayContent}

      {/* Toolbar extra content */}
      {toolbarExtra}
    </div>
  )
}
