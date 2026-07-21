'use client'

/**
 * PrintingPicker — Modal showing all printings of a card as a visual grid.
 *
 * Features:
 * - Fetches all printings from Scryfall for a given card name
 * - Displays as image grid (card art thumbnails)
 * - Search/filter by set name or set code
 * - Highlights printings the user owns (for deck slot context)
 * - On select: calls onSelect with the chosen printing's scryfall_id + set info
 */

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Search, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScryfallPrinting {
  id: string
  set: string
  set_name: string
  collector_number: string
  image_uris?: { small?: string; normal?: string }
  card_faces?: Array<{ image_uris?: { small?: string; normal?: string } }>
  prices?: { usd?: string | null }
  released_at?: string
  rarity?: string
}

export interface PrintingSelection {
  scryfallId: string
  setCode: string
  collectorNumber: string
  setName: string
}

interface PrintingPickerProps {
  open: boolean
  cardName: string
  /** Current printing scryfall_id (shown as selected) */
  currentScryfallId?: string | null
  /** Set of scryfall_printing_ids the user owns (highlighted with badge) */
  ownedPrintingIds?: Set<string>
  onSelect: (printing: PrintingSelection) => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PrintingPicker({
  open,
  cardName,
  currentScryfallId,
  ownedPrintingIds,
  onSelect,
  onClose,
}: PrintingPickerProps) {
  const [search, setSearch] = useState('')

  // Reset search when opening
  useEffect(() => {
    if (open) setSearch('')
  }, [open])

  // Fetch all printings from Scryfall
  const { data: printings, isLoading } = useQuery<ScryfallPrinting[]>({
    queryKey: ['scryfall-printings', cardName],
    queryFn: async () => {
      // Use Scryfall search to find all printings
      const res = await fetch(
        `https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(cardName)}"&unique=prints&order=released`,
        { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
      )
      if (!res.ok) return []
      const data = await res.json()
      return data.data ?? []
    },
    enabled: open && !!cardName,
    staleTime: 10 * 60 * 1000, // Cache for 10 min
  })

  // Filter by search
  const filtered = useMemo(() => {
    if (!printings) return []
    if (!search.trim()) return printings
    const q = search.toLowerCase()
    return printings.filter(p =>
      p.set.toLowerCase().includes(q) ||
      p.set_name.toLowerCase().includes(q) ||
      p.collector_number.toLowerCase().includes(q)
    )
  }, [printings, search])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl mx-4"
        style={{ maxWidth: 'var(--content-max-width)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border-default)' }}>
          <div>
            <h2 className="text-[length:var(--fs-lg)] font-semibold text-foreground">Choose Printing</h2>
            <p className="text-[length:var(--fs-xs)] text-muted-foreground">{cardName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b px-4 py-2" style={{ borderColor: 'var(--border-default)' }}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search by set name or code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 w-full rounded-lg border bg-transparent pl-8 pr-3 text-[length:var(--fs-sm)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
              style={{ borderColor: 'var(--border-emphasis)' }}
              aria-label="Search printings"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: '400px' }}>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="aspect-[5/7] animate-pulse rounded-lg bg-white/[0.06]" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.06]" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center text-[length:var(--fs-sm)] text-muted-foreground">
              {search ? 'No printings match your search.' : 'No printings found.'}
            </div>
          ) : (
            <>
              {/* Owned printings first */}
              {(() => {
                const owned = filtered.filter(p => ownedPrintingIds?.has(p.id))
                const others = filtered.filter(p => !ownedPrintingIds?.has(p.id))

                return (
                  <>
                    {owned.length > 0 && (
                      <div className="mb-6">
                        <h3 className="mb-3 text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-muted-foreground">
                          In your collection ({owned.length})
                        </h3>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                          {owned.map(printing => (
                            <PrintingCard
                              key={printing.id}
                              printing={printing}
                              cardName={cardName}
                              isCurrent={printing.id === currentScryfallId}
                              isOwned={true}
                              onSelect={onSelect}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {others.length > 0 && (
                      <div>
                        {owned.length > 0 && (
                          <h3 className="mb-3 text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-muted-foreground">
                            All printings ({others.length})
                          </h3>
                        )}
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                          {others.map(printing => (
                            <PrintingCard
                              key={printing.id}
                              printing={printing}
                              cardName={cardName}
                              isCurrent={printing.id === currentScryfallId}
                              isOwned={false}
                              onSelect={onSelect}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="border-t px-4 py-2 text-[length:var(--fs-xs)] text-muted-foreground" style={{ borderColor: 'var(--border-default)' }}>
          {printings && `${filtered.length} of ${printings.length} printings`}
          {ownedPrintingIds && ownedPrintingIds.size > 0 && ` · ${ownedPrintingIds.size} owned`}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PrintingCard — individual card in the grid
// ---------------------------------------------------------------------------

function PrintingCard({
  printing,
  cardName,
  isCurrent,
  isOwned,
  onSelect,
}: {
  printing: ScryfallPrinting
  cardName: string
  isCurrent: boolean
  isOwned: boolean
  onSelect: (printing: PrintingSelection) => void
}) {
  const imageUrl = printing.image_uris?.normal ?? printing.card_faces?.[0]?.image_uris?.normal ?? printing.image_uris?.small ?? printing.card_faces?.[0]?.image_uris?.small

  return (
    <button
      type="button"
      onClick={() => onSelect({
        scryfallId: printing.id,
        setCode: printing.set,
        collectorNumber: printing.collector_number,
        setName: printing.set_name,
      })}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border-2 text-left transition-all hover:scale-[1.02] hover:shadow-lg',
        isCurrent ? 'border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/30' :
        isOwned ? 'border-[var(--signal-success)]/50' :
        'border-transparent hover:border-white/20'
      )}
    >
      {/* Card image */}
      <div className="relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${cardName} (${printing.set_name})`}
            loading="lazy"
            className="aspect-[5/7] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[5/7] w-full items-center justify-center bg-white/[0.05] text-[length:var(--fs-sm)] text-muted-foreground">
            {printing.set.toUpperCase()}
          </div>
        )}

        {/* Current indicator */}
        {isCurrent && (
          <div className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-[var(--accent-primary)] shadow">
            <Check className="size-3.5 text-white" />
          </div>
        )}

        {/* Owned badge */}
        {isOwned && !isCurrent && (
          <div className="absolute left-1.5 top-1.5 rounded-full bg-[var(--signal-success)] px-2 py-0.5 text-[10px] font-bold text-white shadow">
            OWNED
          </div>
        )}
      </div>

      {/* Set info below image */}
      <div className="px-2 py-1.5" style={{ backgroundColor: 'var(--bg-card)' }}>
        <span className="block truncate text-[length:var(--fs-xs)] font-medium text-foreground">
          {printing.set_name}
        </span>
        <span className="text-[length:var(--fs-xs)] text-muted-foreground">
          #{printing.collector_number} · {printing.set.toUpperCase()}
          {printing.prices?.usd && ` · $${printing.prices.usd}`}
        </span>
      </div>
    </button>
  )
}
