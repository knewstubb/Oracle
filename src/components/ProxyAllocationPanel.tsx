'use client'

import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { CardImage } from '@/components/CardImage'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import type { SharedCardData } from '@/components/SharedCardRow'

interface Allocation {
  deckId: number
  role: 'original' | 'proxy'
}

interface ProxyAllocationPanelProps {
  card: SharedCardData
  onSuccess?: () => void
  onCancel?: () => void
}

export function ProxyAllocationPanel({ card, onSuccess, onCancel }: ProxyAllocationPanelProps) {
  const queryClient = useQueryClient()

  // Track allocation per deck: deckId -> 'original' | 'proxy'
  const initialAllocations = useMemo(() => {
    const map: Record<number, 'original' | 'proxy'> = {}
    for (const deck of card.decks) {
      map[deck.id] = deck.is_proxy ? 'proxy' : 'original'
    }
    return map
  }, [card.decks])

  const [allocations, setAllocations] = useState<Record<number, 'original' | 'proxy'>>(initialAllocations)
  const [showConfirm, setShowConfirm] = useState(false)

  // Compute pending changes
  const pendingChanges = useMemo(() => {
    const changes: { deckId: number; deckName: string; from: string; to: string }[] = []
    for (const deck of card.decks) {
      const initial = initialAllocations[deck.id]
      const current = allocations[deck.id]
      if (initial !== current) {
        changes.push({
          deckId: deck.id,
          deckName: deck.name,
          from: initial === 'proxy' ? 'Proxy' : 'Original',
          to: current === 'proxy' ? 'Proxy' : 'Original',
        })
      }
    }
    return changes
  }, [allocations, initialAllocations, card.decks])

  const hasChanges = pendingChanges.length > 0

  const mutation = useMutation({
    mutationFn: async (allocs: Allocation[]) => {
      const res = await fetch('/api/proxy-allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardName: card.card_name, allocations: allocs }),
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to update proxy tags')
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-cards'] })
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      toast.success(`Proxy tags updated for ${card.card_name}.`)
      onSuccess?.()
    },
  })

  function handleApply() {
    setShowConfirm(true)
  }

  function handleConfirm() {
    const allocs: Allocation[] = card.decks.map((deck) => ({
      deckId: deck.id,
      role: allocations[deck.id],
    }))
    mutation.mutate(allocs)
    setShowConfirm(false)
  }

  function handleRadioChange(deckId: number, value: string) {
    setAllocations((prev) => ({ ...prev, [deckId]: value as 'original' | 'proxy' }))
  }

  const isSubmitting = mutation.isPending

  return (
    <div className="mt-1 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <div className="flex gap-4">
        {/* Card image */}
        <div className="shrink-0">
          <CardImage
            scryfallId={card.scryfall_id}
            alt={`${card.card_name} card art`}
            width={120}
            height={120}
            className="rounded"
          />
        </div>

        {/* Right side */}
        <div className="flex-1 space-y-3">
          <h3 className="text-[length:var(--fs-md)] font-medium text-foreground">
            You own {card.owned_copies} {card.owned_copies === 1 ? 'copy' : 'copies'}
          </h3>

          {/* Deck radio groups */}
          <div className="space-y-2">
            {card.decks.map((deck) => (
              <div key={deck.id} className="flex items-center gap-3">
                <span className="min-w-[120px] text-[length:var(--fs-md)] text-foreground">{deck.name}</span>
                <RadioGroup
                  aria-label={`Allocation for ${deck.name}`}
                  value={allocations[deck.id]}
                  onValueChange={(val) => handleRadioChange(deck.id, val as string)}
                  disabled={isSubmitting}
                  className="flex w-auto flex-row gap-3"
                >
                  <label className="flex items-center gap-1.5 text-[length:var(--fs-sm)] text-muted-foreground">
                    <RadioGroupItem value="original" />
                    Original
                  </label>
                  <label className="flex items-center gap-1.5 text-[length:var(--fs-sm)] text-muted-foreground">
                    <RadioGroupItem value="proxy" />
                    Proxy
                  </label>
                </RadioGroup>
              </div>
            ))}
          </div>

          {/* Preview of pending changes */}
          {hasChanges && (
            <div className="rounded border border-border bg-card px-3 py-2 text-[length:var(--fs-sm)] text-muted-foreground">
              <span className="font-medium text-foreground">Pending changes:</span>
              <ul className="mt-1 space-y-0.5">
                {pendingChanges.map((change) => (
                  <li key={change.deckId}>
                    {change.deckName}: {change.from} → {change.to}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Error display */}
          {mutation.isError && (
            <div role="alert" className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-[length:var(--fs-sm)] text-destructive">
              Failed to update Archidekt: {mutation.error?.message}. Your data hasn&apos;t been changed.
              <Button
                variant="outline"
                size="xs"
                className="ml-2"
                onClick={() => handleApply()}
              >
                Retry
              </Button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2" role="status" aria-live="polite">
            <Button
              onClick={handleApply}
              disabled={!hasChanges || isSubmitting}
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {isSubmitting ? 'Applying...' : 'Apply to Archidekt'}
            </Button>
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      <ConfirmationModal
        open={showConfirm}
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirm(false)}
        title={`Update proxy tags for ${card.card_name}?`}
        confirmLabel="Apply to Archidekt"
        isLoading={false}
      >
        <ul className="space-y-1 text-[length:var(--fs-md)] text-muted-foreground">
          {pendingChanges.map((change) => (
            <li key={change.deckId}>
              {change.deckName}: {change.from} → {change.to}
            </li>
          ))}
        </ul>
      </ConfirmationModal>
    </div>
  )
}
