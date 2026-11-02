'use client'

/**
 * GenericArtPicker — choose the art (image only) for a generic basic.
 * Any printing of that basic is allowed; the ones you own are marked. The
 * chosen finish is shown against each printing, and finishes that printing
 * doesn't come in are struck through. Choosing "Default art" clears the choice.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export interface ArtPrinting {
  scryfallId: string
  setCode: string
  setName: string
  collectorNumber: string
  finishes: string[]
  imageUrl: string | null
  owned: boolean
}

const FINISH_LABELS: Array<[string, string]> = [
  ['nonfoil', 'Non-foil'],
  ['foil', 'Foil'],
  ['etched', 'Etched'],
]

export function GenericArtPicker(props: GenericArtPickerProps) {
  // Mounted only while open, so nothing is fetched (and no query client is needed) until then.
  return props.open ? <GenericArtPickerBody {...props} /> : null
}

interface GenericArtPickerProps {
  open: boolean
  cardName: string
  currentScryfallId?: string | null
  /** Finish the line uses (to show availability); null = non-foil */
  finish?: string | null
  /** null means "use default art" */
  onSelect: (printing: ArtPrinting | null) => void
  onClose: () => void
}

function GenericArtPickerBody({
  open,
  cardName,
  currentScryfallId,
  finish,
  onSelect,
  onClose,
}: GenericArtPickerProps) {
  const [search, setSearch] = useState('')
  const { data, isLoading, isError, refetch } = useQuery<ArtPrinting[]>({
    queryKey: ['generic-art-printings', cardName, search],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(
        `/api/printings/search?name=${encodeURIComponent(cardName)}&q=${encodeURIComponent(search)}`
      )
      if (!res.ok) throw new Error('Search failed')
      return (await res.json()).printings as ArtPrinting[]
    },
  })
  const wanted = finish || 'nonfoil'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose art for {cardName}</DialogTitle>
          <DialogDescription>Art only. Any printing works, and generics never use a collection copy.</DialogDescription>
        </DialogHeader>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by set name or code"
          aria-label="Search printings"
          className="w-full rounded border border-[var(--border-default)] bg-transparent px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="rounded border border-[var(--border-default)] px-2 py-1.5 text-left text-sm hover:bg-white/[0.05]"
        >
          Default art (a printing you own)
        </button>
        <div className="max-h-80 overflow-y-auto" role="listbox" aria-label="Printings">
          {isLoading && <p className="p-3 text-sm text-muted-foreground">Loading printings…</p>}
          {isError && (
            <p className="p-3 text-sm" style={{ color: 'rgba(226,75,74,0.9)' }}>
              Couldn&apos;t load printings.{' '}
              <button type="button" className="underline" onClick={() => refetch()}>Try again</button>
            </p>
          )}
          {!isLoading && !isError && (data?.length ?? 0) === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No printings match “{search}”.</p>
          )}
          {data?.map((p) => (
            <button
              key={p.scryfallId}
              type="button"
              role="option"
              aria-selected={p.scryfallId === currentScryfallId}
              onClick={() => onSelect(p)}
              className="flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-white/[0.05]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.imageUrl && <img src={p.imageUrl} alt="" className="h-12 w-auto rounded-sm" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {p.setName} · #{p.collectorNumber}
                  {p.owned && <span className="ml-2 text-xs" style={{ color: 'var(--signal-success)' }}>Owned</span>}
                  {p.scryfallId === currentScryfallId && <span className="ml-2 text-xs">Current</span>}
                </span>
                <span className="flex gap-2 text-xs text-muted-foreground">
                  {FINISH_LABELS.map(([key, label]) => {
                    const has = p.finishes.includes(key)
                    return (
                      <span
                        key={key}
                        className={has ? (key === wanted ? 'font-semibold text-foreground' : '') : 'line-through opacity-50'}
                        title={has ? undefined : `${label} isn't available for this printing`}
                      >
                        {label}
                      </span>
                    )
                  })}
                </span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
