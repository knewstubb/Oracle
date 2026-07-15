'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { StorageLocationSelect } from '@/components/collection/StorageLocationSelect'
import { DeckPickerPopover, type ValidDeck } from '@/components/DeckPickerPopover'

interface StorageCopy {
  physicalCopyId: number
  cardName: string
  setName: string
  condition: string | null
  isFoil: boolean
  isProxy: boolean
  scryfallPrintingId: string | null
}

interface LocationDetail {
  locationName: string
  locationColor: string | null
  copies: StorageCopy[]
}

export default function StorageDetailPage() {
  const params = useParams()
  const locationId = params.locationId as string
  const isUnsorted = locationId === 'unsorted'

  const { data, isLoading } = useQuery<LocationDetail>({
    queryKey: ['storage', 'location', locationId],
    queryFn: async () => {
      const url = isUnsorted
        ? '/api/storage/unsorted'
        : `/api/storage/locations/${locationId}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load')
      return res.json()
    },
    staleTime: 60 * 1000,
  })

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
      <div className="mx-auto flex h-full w-full max-w-[1520px] flex-col">
        <PageHeader
          title={data?.locationName ?? (isUnsorted ? 'Unsorted' : 'Loading...')}
          subtitle={data ? `${data.copies.length} cards` : undefined}
          actions={
            <Link
              href="/storage"
              className="flex items-center gap-1 text-[length:var(--fs-sm)] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              All locations
            </Link>
          }
        />

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-[rgba(255,255,255,0.04)]">
              {(data?.copies ?? []).map((copy) => (
                <div
                  key={copy.physicalCopyId}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  {/* Card thumbnail placeholder */}
                  {copy.scryfallPrintingId && (
                    <img
                      src={`https://cards.scryfall.io/small/front/${copy.scryfallPrintingId.charAt(0)}/${copy.scryfallPrintingId.charAt(1)}/${copy.scryfallPrintingId}.jpg`}
                      alt=""
                      loading="lazy"
                      className="h-[48px] w-[34px] shrink-0 rounded object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  )}

                  {/* Card info */}
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[length:var(--fs-md)] font-medium text-foreground">
                      {copy.cardName}
                    </span>
                    <span className="text-[length:var(--fs-sm)] text-muted-foreground">
                      {copy.setName}
                      {copy.condition ? ` · ${copy.condition.replace('_', ' ')}` : ''}
                      {copy.isFoil ? ' · Foil' : ''}
                    </span>
                    {copy.isProxy && (
                      <span
                        className="ml-2 inline-block rounded-full px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium"
                        style={{ background: 'rgba(29,158,117,0.15)', color: 'var(--accent-primary)' }}
                      >
                        Proxy
                      </span>
                    )}
                  </div>

                  {/* Action: Assign to deck (filtered by color identity) */}
                  <StorageCopyAssignButton
                    cardName={copy.cardName}
                    physicalCopyId={copy.physicalCopyId}
                  />
                </div>
              ))}

              {data?.copies.length === 0 && (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  No cards in this location.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StorageCopyAssignButton — fetches valid decks on-demand and shows picker
// ---------------------------------------------------------------------------

function StorageCopyAssignButton({ cardName, physicalCopyId }: { cardName: string; physicalCopyId: number }) {
  const queryClient = useQueryClient()

  // Fetch valid decks for this card
  const { data: validDecks, isLoading } = useQuery<ValidDeck[]>({
    queryKey: ['valid-decks', cardName],
    queryFn: async () => {
      const res = await fetch(`/api/allocation/valid-decks?cardName=${encodeURIComponent(cardName)}`)
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 60 * 1000,
  })

  // Atomic assign: find open slot in target deck + fill it
  const assignMutation = useMutation({
    mutationFn: async (targetDeckId: number) => {
      // Find an open slot in the target deck for this card
      const actionsRes = await fetch(`/api/decks/${targetDeckId}/card-actions/${encodeURIComponent(cardName)}`)
      if (!actionsRes.ok) throw new Error('Could not check target deck')
      const context = await actionsRes.json()

      // card-actions returns from the perspective of the target deck
      // If the target deck has this card with status 'open'/'claimed'/'unowned',
      // we need the deckCardsId. But card-actions doesn't return deckCardsId directly.
      // Use the reassign-to-deck endpoint which handles the slot lookup server-side.
      // For unassigned copies, we do a direct assign via the slot lookup.
      const res = await fetch('/api/allocation/reassign-to-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ physicalCopyId, targetDeckId, cardName }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        // If "not currently assigned" error, the copy is free — try direct approach
        if (err.error?.includes('not currently assigned')) {
          // The copy is in storage (not assigned to any deck) — need a different path
          // Call the assign endpoint with a slot lookup
          const slotRes = await fetch('/api/allocation/assign-free-copy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ physicalCopyId, targetDeckId, cardName }),
          })
          if (!slotRes.ok) {
            const slotErr = await slotRes.json().catch(() => ({}))
            throw new Error(slotErr.error || 'Assign failed')
          }
          return slotRes.json()
        }
        throw new Error(err.error || 'Assign failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage'] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      toast.success(`Assigned ${cardName} to deck`)
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <DeckPickerPopover
      validDecks={validDecks ?? []}
      isLoading={isLoading}
      onSelect={(deck) => assignMutation.mutate(deck.deckId)}
      disabled={assignMutation.isPending}
      label="Assign"
    />
  )
}
