'use client'

import { useState, useCallback, useRef } from 'react'
import type {
  CommanderOption,
  CommittedCommander,
  DecisionEntry,
  DeckState,
  CanvasCardPosition,
  ArchivedItem,
} from '@/lib/brew-v2-types'
import { CanvasViewport } from './CanvasViewport'
import { CanvasToolbar } from './CanvasToolbar'
import { useCanvasZoom } from './useCanvasZoom'
import { useCanvasDrag } from './useCanvasDrag'
import { DecisionCard } from './DecisionCard'
import { ExplorationArchive } from './ExplorationArchive'
import { DeckCanvas } from './DeckCanvas'
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
// Utils
// ---------------------------------------------------------------------------

function getScryfallImageUrl(name: string): string {
  const cardName = name.includes(' // ') ? name.substring(0, name.indexOf(' // ')) : name
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}&format=image&version=normal`
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BrewCanvasProps {
  phase: 'exploring' | 'building'
  commander?: CommittedCommander | null
  candidateCards: CommanderOption[]
  decisionCards: DecisionEntry[]
  onCommit: (commander: CommanderOption) => void
  deckState: DeckState | null
  onDragReassign: (cardName: string, newCategory: string) => void
  onRemoveCard: (cardName: string) => void
  onDiscussCard: (cardName: string) => void
  onSecondaryCategories?: (cardName: string, additional: string[]) => void
  canvasPositions: Record<string, CanvasCardPosition>
  onPositionUpdate: (id: string, position: { x: number; y: number }, category?: string) => void
  explorationArchive: ArchivedItem[]
  onArchivePhase1?: (archivedItems: ArchivedItem[]) => void
}


// ---------------------------------------------------------------------------
// BrewCanvas — Orchestrates Phase 1 (exploring) and Phase 2 (building)
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
  // ---- Archive state ----
  const [archiveExpanded, setArchiveExpanded] = useState(false)

  // ---- Phase transition state ----
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showRecommitWarning, setShowRecommitWarning] = useState(false)
  const pendingCommitRef = useRef<CommanderOption | null>(null)
  const transitionCountRef = useRef(0)
  const transitionFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- Phase 1: Pan/zoom state ----
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const panOffsetRef = useRef(panOffset)
  panOffsetRef.current = panOffset

  const { zoomLevel, zoomIn, zoomOut, handleWheel, effectiveView, isAutoSwitched, setManualView, clearOverride } = 
    useCanvasZoom(100, panOffsetRef, setPanOffset)


  // ---- Phase 1: Drag hook ----
  const handleDragEnd = useCallback(
    (id: string, delta: { x: number; y: number }) => {
      const existing = canvasPositions[id]
      if (existing) {
        onPositionUpdate(id, { x: existing.x + delta.x, y: existing.y + delta.y })
      } else {
        onPositionUpdate(id, { x: delta.x, y: delta.y })
      }
    },
    [canvasPositions, onPositionUpdate]
  )

  const { draggingId, dragOffset, getPointerProps } = useCanvasDrag({
    onDragEnd: handleDragEnd,
    onGroupDragEnd: () => {},
    selectedIds: new Set(),
    onClearSelection: () => {},
    zoomLevel: zoomLevel / 100,
  })

  // ---- Transition completion ----
  const completeTransition = useCallback(() => {
    const cmd = pendingCommitRef.current
    if (!cmd) return

    const archivedItems: ArchivedItem[] = [
      ...candidateCards.filter((c) => c.scryfallId !== cmd.scryfallId).map((c): ArchivedItem => ({ type: 'candidate', data: c })),
      ...decisionCards.map((d): ArchivedItem => ({ type: 'decision', data: d })),
    ]

    onArchivePhase1?.(archivedItems)
    onCommit(cmd)
    setIsTransitioning(false)
    pendingCommitRef.current = null
    transitionCountRef.current = 0
  }, [candidateCards, decisionCards, onCommit, onArchivePhase1])


  // ---- Commit with transition ----
  const handleCommitWithTransition = useCallback(
    (cmd: CommanderOption) => {
      if (deckState && deckState.cards.length > 0) {
        pendingCommitRef.current = cmd
        setShowRecommitWarning(true)
        return
      }

      pendingCommitRef.current = cmd
      const total = candidateCards.length + decisionCards.length
      transitionCountRef.current = total
      setIsTransitioning(true)

      if (total === 0) {
        completeTransition()
      } else {
        if (transitionFallbackRef.current) clearTimeout(transitionFallbackRef.current)
        transitionFallbackRef.current = setTimeout(() => {
          if (pendingCommitRef.current) completeTransition()
        }, 600)
      }
    },
    [deckState, candidateCards.length, decisionCards.length, completeTransition]
  )

  const handleTransitionEnd = useCallback(() => {
    transitionCountRef.current -= 1
    if (transitionCountRef.current <= 0) {
      if (transitionFallbackRef.current) {
        clearTimeout(transitionFallbackRef.current)
        transitionFallbackRef.current = null
      }
      completeTransition()
    }
  }, [completeTransition])

  const handleRecommitConfirm = useCallback(() => {
    setShowRecommitWarning(false)
    const cmd = pendingCommitRef.current
    if (!cmd) return

    const total = candidateCards.length + decisionCards.length
    transitionCountRef.current = total
    setIsTransitioning(true)

    if (total === 0) {
      completeTransition()
    } else {
      if (transitionFallbackRef.current) clearTimeout(transitionFallbackRef.current)
      transitionFallbackRef.current = setTimeout(() => {
        if (pendingCommitRef.current) completeTransition()
      }, 600)
    }
  }, [candidateCards.length, decisionCards.length, completeTransition])

  const handleRecommitCancel = useCallback(() => {
    setShowRecommitWarning(false)
    pendingCommitRef.current = null
  }, [])


  // ---- Recommit warning dialog ----
  const recommitDialog = (
    <Dialog open={showRecommitWarning} onOpenChange={(open) => { if (!open) handleRecommitCancel() }}>
      <DialogContent data-testid="recommit-warning-modal">
        <DialogHeader>
          <DialogTitle>Replace current skeleton?</DialogTitle>
          <DialogDescription>
            Switching to <span className="font-medium text-foreground">{pendingCommitRef.current?.name}</span> will 
            replace your current <span className="font-medium text-foreground">{deckState?.cards.length ?? 0}</span>-card 
            skeleton. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" onClick={handleRecommitConfirm} data-testid="recommit-confirm-button">
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  // ---- Archive overlay ----
  const archiveOverlay = explorationArchive.length > 0 ? (
    <ExplorationArchive items={explorationArchive} expanded={archiveExpanded} onToggle={() => setArchiveExpanded(!archiveExpanded)} />
  ) : null


  // =========================================================================
  // Phase 2: Building — delegate to DeckCanvas
  // =========================================================================
  if (phase === 'building' && deckState) {
    return (
      <>
        <DeckCanvas
          cards={deckState.cards}
          commander={commander}
          canvasPositions={canvasPositions}
          onPositionUpdate={onPositionUpdate}
          onDragReassign={onDragReassign}
          onDiscussCard={onDiscussCard}
          onSecondaryCategories={onSecondaryCategories}
          initialLayoutMode="free-form"
          overlayContent={archiveOverlay}
        />
        {recommitDialog}
      </>
    )
  }

  // =========================================================================
  // Phase 1: Exploring — render candidate and decision cards
  // =========================================================================
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden" data-testid="brew-canvas">
      <CanvasToolbar
        zoomLevel={zoomLevel}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        layoutMode="free-form"
        onLayoutModeChange={() => {}}
        viewDensity={effectiveView}
        onViewDensityChange={setManualView}
        isAutoSwitched={isAutoSwitched}
        onClearViewOverride={clearOverride}
        disableViewDensity={false}
      />

      <CanvasViewport zoomLevel={zoomLevel} panOffset={panOffset} onWheel={handleWheel}>
        {/* Candidate Cards */}
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
                transform: isTransitioning ? undefined : `translate3d(${(pos?.x ?? 0) + (offset?.x ?? 0)}px, ${(pos?.y ?? 0) + (offset?.y ?? 0)}px, 0)`,
              }}
              data-testid={`candidate-card-${posId}`}
              onTransitionEnd={isTransitioning ? handleTransitionEnd : undefined}
              {...(isTransitioning ? {} : getPointerProps(posId))}
            >
              <CandidateCard candidate={candidate} onCommit={() => handleCommitWithTransition(candidate)} />
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
                transform: isTransitioning ? undefined : `translate3d(${(pos?.x ?? 0) + (offset?.x ?? 0)}px, ${(pos?.y ?? 0) + (offset?.y ?? 0)}px, 0)`,
              }}
              data-testid={`decision-card-${posId}`}
              onTransitionEnd={isTransitioning ? handleTransitionEnd : undefined}
              {...(isTransitioning ? {} : getPointerProps(posId))}
            >
              <DecisionCard decision={decision} position={{ x: 0, y: 0 }} pointerProps={{ onPointerDown: () => {} }} isDragging={false} dragOffset={null} />
            </div>
          )
        })}
      </CanvasViewport>

      {archiveOverlay}
      {recommitDialog}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CandidateCard — Phase 1 commander candidate
// ---------------------------------------------------------------------------

function CandidateCard({ candidate, onCommit }: { candidate: CommanderOption; onCommit: () => void }) {
  return (
    <div className="w-[200px] relative group flex flex-col">
      <div
        className="rounded-lg overflow-hidden flex flex-col"
        style={{
          border: `3px solid ${candidate.owned ? '#4a4a4a' : '#ec4899'}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <img src={getScryfallImageUrl(candidate.name)} alt={candidate.name} className="w-full" loading="lazy" />
        <div className="flex items-center justify-center py-1" style={{ backgroundColor: candidate.owned ? '#3a3a3a' : '#ec4899' }}>
          <span className="text-[9px] font-medium uppercase tracking-wider text-white">
            {candidate.owned ? 'OWNED' : (candidate.description || 'UNOWNED')}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onCommit() }}
        className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <span className="rounded-lg bg-[#378ADD] px-4 py-2 text-[11px] font-medium text-white shadow-md hover:brightness-110">
          Commit as Commander
        </span>
      </button>
    </div>
  )
}
