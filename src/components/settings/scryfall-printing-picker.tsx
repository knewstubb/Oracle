'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { Search, X, Loader2, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScryfallCard {
  id: string
  name: string
  set_name: string
  set: string
  collector_number: string
  image_uris?: {
    art_crop?: string
    small?: string
    normal?: string
  }
  card_faces?: Array<{
    image_uris?: {
      art_crop?: string
      small?: string
      normal?: string
    }
  }>
}

interface ScryfallSearchResponse {
  data: ScryfallCard[]
  has_more: boolean
  total_cards: number
}

interface ScryfallPrintingPickerProps {
  landType: string
  cardDefinitionId: number
  onSelect: (scryfallPrintingId: string) => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getArtCropUrl(card: ScryfallCard): string | null {
  if (card.image_uris?.art_crop) return card.image_uris.art_crop
  if (card.image_uris?.small) return card.image_uris.small
  if (card.card_faces?.[0]?.image_uris?.art_crop) return card.card_faces[0].image_uris.art_crop
  if (card.card_faces?.[0]?.image_uris?.small) return card.card_faces[0].image_uris.small
  return null
}

function buildScryfallQuery(landType: string, setFilter: string): string {
  const base = `!"${landType}"+unique:prints`
  if (setFilter.trim()) {
    return `${base}+s:${encodeURIComponent(setFilter.trim())}`
  }
  return base
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScryfallPrintingPicker({
  landType,
  cardDefinitionId,
  onSelect,
  onClose,
}: ScryfallPrintingPickerProps) {
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchText])

  // Focus the search input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Fetch Scryfall printings
  const {
    data: cards,
    isLoading,
    error,
  } = useQuery<ScryfallCard[]>({
    queryKey: ['scryfall-printings', landType, debouncedSearch],
    queryFn: async () => {
      const query = buildScryfallQuery(landType, debouncedSearch)
      const url = `https://api.scryfall.com/cards/search?q=${query}&order=released&dir=desc`
      const res = await fetch(url)
      if (!res.ok) {
        if (res.status === 404) return []
        throw new Error(`Scryfall API error: ${res.status}`)
      }
      const json: ScryfallSearchResponse = await res.json()
      return json.data
    },
    staleTime: Infinity,
    retry: 1,
  })

  // Save preference mutation
  const saveMutation = useMutation({
    mutationFn: async (scryfallPrintingId: string) => {
      const res = await fetch(
        `/api/settings/generic-land-preferences/${cardDefinitionId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scryfallPrintingId }),
        }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || `Failed to save preference: ${res.status}`)
      }
      return scryfallPrintingId
    },
    onSuccess: (scryfallPrintingId) => {
      setSavedId(scryfallPrintingId)
      queryClient.invalidateQueries({ queryKey: ['generic-land-preferences'] })
      onSelect(scryfallPrintingId)
    },
  })

  const handleSelect = useCallback(
    (card: ScryfallCard) => {
      saveMutation.mutate(card.id)
    },
    [saveMutation]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [onClose]
  )

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-label={`Select printing for ${landType}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Choose art for {landType}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close picker"
          className="h-6 w-6"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Filter by set code (e.g. m21, lea, znr)"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="pl-8"
          aria-label={`Search ${landType} printings by set`}
        />
      </div>

      {/* Results */}
      <div
        className="max-h-64 min-h-[8rem] overflow-y-auto rounded-md border border-border bg-background"
        role="listbox"
        aria-label={`${landType} printings`}
      >
        {isLoading && (
          <div className="flex items-center justify-center gap-2 p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Searching Scryfall…</span>
          </div>
        )}

        {error && (
          <div className="p-4 text-center text-sm text-destructive">
            Failed to load printings. Please try again.
          </div>
        )}

        {!isLoading && !error && cards?.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No printings found{debouncedSearch ? ` for set "${debouncedSearch}"` : ''}.
          </div>
        )}

        {!isLoading && !error && cards && cards.length > 0 && (
          <div className="grid grid-cols-3 gap-2 p-2 sm:grid-cols-4 md:grid-cols-5">
            {cards.map((card) => {
              const artUrl = getArtCropUrl(card)
              const isSaved = savedId === card.id
              const isSaving = saveMutation.isPending && saveMutation.variables === card.id

              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleSelect(card)}
                  disabled={saveMutation.isPending}
                  className={cn(
                    'group relative flex flex-col items-center gap-1 rounded-md p-1 text-left transition-colors',
                    'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSaved && 'ring-2 ring-green-500'
                  )}
                  role="option"
                  aria-selected={isSaved}
                  aria-label={`${card.name} — ${card.set_name} (#${card.collector_number})`}
                >
                  {artUrl ? (
                    <Image
                      src={artUrl}
                      alt={`${card.name} art from ${card.set_name}`}
                      width={146}
                      height={108}
                      className="h-auto w-full rounded object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-[72px] w-full items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                      No art
                    </div>
                  )}
                  <span className="w-full truncate text-center text-[10px] leading-tight text-muted-foreground">
                    {card.set.toUpperCase()} #{card.collector_number}
                  </span>

                  {/* Saving/Saved overlay */}
                  {isSaving && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/70">
                      <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                    </div>
                  )}
                  {isSaved && (
                    <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Error from mutation */}
      {saveMutation.isError && (
        <p className="text-xs text-destructive">
          {saveMutation.error instanceof Error
            ? saveMutation.error.message
            : 'Failed to save preference.'}
        </p>
      )}

      {/* Saved confirmation */}
      {savedId && !saveMutation.isPending && (
        <p className="text-xs text-green-600 dark:text-green-400">
          Preference saved.
        </p>
      )}
    </div>
  )
}
