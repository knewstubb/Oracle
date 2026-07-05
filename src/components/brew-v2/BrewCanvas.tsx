'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type {
  CommanderOption,
  CommittedCommander,
  DecisionEntry,
  DeckState,
  CanvasCardPosition,
  ArchivedItem,
} from '@/lib/brew-v2-types'
import type { StructuredCategories } from '@/lib/categoryUtils'
import { CanvasViewport } from './CanvasViewport'
import { CanvasToolbar } from './CanvasToolbar'
import { useCanvasZoom } from './useCanvasZoom'
import { useCanvasDrag } from './useCanvasDrag'
import { useMarqueeSelect } from './useMarqueeSelect'
import { CanvasDeckCard } from './CanvasDeckCard'
import { PiledColumn } from './PiledColumn'
import { CurveView } from './CurveView'
import { getNextOpenPosition, CARD_DIMENSIONS, CANVAS_GAP } from './canvas-utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BrewCanvasProps {
  // Phase and data
  phase: 'exploring' | 'building'

  // Committed commander (shown on canvas during building phase)
  commander?: CommittedCommander | null

  // Phase 1 data
  candidateCards: CommanderOption[]
  decisionCards: DecisionEntry[]
  onCommit: (commander: CommanderOption) => void

  // Phase 2 data
  deckState: DeckState | null
  onDragReassign: (cardName: string, newCategory: string) => void
  onRemoveCard: (cardName: string) => void
  onDiscussCard: (cardName: string) => void

  // Category editing — secondary categories update (primary uses onDragReassign)
  onSecondaryCategories?: (cardName: string, additional: string[]) => void

  // Canvas positions
  canvasPositions: Record<string, CanvasCardPosition>
  onPositionUpdate: (id: string, position: { x: number; y: number }, category?: string) => void

  // Archive
  explorationArchive: ArchivedItem[]

  // Phase transition callback — called after animation completes to archive Phase 1 cards
  onArchivePhase1?: (archivedItems: ArchivedItem[]) => void
}

// ---------------------------------------------------------------------------
// BrewCanvas — main canvas orchestrator component
// ---------------------------------------------------------------------------

