'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react'
import { OracleChat } from './OracleChat'
import { RecommendationCard } from './RecommendationCard'
import { ConfirmationModal } from './ConfirmationModal'
import { useDebriefSession } from '@/hooks/useDebriefSession'
import { Badge } from '@/components/ui/badge'
import type { DebriefBrief } from '@/lib/debrief-types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DebriefPanelProps {
  deckId: number
  commanderName: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Context Panel: Deck Summary (investigating phase)
// ---------------------------------------------------------------------------

function DeckSummaryCard({ commanderName }: { commanderName: string }) {
  return (
    <div className="p-3 space-y-3">
      <h3 className="text-[length:var(--fs-sm)] font-medium uppercase tracking-wide text-muted-foreground">
        Deck
      </h3>
      <div className="space-y-2">
        <p className="text-[length:var(--fs-md)] font-medium text-foreground">{commanderName}</p>
        <Badge variant="secondary" className="text-[11px]">
          Post-Game Debrief
        </Badge>
      </div>
      <p className="text-[length:var(--fs-sm)] text-muted-foreground leading-relaxed">
        Tell me about your game — what happened, what worked, and what didn&apos;t.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Context Panel: Brief Confirmation (confirming phase)
// ---------------------------------------------------------------------------

function DebriefBriefCard({
  brief,
  onConfirm,
  onEdit,
  isLoading,
}: {
  brief: DebriefBrief
  onConfirm: () => void
  onEdit: () => void
  isLoading: boolean
}) {
  return (
    <div className="p-3 space-y-3">
      <h3 className="text-[length:var(--fs-sm)] font-medium uppercase tracking-wide text-muted-foreground">
        Game Summary
      </h3>

      {/* Outcome */}
      <div className="flex items-center gap-2">
        <span className="text-[length:var(--fs-sm)] text-muted-foreground">Outcome:</span>
        <Badge
          variant={
            brief.gameOutcome === 'win'
              ? 'default'
              : brief.gameOutcome === 'loss'
                ? 'destructive'
                : 'secondary'
          }
          className="text-[11px]"
        >
          {brief.gameOutcome.charAt(0).toUpperCase() + brief.gameOutcome.slice(1)}
        </Badge>
      </div>

      {/* Problem cards */}
      {brief.problemCards.length > 0 && (
        <div>
          <span className="text-[11px] text-muted-foreground block mb-1">
            Problem cards:
          </span>
          <div className="flex flex-wrap gap-1">
            {brief.problemCards.map((card) => (
              <span
                key={card}
                className="text-[11px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive"
              >
                {card}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Effective cards */}
      {brief.effectiveCards.length > 0 && (
        <div>
          <span className="text-[11px] text-muted-foreground block mb-1">
            Effective cards:
          </span>
          <div className="flex flex-wrap gap-1">
            {brief.effectiveCards.map((card) => (
              <span
                key={card}
                className="text-[11px] px-1.5 py-0.5 rounded bg-[rgba(29,158,117,0.1)] text-[#1D9E75]"
              >
                {card}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Loss pattern */}
      {brief.lossPattern && (
        <div>
          <span className="text-[11px] text-muted-foreground block mb-1">
            Pattern:
          </span>
          <p className="text-[length:var(--fs-sm)] text-foreground/80">{brief.lossPattern}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[length:var(--fs-sm)] font-medium text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#1D9E75' }}
        >
          {isLoading ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-3" aria-hidden="true" />
          )}
          Confirm
        </button>
        <button
          onClick={onEdit}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[length:var(--fs-sm)] font-medium text-white/70 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            border: '0.5px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          Edit
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Context Panel: Loading (analysing phase)
// ---------------------------------------------------------------------------

function AnalysingIndicator() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-4 h-full">
      <Loader2 className="size-6 animate-spin text-[#1D9E75]" aria-hidden="true" />
      <p className="text-[length:var(--fs-sm)] text-muted-foreground text-center leading-relaxed">
        Checking your collection and EDHREC...
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Context Panel: Summary (complete phase)
// ---------------------------------------------------------------------------

function DebriefSummaryCard({
  summary,
}: {
  summary: { totalApplied: number; totalSkipped: number; totalDisagreed: number; deckDetailUrl: string }
}) {
  return (
    <div className="p-3 space-y-3">
      <h3 className="text-[length:var(--fs-sm)] font-medium uppercase tracking-wide text-muted-foreground">
        Session Complete
      </h3>

      <div className="space-y-2">
        {summary.totalApplied > 0 && (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-3.5 text-[#1D9E75]" aria-hidden="true" />
            <span className="text-[length:var(--fs-sm)] text-foreground">
              {summary.totalApplied} change{summary.totalApplied === 1 ? '' : 's'} applied
            </span>
          </div>
        )}
        {summary.totalSkipped > 0 && (
          <div className="flex items-center gap-2">
            <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-[length:var(--fs-sm)] text-muted-foreground">
              {summary.totalSkipped} skipped
            </span>
          </div>
        )}
        {summary.totalDisagreed > 0 && (
          <div className="flex items-center gap-2">
            <AlertCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-[length:var(--fs-sm)] text-muted-foreground">
              {summary.totalDisagreed} disagreed
            </span>
          </div>
        )}
      </div>

      {summary.deckDetailUrl && (
        <a
          href={summary.deckDetailUrl}
          className="text-[length:var(--fs-sm)] text-[#1D9E75] underline underline-offset-2 hover:opacity-80"
        >
          View updated deck →
        </a>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DebriefPanel — Orchestrator Component
// ---------------------------------------------------------------------------

export function DebriefPanel({ deckId, commanderName, onClose }: DebriefPanelProps) {
  const {
    state,
    startSession,
    sendInvestigationMessage,
    confirmBrief,
    editBrief,
    actOnRecommendation,
    isStreaming,
    streamingText,
  } = useDebriefSession()

  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Start session automatically on mount
  useEffect(() => {
    startSession(deckId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  // ---------------------------------------------------------------------------
  // Close handling — confirmation dialog if session is active
  // ---------------------------------------------------------------------------

  const handleCloseAttempt = useCallback(() => {
    const activePhases = ['investigating', 'confirming', 'analysing', 'recommending']
    if (activePhases.includes(state.phase)) {
      setShowExitConfirm(true)
    } else {
      onClose()
    }
  }, [state.phase, onClose])

  const handleConfirmExit = useCallback(() => {
    setShowExitConfirm(false)
    onClose()
  }, [onClose])

  const handleCancelExit = useCallback(() => {
    setShowExitConfirm(false)
  }, [])

  // ---------------------------------------------------------------------------
  // Message handler — only enabled during investigating phase
  // ---------------------------------------------------------------------------

  const handleSendMessage = useCallback(
    (text: string) => {
      if (state.phase === 'investigating') {
        sendInvestigationMessage(text)
      }
    },
    [state.phase, sendInvestigationMessage]
  )

  // ---------------------------------------------------------------------------
  // Brief confirmation actions
  // ---------------------------------------------------------------------------

  const handleConfirmBrief = useCallback(async () => {
    setActionLoading(true)
    await confirmBrief()
    setActionLoading(false)
  }, [confirmBrief])

  const handleEditBrief = useCallback(() => {
    editBrief('I need to correct something about that summary.')
  }, [editBrief])

  // ---------------------------------------------------------------------------
  // Recommendation action handler
  // ---------------------------------------------------------------------------

  const handleRecommendationAction = useCallback(
    async (actionType: 'applied' | 'skipped' | 'disagreed') => {
      setActionLoading(true)
      await actOnRecommendation(actionType)
      setActionLoading(false)
    },
    [actOnRecommendation]
  )

  // ---------------------------------------------------------------------------
  // Context panel content — phase-dependent
  // ---------------------------------------------------------------------------

  const contextPanel = (() => {
    switch (state.phase) {
      case 'idle':
        return null

      case 'investigating':
        return <DeckSummaryCard commanderName={commanderName} />

      case 'confirming':
        return state.brief ? (
          <DebriefBriefCard
            brief={state.brief}
            onConfirm={handleConfirmBrief}
            onEdit={handleEditBrief}
            isLoading={actionLoading}
          />
        ) : null

      case 'analysing':
        return <AnalysingIndicator />

      case 'recommending': {
        const currentRec = state.recommendations[state.currentRecIndex]
        return currentRec ? (
          <RecommendationCard
            recommendation={currentRec}
            onAction={handleRecommendationAction}
            isLoading={actionLoading}
            index={state.currentRecIndex + 1}
            total={state.recommendations.length}
          />
        ) : null
      }

      case 'complete':
        return state.summary ? (
          <DebriefSummaryCard summary={state.summary} />
        ) : null

      default:
        return null
    }
  })()

  // ---------------------------------------------------------------------------
  // Input state — only enabled during investigating phase
  // ---------------------------------------------------------------------------

  const inputDisabled = state.phase !== 'investigating' || isStreaming

  const inputPlaceholder =
    state.phase === 'investigating'
      ? 'Describe what happened in your game...'
      : state.phase === 'complete'
        ? 'Session complete'
        : 'Waiting...'

  // ---------------------------------------------------------------------------
  // Footer — "Done" button during complete phase
  // ---------------------------------------------------------------------------

  const footer =
    state.phase === 'complete' ? (
      <button
        onClick={onClose}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-[length:var(--fs-md)] font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: '#1D9E75' }}
      >
        Done
      </button>
    ) : null

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <OracleChat
        mode="overlay"
        open={true}
        onClose={handleCloseAttempt}
        messages={state.messages}
        isStreaming={isStreaming}
        streamingText={streamingText}
        contextPanel={contextPanel}
        onSendMessage={handleSendMessage}
        inputDisabled={inputDisabled}
        inputPlaceholder={inputPlaceholder}
        footer={footer}
      />

      {/* Exit confirmation dialog */}
      <ConfirmationModal
        open={showExitConfirm}
        onConfirm={handleConfirmExit}
        onCancel={handleCancelExit}
        title="End Debrief?"
        description="Your session is still in progress. If you leave now, your progress will be lost."
        confirmLabel="End Session"
      />
    </>
  )
}
