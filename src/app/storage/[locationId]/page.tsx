'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { ArrowLeft, Search, List, LayoutGrid } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { StorageLocationSelect } from '@/components/collection/StorageLocationSelect'
import { DeckPickerPopover, type ValidDeck } from '@/components/DeckPickerPopover'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type ViewMode = 'list' | 'grid'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StorageDetailPage() {
  const params = useParams()
  const locationId = params.locationId as string
  const isUnsorted = locationId === 'unsorted'

  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')

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

  // Filter copies by search query
  const filteredCopies = useMemo(() => {
    const copies = data?.copies ?? []
    if (!searchQuery.trim()) return copies
    const query = searchQuery.toLowerCase()
    return copies.filter(
      (c) =>
        c.cardName.toLowerCase().includes(query) ||
        c.setName.toLowerCase().includes(query)
    )
  }, [data?.copies, searchQuery])

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
      <div className="mx-auto flex h-full w-full max-w-[var(--content-max-width)] flex-col">
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

        {/* Toolbar: Search + View Toggle */}
        {!isLoading && data && data.copies.length > 0 && (
          <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: 'var(--border-default)' }}>
            <div className="flex items-center gap-3">
              {/* Search input */}
              <div className="relative max-w-[260px] flex-1">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  placeholder="Search cards…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                  aria-label="Search cards in this location"
                />
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Filtered count */}
              {searchQuery && (
                <span className="text-[length:var(--fs-sm)] text-muted-foreground">
                  {filteredCopies.length} of {data.copies.length}
                </span>
              )}

              {/* View toggle */}
              <div
                className="inline-flex overflow-hidden rounded-lg"
                style={{ border: '1px solid var(--border-emphasis)' }}
                role="radiogroup"
                aria-label="View mode"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={viewMode === 'list'}
                  aria-label="List view"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'flex items-center justify-center p-1.5 transition-colors',
                    viewMode === 'list' ? 'text-white' : 'text-muted-foreground hover:text-foreground'
                  )}
                  style={{
                    backgroundColor: viewMode === 'list' ? 'var(--accent-primary)' : 'transparent',
                  }}
                >
                  <List className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={viewMode === 'grid'}
                  aria-label="Grid view"
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'flex items-center justify-center p-1.5 transition-colors',
                    viewMode === 'grid' ? 'text-white' : 'text-muted-foreground hover:text-foreground'
                  )}
                  style={{
                    backgroundColor: viewMode === 'grid' ? 'var(--accent-primary)' : 'transparent',
                  }}
                >
                  <LayoutGrid className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredCopies.length === 0 && data && data.copies.length > 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              No cards match &ldquo;{searchQuery}&rdquo;
            </div>
          ) : filteredCopies.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              No cards in this location.
            </div>
          ) : viewMode === 'grid' ? (
            /* ─── Grid View ─────────────────────────────────────── */
            <div className="grid grid-cols-6 gap-3 p-4">
              {filteredCopies.map((copy) => (
                <div
                  key={copy.physicalCopyId}
                  className="group/tile relative aspect-[5/7] overflow-hidden rounded-lg"
                  style={{
                    border: copy.isProxy
                      ? '2px dashed var(--accent-primary)'
                      : '1px solid var(--border-default)',
                    boxShadow: copy.isProxy
                      ? '0 0 12px rgba(29, 158, 117, 0.6), 0 0 4px rgba(29, 158, 117, 0.3)'
                      : undefined,
                  }}
                >
                  {copy.scryfallPrintingId ? (
                    <img
                      src={`https://cards.scryfall.io/large/front/${copy.scryfallPrintingId.charAt(0)}/${copy.scryfallPrintingId.charAt(1)}/${copy.scryfallPrintingId}.jpg`}
                      alt={copy.cardName}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center bg-muted text-[length:var(--fs-sm)] text-muted-foreground p-2 text-center"
                      role="img"
                      aria-label={copy.cardName}
                    >
                      {copy.cardName}
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center opacity-0 transition-opacity group-hover/tile:opacity-100"
                    style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                  >
                    <span className="px-2 text-center text-[length:var(--fs-sm)] font-medium text-white">
                      {copy.cardName}
                    </span>
                    <span className="mt-1 text-[length:var(--fs-xs)] text-white/70">
                      {copy.setName}
                      {copy.isFoil ? ' · Foil' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ─── List View ─────────────────────────────────────── */
            <div className="flex flex-col divide-y divide-[rgba(255,255,255,0.04)]">
              {filteredCopies.map((copy) => (
                <div
                  key={copy.physicalCopyId}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  {/* Card thumbnail */}
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

                  {/* Action: Assign to deck */}
                  <StorageCopyAssignButton
                    cardName={copy.cardName}
                    physicalCopyId={copy.physicalCopyId}
                  />
                </div>
              ))}
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

  const { data: validDecks, isLoading } = useQuery<ValidDeck[]>({
    queryKey: ['valid-decks', cardName],
    queryFn: async () => {
      const res = await fetch(`/api/allocation/valid-decks?cardName=${encodeURIComponent(cardName)}`)
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 60 * 1000,
  })

  const assignMutation = useMutation({
    mutationFn: async (targetDeckId: number) => {
      const actionsRes = await fetch(`/api/decks/${targetDeckId}/card-actions/${encodeURIComponent(cardName)}`)
      if (!actionsRes.ok) throw new Error('Could not check target deck')

      const res = await fetch('/api/allocation/reassign-to-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ physicalCopyId, targetDeckId, cardName }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (err.error?.includes('not currently assigned')) {
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
