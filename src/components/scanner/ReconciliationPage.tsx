'use client'

import { useState } from 'react'
import { ArrowLeft, Trash2, Check, Camera } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ScanMode, ScanTarget, ScannedCard } from '@/components/scanner/ScanSession'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReconciliationPageProps {
  mode: ScanMode
  target: ScanTarget
  scannedCards: ScannedCard[]
  onRemoveCard: (sessionId: number) => void
  onUpdateCard: (sessionId: number, updates: Partial<ScannedCard>) => void
  onBack: () => void
  onConfirm: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReconciliationPage({
  mode,
  target,
  scannedCards,
  onRemoveCard,
  onUpdateCard,
  onBack,
  onConfirm,
}: ReconciliationPageProps) {
  const queryClient = useQueryClient()
  const [submitting, setSubmitting] = useState(false)

  const confirmMutation = useMutation({
    mutationFn: async () => {
      // Build the payload
      const cards = scannedCards.map(card => ({
        cardName: card.cardName,
        oracleId: card.oracleId,
        scryfallId: card.scryfallId,
        setCode: card.setCode,
        collectorNumber: card.collectorNumber,
        isProxy: card.isProxy,
        isFoil: card.isFoil,
        condition: card.condition,
        confidence: card.confidence,
      }))

      const res = await fetch('/api/scan/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          target,
          cards,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save scanned cards')
      }

      return res.json()
    },
    onSuccess: (data) => {
      toast.success(`Added ${scannedCards.length} card${scannedCards.length !== 1 ? 's' : ''} to your collection`)
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['collection-rollup'] })
      queryClient.invalidateQueries({ queryKey: ['shared-cards'] })
      if (target.type === 'deck' && target.deckId) {
        queryClient.invalidateQueries({ queryKey: ['decks', String(target.deckId)] })
        queryClient.invalidateQueries({ queryKey: ['decks', target.deckId] })
        queryClient.invalidateQueries({ queryKey: ['picklist', target.deckId] })
      }
      onConfirm()
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const handleConfirm = () => {
    if (scannedCards.length === 0) return
    confirmMutation.mutate()
  }

  const totalValue = scannedCards.reduce((sum, card) => {
    // We don't have price on ScannedCard yet — this will be enhanced later
    return sum
  }, 0)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: 'var(--border-default)' }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to scanning">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1">
            <h2 className="text-[length:var(--fs-lg)] font-semibold text-foreground">
              Review Scanned Cards
            </h2>
            <p className="text-[length:var(--fs-xs)] text-muted-foreground">
              {scannedCards.length} card{scannedCards.length !== 1 ? 's' : ''} ·
              {target.type === 'deck' && ` → ${target.deckName}`}
              {target.type === 'storage' && ` → ${target.storageLocationName}`}
              {target.type === 'collection' && ' → Collection (unsorted)'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <Camera className="size-4" />
            Scan more
          </Button>
        </div>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-2">
          {scannedCards.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center">
              <p className="text-[length:var(--fs-md)] text-muted-foreground">No cards scanned yet</p>
              <Button variant="outline" onClick={onBack}>
                <Camera className="size-4" /> Start scanning
              </Button>
            </div>
          ) : (
            scannedCards.map((card) => (
              <ScannedCardRow
                key={card.sessionId}
                card={card}
                onRemove={() => onRemoveCard(card.sessionId)}
                onToggleProxy={() => onUpdateCard(card.sessionId, { isProxy: !card.isProxy })}
                onToggleFoil={() => onUpdateCard(card.sessionId, { isFoil: !card.isFoil })}
                onConditionChange={(condition) => onUpdateCard(card.sessionId, { condition })}
              />
            ))
          )}
        </div>
      </div>

      {/* Footer — confirm button */}
      {scannedCards.length > 0 && (
        <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-surface)' }}>
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <span className="text-[length:var(--fs-sm)] text-muted-foreground">
              {scannedCards.filter(c => c.isProxy).length} proxies · {scannedCards.filter(c => c.isFoil).length} foils
            </span>
            <Button
              onClick={handleConfirm}
              disabled={confirmMutation.isPending}
              size="lg"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <Check className="size-4" />
              {confirmMutation.isPending ? 'Saving...' : `Confirm ${scannedCards.length} Cards`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ScannedCardRow — individual card in the reconciliation list
// ---------------------------------------------------------------------------

function ScannedCardRow({
  card,
  onRemove,
  onToggleProxy,
  onToggleFoil,
  onConditionChange,
}: {
  card: ScannedCard
  onRemove: () => void
  onToggleProxy: () => void
  onToggleFoil: () => void
  onConditionChange: (condition: ScannedCard['condition']) => void
}) {
  const thumbUrl = card.scryfallId
    ? `https://cards.scryfall.io/small/front/${card.scryfallId.charAt(0)}/${card.scryfallId.charAt(1)}/${card.scryfallId}.jpg`
    : null

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border-default)' }}>
      {/* Thumbnail */}
      <div className="shrink-0">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" loading="lazy" className="h-[48px] w-[35px] rounded object-cover" />
        ) : (
          <div className="h-[48px] w-[35px] rounded bg-[rgba(255,255,255,0.05)]" />
        )}
      </div>

      {/* Card info */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--fs-sm)] font-medium text-foreground">
          {card.cardName}
        </span>
        <span className="text-[length:var(--fs-xs)] text-muted-foreground">
          {card.setCode?.toUpperCase()} {card.collectorNumber && `#${card.collectorNumber}`}
        </span>
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-1.5">
        {/* Proxy toggle */}
        <button
          type="button"
          onClick={onToggleProxy}
          className={`rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium transition-colors ${
            card.isProxy
              ? 'bg-[rgba(72,154,222,0.15)] text-[#489ADE]'
              : 'text-muted-foreground hover:bg-white/[0.05]'
          }`}
          aria-pressed={card.isProxy}
        >
          Proxy
        </button>

        {/* Foil toggle */}
        <button
          type="button"
          onClick={onToggleFoil}
          className={`rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium transition-colors ${
            card.isFoil
              ? 'bg-[rgba(245,136,11,0.15)] text-[#F5880B]'
              : 'text-muted-foreground hover:bg-white/[0.05]'
          }`}
          aria-pressed={card.isFoil}
        >
          Foil
        </button>

        {/* Condition selector */}
        <select
          value={card.condition}
          onChange={e => onConditionChange(e.target.value as ScannedCard['condition'])}
          className="h-6 rounded border bg-transparent px-1 text-[length:var(--fs-xs)] text-muted-foreground"
          style={{ borderColor: 'var(--border-emphasis)' }}
          aria-label="Condition"
        >
          <option value="near_mint">NM</option>
          <option value="lightly_played">LP</option>
          <option value="moderately_played">MP</option>
          <option value="heavily_played">HP</option>
          <option value="damaged">DMG</option>
        </select>

        {/* Remove */}
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-[rgba(226,75,74,0.1)] hover:text-[rgba(226,75,74,0.8)]"
          aria-label={`Remove ${card.cardName}`}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
