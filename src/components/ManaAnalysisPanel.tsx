'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowRight,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import type { DeckCard } from '@/components/CardGrid'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LandSwap {
  current: string
  suggested: string
  reasoning: string
  owned: boolean
}

interface ManaAnalysisResult {
  colorDistribution: Record<string, number>
  landCount: number
  recommendedLandCount: number
  coverageGaps: string[]
  suggestions: LandSwap[]
}

interface ManaAnalysisPanelProps {
  deckId: number
  commanderName: string
  cards: DeckCard[]
}

type PanelState = 'idle' | 'loading' | 'success' | 'error'

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const COLOUR_LABELS: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
}

const COLOUR_CSS: Record<string, string> = {
  W: 'bg-amber-100 dark:bg-amber-200',
  U: 'bg-blue-500',
  B: 'bg-gray-800 dark:bg-gray-700',
  R: 'bg-red-500',
  G: 'bg-green-600',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ManaAnalysisPanel({
  deckId,
  commanderName,
  cards,
}: ManaAnalysisPanelProps) {
  const [panelState, setPanelState] = useState<PanelState>('idle')
  const [result, setResult] = useState<ManaAnalysisResult | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [collectionOnly, setCollectionOnly] = useState(false)
  const [pendingSwap, setPendingSwap] = useState<LandSwap | null>(null)
  const [isWriting, setIsWriting] = useState(false)

  const mutation = useMutation({
    mutationFn: async () => {
      setPanelState('loading')
      setErrorMessage('')

      const res = await fetch('/api/ai/mana-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId, collectionOnly }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Mana analysis failed')
      }
      return data as ManaAnalysisResult
    },
    onSuccess: (data) => {
      setResult(data)
      setPanelState('success')
    },
    onError: (err: Error) => {
      setErrorMessage(err.message)
      setPanelState('error')
    },
  })

  const handleAnalyze = () => mutation.mutate()

  const handleAcceptSwap = async () => {
    if (!pendingSwap) return
    setIsWriting(true)
    try {
      const changes: { cardName: string; action: string }[] = []
      if (pendingSwap.current) {
        changes.push({ cardName: pendingSwap.current, action: 'remove' })
      }
      changes.push({ cardName: pendingSwap.suggested, action: 'add' })

      const res = await fetch('/api/archidekt/write-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId, changes }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update Archidekt')
      }
      toast.success(
        pendingSwap.current
          ? `Swapped ${pendingSwap.current} → ${pendingSwap.suggested}.`
          : `Added ${pendingSwap.suggested} to deck.`
      )
      setPendingSwap(null)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update Archidekt'
      )
    } finally {
      setIsWriting(false)
      setPendingSwap(null)
    }
  }

  // ---- Idle state ----
  if (panelState === 'idle') {
    return (
      <div className="mx-auto max-w-[800px]">
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <Sparkles
            className="size-10 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-[length:var(--fs-md)] text-muted-foreground">
            Analyze your mana base for colour coverage and curve support.
          </p>
          <div className="flex items-center gap-3">
            <label
              htmlFor="mana-collection-only-toggle"
              className="text-[length:var(--fs-md)] text-muted-foreground"
            >
              Collection only
            </label>
            <Switch
              id="mana-collection-only-toggle"
              role="switch"
              checked={collectionOnly}
              onCheckedChange={setCollectionOnly}
              aria-label="Restrict suggestions to cards in your collection"
            />
          </div>
          <Button onClick={handleAnalyze}>
            <Sparkles
              className="size-4"
              aria-hidden="true"
              data-icon="inline-start"
            />
            Analyze Mana Base
          </Button>
        </div>
      </div>
    )
  }

  // ---- Loading state ----
  if (panelState === 'loading') {
    return (
      <div className="mx-auto max-w-[800px]">
        <div
          className="flex flex-col items-center gap-4 py-16"
          aria-live="polite"
        >
          <Loader2
            className="size-8 animate-spin text-primary"
            aria-hidden="true"
          />
          <p className="text-[length:var(--fs-md)] text-muted-foreground">
            Analyzing mana base...
          </p>
        </div>
      </div>
    )
  }

  // ---- Error state ----
  if (panelState === 'error') {
    return (
      <div className="mx-auto max-w-[800px]">
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-[length:var(--fs-md)] text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            Mana analysis failed: {errorMessage}
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleAnalyze}
          >
            <RefreshCw
              className="size-3.5"
              aria-hidden="true"
              data-icon="inline-start"
            />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  // ---- Success state ----
  const hasSuggestions = result && result.suggestions.length > 0
  const hasGaps = result && result.coverageGaps.length > 0
  const hasDistribution =
    result && Object.keys(result.colorDistribution).length > 0

  return (
    <div className="mx-auto max-w-[800px] space-y-8 pb-12" role="region" aria-label="Mana analysis results">
      {/* Colour Distribution */}
      {hasDistribution && (
        <section>
          <h2 className="mb-4 text-[length:var(--fs-lg)] font-medium">Colour Distribution</h2>
          <div className="space-y-2">
            {Object.entries(result!.colorDistribution).map(
              ([colour, count]) => (
                <ColourBar
                  key={colour}
                  colour={colour}
                  count={count}
                  max={Math.max(
                    ...Object.values(result!.colorDistribution),
                    1
                  )}
                />
              )
            )}
          </div>
        </section>
      )}

      {/* Land Count */}
      {result && (
        <section>
          <h2 className="mb-2 text-[length:var(--fs-lg)] font-medium">Land Count</h2>
          <p className="text-[length:var(--fs-md)]">
            You have{' '}
            <span className="font-medium">{result.landCount}</span> lands.
            Recommended:{' '}
            <span className="font-medium">
              {result.recommendedLandCount}
            </span>
            .
          </p>
          <LandCountIndicator
            current={result.landCount}
            recommended={result.recommendedLandCount}
          />
        </section>
      )}

      {/* Coverage Gaps */}
      {hasGaps && (
        <section>
          <h2 className="mb-2 text-[length:var(--fs-lg)] font-medium">Coverage Gaps</h2>
          <ul className="list-inside list-disc space-y-1 text-[length:var(--fs-md)] text-muted-foreground">
            {result!.coverageGaps.map((gap, i) => (
              <li key={i}>{gap}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Suggested Changes */}
      {hasSuggestions && (
        <section>
          <h2 className="mb-4 text-[length:var(--fs-lg)] font-medium">Suggested Changes</h2>
          <div className="space-y-3">
            {result!.suggestions.map((swap, i) => (
              <SwapRow
                key={i}
                swap={swap}
                onSwap={() => setPendingSwap(swap)}
              />
            ))}
          </div>
        </section>
      )}

      {!hasSuggestions && !hasGaps && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <Sparkles
            className="size-10 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-[length:var(--fs-md)] text-muted-foreground">
            Your mana base looks solid — no changes suggested.
          </p>
          <Button variant="outline" onClick={handleAnalyze}>
            <RefreshCw
              className="size-4"
              aria-hidden="true"
              data-icon="inline-start"
            />
            Re-analyze
          </Button>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={!!pendingSwap}
        onConfirm={handleAcceptSwap}
        onCancel={() => setPendingSwap(null)}
        title={
          pendingSwap?.current
            ? `Swap ${pendingSwap.current} → ${pendingSwap.suggested}?`
            : `Add ${pendingSwap?.suggested}?`
        }
        description={
          pendingSwap?.current
            ? `This will remove ${pendingSwap.current} and add ${pendingSwap.suggested} in Archidekt.`
            : `This will add ${pendingSwap?.suggested} to your deck in Archidekt.`
        }
        confirmLabel="Apply Swap"
        isLoading={isWriting}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ColourBar
// ---------------------------------------------------------------------------

function ColourBar({
  colour,
  count,
  max,
}: {
  colour: string
  count: number
  max: number
}) {
  const label = COLOUR_LABELS[colour] || colour
  const widthPercent = max > 0 ? Math.round((count / max) * 100) : 0
  const bgClass = COLOUR_CSS[colour] || 'bg-muted-foreground'

  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-[length:var(--fs-sm)] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="flex-1">
        <div className="h-4 w-full overflow-hidden rounded bg-muted">
          <div
            className={`h-full rounded ${bgClass}`}
            style={{ width: `${widthPercent}%` }}
            role="meter"
            aria-label={`${label}: ${count} sources`}
            aria-valuenow={count}
            aria-valuemin={0}
            aria-valuemax={max}
          />
        </div>
      </div>
      <span className="w-8 text-right text-[length:var(--fs-sm)] font-mono text-muted-foreground">
        {count}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LandCountIndicator
// ---------------------------------------------------------------------------

function LandCountIndicator({
  current,
  recommended,
}: {
  current: number
  recommended: number
}) {
  const diff = current - recommended
  let statusColor = 'text-success'
  let statusText = 'On target'
  if (diff < -2) {
    statusColor = 'text-destructive'
    statusText = `${Math.abs(diff)} below recommended`
  } else if (diff > 2) {
    statusColor = 'text-warning'
    statusText = `${diff} above recommended`
  } else if (diff !== 0) {
    statusColor = 'text-warning'
    statusText = diff > 0 ? `${diff} above` : `${Math.abs(diff)} below`
  }

  return (
    <p className={`mt-1 text-[length:var(--fs-sm)] font-medium ${statusColor}`}>{statusText}</p>
  )
}

// ---------------------------------------------------------------------------
// SwapRow
// ---------------------------------------------------------------------------

function SwapRow({
  swap,
  onSwap,
}: {
  swap: LandSwap
  onSwap: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[length:var(--fs-md)]">
          {swap.current && (
            <>
              <span className="font-medium text-destructive">
                {swap.current}
              </span>
              <ArrowRight
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </>
          )}
          <span className="font-medium text-success">{swap.suggested}</span>
          {swap.owned && (
            <Badge variant="secondary" className="text-[length:var(--fs-xs)]">
              Owned
            </Badge>
          )}
        </div>
        {swap.reasoning && (
          <p className="mt-0.5 line-clamp-2 text-[length:var(--fs-sm)] text-muted-foreground">
            {swap.reasoning}
          </p>
        )}
      </div>
      <Button
        size="sm"
        onClick={onSwap}
        aria-label={
          swap.current
            ? `Swap ${swap.current} for ${swap.suggested}`
            : `Add ${swap.suggested}`
        }
      >
        Swap
      </Button>
    </div>
  )
}