export function BrewCanvas({
  phase,
  commander,
  candidateCards,
  decisionCards,
  onCommit,
  deckState,
  onDragReassign,
  onRemoveCard,
  onDiscussCard,
  onSecondaryCategories,
  canvasPositions,
  onPositionUpdate,
  explorationArchive,
  onArchivePhase1,
}: BrewCanvasProps) {
  // ---- Layout mode state ----
  const [layoutMode, setLayoutMode] = useState<'free-form' | 'piled' | 'curve'>('free-form')
  const prevLayoutModeRef = useRef<'free-form' | 'piled' | 'curve'>('free-form')

  // ---- Pan state (space+drag) ----
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const panOffsetRef = useRef(panOffset)
  // Keep ref in sync with state
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

  // (Pan pointer handlers defined after useMarqueeSelect hook below)

  // ---- Archive expanded state ----
  const [archiveExpanded, setArchiveExpanded] = useState(false)

  // ---- Phase transition state ----
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showRecommitWarning, setShowRecommitWarning] = useState(false)
  const pendingCommitRef = useRef<CommanderOption | null>(null)
  const transitionCountRef = useRef(0)

  // ---- Mode toggle: position preservation (piled → free-form) ----
  // When switching from piled back to free-form, ensure every deck card has a
  // valid position. Cards added during piled mode or whose category changed
  // (drag-to-column) get a fresh position via getNextOpenPosition.
  useEffect(() => {
    const prevMode = prevLayoutModeRef.current
    prevLayoutModeRef.current = layoutMode

    // Only act on piled → free-form transition (not curve → free-form;
    // cards in curve mode have no meaningful saved position to recover)
    if (prevMode !== 'piled' || layoutMode !== 'free-form') return
    if (!deckState || deckState.cards.length === 0) return

    const cardsNeedingPosition: string[] = []

    for (const card of deckState.cards) {
      const existing = canvasPositions[card.card_name]
      if (!existing) {
        // Card was added during piled mode — has no free-form position
        cardsNeedingPosition.push(card.card_name)
      } else if (existing.category && existing.category !== card.primary_category) {
        // Card's category changed during piled mode (drag-to-column)
        // Old position was in a different category cluster — assign fresh
        cardsNeedingPosition.push(card.card_name)
      }
    }

    if (cardsNeedingPosition.length === 0) return

    // Build the list of existing positions (excluding those being reassigned)
    const existingPositions = Object.values(canvasPositions).filter(
      (pos) => !cardsNeedingPosition.includes(pos.id)
    )

    // Default canvas width for position calculation
    const canvasWidth = 1200
    const { width: cardWidth, height: cardHeight } = CARD_DIMENSIONS.deckCard

    // Assign fresh positions for each card that needs one
    for (const cardName of cardsNeedingPosition) {
      const card = deckState.cards.find((c) => c.card_name === cardName)
      if (!card) continue

      const newPos = getNextOpenPosition(
        existingPositions,
        cardWidth,
        cardHeight,
        canvasWidth,
        CANVAS_GAP
      )

      // Update position via parent callback (include new category)
      onPositionUpdate(cardName, newPos, card.primary_category)

      // Add to existing positions to avoid overlap with next card
      existingPositions.push({
        id: cardName,
        x: newPos.x,
        y: newPos.y,
        type: 'deck',
        updatedAt: Date.now(),
        category: card.primary_category,
      })
    }
  }, [layoutMode, deckState, canvasPositions, onPositionUpdate])

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
        // New card without an existing position — place at delta from origin
        onPositionUpdate(id, { x: delta.x, y: delta.y })
      }
    },
    [canvasPositions, onPositionUpdate]
  )

  // ---- Marquee selection (must be before useCanvasDrag which references selectedIds) ----
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

  // ---- Canvas pointer handlers (pan + marquee) — defined after hooks ----
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (spaceHeld) {
      e.preventDefault()
      setIsPanning(true)
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } else {
      const target = e.target as HTMLElement
      if (!target.closest('[data-testid^="deck-card-"], [data-testid^="candidate-card-"], [data-testid="committed-commander"]')) {
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

  // ---- Category editing: available categories derived from deck state ----
  const availableCategories = useMemo(() => {
    if (!deckState) return []
    const categories = new Set<string>()
    for (const card of deckState.cards) {
      if (card.primary_category !== 'Other') {
        categories.add(card.primary_category)
      }
    }
    const sorted = Array.from(categories).sort()
    sorted.push('Other')
    return sorted
  }, [deckState])

  // ---- Category editing: change handler ----
  const handleCategoryChange = useCallback(
    (cardName: string, updated: StructuredCategories) => {
      const card = deckState?.cards.find((c) => c.card_name === cardName)
      if (!card) return

      // If primary category changed, use the existing drag reassign path
      // (triggers piled-mode re-grouping)
      if (updated.primary_category !== card.primary_category) {
        onDragReassign(cardName, updated.primary_category)
      }

      // For secondary categories, call the optional parent callback
      if (onSecondaryCategories) {
        onSecondaryCategories(cardName, updated.additional_categories)
      }
    },
    [deckState, onDragReassign, onSecondaryCategories]
  )

  // ---- Group by Category: rearrange card positions into spatial groups ----
  const handleGroupByCategory = useCallback(() => {
    if (!deckState || deckState.cards.length === 0) return

    // Group cards by primary_category
    const groups: Record<string, string[]> = {}
    for (const card of deckState.cards) {
      const cat = card.primary_category || 'Other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(card.card_name)
    }

    // Layout: arrange groups in columns with cards stacked vertically
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
      let currentY = START_Y + HEADER_HEIGHT // Leave space for a visual header

      for (const cardName of cardNames) {
        onPositionUpdate(cardName, { x: currentX, y: currentY }, category)
        currentY += CARD_HEIGHT + CARD_GAP
      }

      currentX += CARD_WIDTH + GROUP_GAP
    }
  }, [deckState, onPositionUpdate])

  // ---- Phase transition: complete after animation ----
  const completeTransition = useCallback(() => {
    const commander = pendingCommitRef.current
    if (!commander) return

    // Archive all Phase 1 cards EXCEPT the committed commander
    const archivedItems: ArchivedItem[] = [
      ...candidateCards
        .filter((c) => c.scryfallId !== commander.scryfallId)
        .map((c): ArchivedItem => ({ type: 'candidate', data: c })),
      ...decisionCards.map((d): ArchivedItem => ({ type: 'decision', data: d })),
    ]

    // Notify parent to archive Phase 1 cards
    onArchivePhase1?.(archivedItems)

    // Fire the actual commit (triggers skeleton generation)
    onCommit(commander)

    // Reset transition state
    setIsTransitioning(false)
    pendingCommitRef.current = null
    transitionCountRef.current = 0
  }, [candidateCards, decisionCards, onCommit, onArchivePhase1])

  // ---- Phase transition: commit handler ----
  const transitionFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCommitWithTransition = useCallback(
    (commander: CommanderOption) => {
      // Check if this is a re-commit (skeleton already exists)
      const hasExistingSkeleton = deckState && deckState.cards.length > 0

      if (hasExistingSkeleton) {
        // Store the pending commander and show destructive warning
        pendingCommitRef.current = commander
        setShowRecommitWarning(true)
        return
      }

      // First commit — animate Phase 1 cards out
      pendingCommitRef.current = commander
      const totalCards = candidateCards.length + decisionCards.length
      transitionCountRef.current = totalCards
      setIsTransitioning(true)

      // If no cards to animate, complete immediately
      if (totalCards === 0) {
        completeTransition()
      } else {
        // Fallback: if transitionend events never fire (reduced-motion, missing
        // CSS from-value, or browser quirks), force completion after 600ms
        if (transitionFallbackRef.current) clearTimeout(transitionFallbackRef.current)
        transitionFallbackRef.current = setTimeout(() => {
          if (pendingCommitRef.current) {
            completeTransition()
          }
        }, 600)
      }
    },
    [deckState, candidateCards.length, decisionCards.length, completeTransition]
  )

  // ---- Phase transition: onTransitionEnd handler ----
  const handleTransitionEnd = useCallback(() => {
    transitionCountRef.current -= 1

    // Only complete once all cards have finished animating
    if (transitionCountRef.current <= 0) {
      if (transitionFallbackRef.current) {
        clearTimeout(transitionFallbackRef.current)
        transitionFallbackRef.current = null
      }
      completeTransition()
    }
  }, [completeTransition])

  // ---- Re-commit: confirm handler ----
  const handleRecommitConfirm = useCallback(() => {
    setShowRecommitWarning(false)
    const commander = pendingCommitRef.current
    if (!commander) return

    // Animate Phase 1 cards out (if any remain on canvas)
    const totalCards = candidateCards.length + decisionCards.length
    transitionCountRef.current = totalCards
    setIsTransitioning(true)

    if (totalCards === 0) {
      // No Phase 1 cards to animate — proceed directly
      completeTransition()
    } else {
      // Fallback timeout (same as initial commit)
      if (transitionFallbackRef.current) clearTimeout(transitionFallbackRef.current)
      transitionFallbackRef.current = setTimeout(() => {
        if (pendingCommitRef.current) {
          completeTransition()
        }
      }, 600)
    }
  }, [candidateCards.length, decisionCards.length, completeTransition])

  // ---- Re-commit: cancel handler ----
  const handleRecommitCancel = useCallback(() => {
    setShowRecommitWarning(false)
    pendingCommitRef.current = null
  }, [])

  // ---- Render Phase 1 content (exploring) ----
  const renderPhase1Content = () => (
    <>
      {/* Candidate Cards (commander options) */}
      {candidateCards.map((candidate) => {
        const posId = candidate.scryfallId
        const pos = canvasPositions[posId]
        const isDragging = draggingId === posId
        const offset = isDragging ? dragOffset : null

        return (
          <div
            key={posId}
            className={`absolute ${isDragging ? 'opacity-40' : ''} ${isTransitioning ? 'phase-transition-out' : ''}`}
            style={{
              transform: isTransitioning
                ? undefined // Let CSS class handle the transform
                : `translate3d(${(pos?.x ?? 0) + (offset?.x ?? 0)}px, ${(pos?.y ?? 0) + (offset?.y ?? 0)}px, 0)`,
            }}
            data-testid={`candidate-card-${posId}`}
            onTransitionEnd={isTransitioning ? handleTransitionEnd : undefined}
            {...(isTransitioning ? {} : getPointerProps(posId))}
          >
            {/* Candidate commander card — ownership-aware styling */}
            <div className="w-[200px] relative group flex flex-col">
              <div
                className="rounded-lg overflow-hidden flex flex-col"
                style={{
                  border: `3px solid ${candidate.owned ? '#4a4a4a' : '#ec4899'}`,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
              >
                <img
                  src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(candidate.name)}&format=image&version=normal`}
                  alt={candidate.name}
                  className="w-full"
                  loading="lazy"
                />
                {/* Bottom bar — OWNED or price */}
                <div
                  className="flex items-center justify-center py-1"
                  style={{ backgroundColor: candidate.owned ? '#3a3a3a' : '#ec4899' }}
                >
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white">
                    {candidate.owned ? 'OWNED' : (candidate.description || 'UNOWNED')}
                  </span>
                </div>
              </div>
              {/* Commit button overlay on hover */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCommitWithTransition(candidate)
                }}
                className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <span className="rounded-lg bg-[#378ADD] px-4 py-2 text-[11px] font-semibold text-white shadow-md hover:brightness-110">
                  Commit as Commander
                </span>
              </button>
            </div>
          </div>
        )
      })}

      {/* Decision Cards */}
      {decisionCards.map((decision) => {
        const posId = decision.id
        const pos = canvasPositions[posId]
        const isDragging = draggingId === posId
        const offset = isDragging ? dragOffset : null

        return (
          <div
            key={posId}
            className={`absolute ${isDragging ? 'opacity-40' : ''} ${isTransitioning ? 'phase-transition-out' : ''}`}
            style={{
              transform: isTransitioning
                ? undefined // Let CSS class handle the transform
                : `translate3d(${(pos?.x ?? 0) + (offset?.x ?? 0)}px, ${(pos?.y ?? 0) + (offset?.y ?? 0)}px, 0)`,
            }}
            data-testid={`decision-card-${posId}`}
            onTransitionEnd={isTransitioning ? handleTransitionEnd : undefined}
            {...(isTransitioning ? {} : getPointerProps(posId))}
          >
            {/* Placeholder — DecisionCard component will be implemented in a subsequent task */}
            <div className="w-[140px] rounded-lg border border-border/50 bg-background/80 p-2 text-[10px]">
              <p className="font-medium uppercase">{decision.key}</p>
              <p className="text-muted-foreground">{decision.value}</p>
            </div>
          </div>
        )
      })}
    </>
  )

  // ---- Render Phase 2 content (building) ----
  const renderPhase2Content = () => {
    if (!deckState) return null

    // Commander card — always visible in building phase with crown and ownership border
    const commanderCard = commander ? (
      <div
        key="committed-commander"
        className="absolute"
        style={{
          transform: `translate3d(${canvasPositions['commander']?.x ?? 20}px, ${canvasPositions['commander']?.y ?? 20}px, 0)`,
          zIndex: 2,
        }}
        {...getPointerProps('commander')}
      >
        <div className="flex flex-col items-center" style={{ width: 180 }}>
          {/* Crown icon */}
          <div className="mb-1 text-2xl">👑</div>
          {/* Card with dark surround */}
          <div
            className="rounded-lg overflow-hidden flex flex-col"
            style={{
              width: 180,
              border: '3px solid #4a4a4a',
              backgroundColor: '#1a1a2a',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            <img
              src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(commander.name)}&format=image&version=normal`}
              alt={commander.name}
              className="w-full object-cover"
              loading="lazy"
            />
            {/* Category bar */}
            <div className="flex items-center justify-center py-1.5" style={{ backgroundColor: '#3a3a3a' }}>
              <span className="text-[9px] font-bold uppercase tracking-wider text-white">
                COMMANDER
              </span>
            </div>
          </div>
        </div>
      </div>
    ) : null

    if (layoutMode === 'curve') {
      return <CurveView cards={deckState.cards} zoomLevel={zoomLevel} />
    }

    if (layoutMode === 'piled') {
      // Piled mode — group cards by category into columns
      const grouped = deckState.cards.reduce<Record<string, typeof deckState.cards>>(
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
          {Object.entries(grouped).map(([category, cards]) => (
            <PiledColumn
              key={category}
              category={category}
              cards={cards}
              healthStatus="unmonitored"
              onDragIn={(cardName) => onDragReassign(cardName, category)}
              isDragTarget={false}
            />
          ))}
        </div>
      )
    }

    // Free-form mode — each deck card positioned spatially
    return (
      <>
        {commanderCard}
        {deckState.cards.map((card) => {
          const posId = card.card_name
          const pos = canvasPositions[posId]
          const isDragging = draggingId === posId
          // For group drag: apply offset to all selected cards, not just the dragged one
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
      className={`relative flex flex-1 flex-col overflow-hidden ${spaceHeld ? 'cursor-grab' : ''} ${isPanning ? '!cursor-grabbing' : ''}`}
      data-testid="brew-canvas"
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
    >
      {/* Toolbar */}
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
        onGroupByCategory={phase === 'building' ? handleGroupByCategory : undefined}
      />

      {/* Canvas Viewport */}
      <CanvasViewport
        zoomLevel={zoomLevel}
        panOffset={panOffset}
        onWheel={handleWheel}
      >
        {phase === 'exploring' ? renderPhase1Content() : renderPhase2Content()}
      </CanvasViewport>

      {/* Marquee selection rectangle overlay */}
      {isSelecting && marqueeRect && (
        <div
          className="absolute pointer-events-none border-2 border-[#378ADD] bg-[rgba(55,138,221,0.1)] rounded-sm"
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y + 34, // offset for toolbar height
            width: marqueeRect.width,
            height: marqueeRect.height,
          }}
        />
      )}

      {/* Exploration Archive (overlay, bottom-right) */}
      {explorationArchive.length > 0 && (
        <div
          className="absolute bottom-3 right-3 z-10"
          data-testid="exploration-archive"
        >
          {/* Placeholder — ExplorationArchive component will be implemented in a subsequent task */}
          <button
            type="button"
            onClick={() => setArchiveExpanded(!archiveExpanded)}
            className="flex items-center gap-1.5 rounded-md border border-border/50 bg-background/90 px-2 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur-sm hover:bg-accent/50 transition-colors"
          >
            Archive
            <span className="rounded-full bg-[rgba(55,138,221,0.15)] px-1.5 py-0.5 text-[9px] text-[#378ADD]">
              {explorationArchive.length}
            </span>
          </button>

          {archiveExpanded && (
            <div className="mt-1 max-h-[200px] w-[200px] overflow-y-auto rounded-md border border-border/50 bg-background/95 p-2 backdrop-blur-sm">
              {explorationArchive.map((item, idx) => (
                <div
                  key={idx}
                  className="py-0.5 text-[9px] text-muted-foreground truncate"
                >
                  {item.type === 'candidate'
                    ? (item.data as CommanderOption).name
                    : `${(item.data as DecisionEntry).key}: ${(item.data as DecisionEntry).value}`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Destructive re-commit warning modal */}
      <Dialog
        open={showRecommitWarning}
        onOpenChange={(open) => {
          if (!open) handleRecommitCancel()
        }}
      >
        <DialogContent data-testid="recommit-warning-modal">
          <DialogHeader>
            <DialogTitle>Replace current skeleton?</DialogTitle>
            <DialogDescription>
              Switching to{' '}
              <span className="font-semibold text-foreground">
                {pendingCommitRef.current?.name}
              </span>{' '}
              will replace your current{' '}
              <span className="font-semibold text-foreground">
                {deckState?.cards.length ?? 0}
              </span>
              -card skeleton. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleRecommitConfirm}
              data-testid="recommit-confirm-button"
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
