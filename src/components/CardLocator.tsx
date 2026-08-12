'use client'

/**
 * CardLocator — "Where is my card?" search overlay
 * 
 * Searches for a card by name and shows all decks where it appears,
 * along with ownership status (original, proxy, claimed, open).
 * 
 * Triggered by Cmd+Shift+K or via navigation.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, X, Loader2, MapPin, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CardSlotBadge } from '@/components/CardSlotBadge'
import { cn } from '@/lib/utils'
import type { CardSlotStatus } from '@/lib/card-status'

interface CardLocation {
  deckId: number
  deckName: string
  commanderName: string
  isActive: boolean
  quantity: number
  status: string
  hasPhysicalCopy: boolean
}

interface LocateResponse {
  query: string
  cardName: string | null
  locations: CardLocation[]
  message?: string
}

function getScryfallNormalUrl(name: string): string {
  const cardName = name.includes(' // ') ? name.substring(0, name.indexOf(' // ')) : name
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}&format=image&version=normal`
}

export function CardLocator() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [result, setResult] = useState<LocateResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const overlayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Listen for open-card-locator custom event (Cmd+Shift+K)
  useEffect(() => {
    function handleOpenLocator() {
      setOpen(true)
    }
    window.addEventListener('open-card-locator', handleOpenLocator)
    return () => window.removeEventListener('open-card-locator', handleOpenLocator)
  }, [])

  // Keyboard shortcut: Cmd+Shift+K / Ctrl+Shift+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Auto-focus input when overlay opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [open])

  // Escape key closes overlay
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Debounce query by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  // Fetch locations when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim() || debouncedQuery.length < 2) {
      setResult(null)
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetch(`/api/cards/locate?q=${encodeURIComponent(debouncedQuery)}`)
      .then((res) => {
        if (!res.ok) return res.json().then((d) => Promise.reject(new Error(d.error || 'Search failed')))
        return res.json()
      })
      .then((data: LocateResponse) => {
        if (!cancelled) {
          setResult(data)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Search failed')
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  const handleClose = useCallback(() => {
    setOpen(false)
    setQuery('')
    setDebouncedQuery('')
    setResult(null)
    setError(null)
  }, [])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleClose()
      }
    },
    [handleClose]
  )

  if (!open) return null

  const hasQuery = debouncedQuery.trim().length >= 2
  const showNoResults = hasQuery && !isLoading && !error && result?.cardName === null
  const showLocations = hasQuery && !isLoading && !error && result?.cardName && result.locations.length > 0
  const showNotInDecks = hasQuery && !isLoading && !error && result?.cardName && result.locations.length === 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[10vh] backdrop-blur-sm"
      onClick={handleBackdropClick}
      data-testid="card-locator-overlay"
    >
      <div
        ref={overlayRef}
        role="dialog"
        aria-label="Card locator"
        className="mx-4 flex w-full max-w-xl flex-col rounded-2xl bg-popover shadow-2xl shadow-black/8 ring-1 ring-border"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <MapPin className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Where is my card? (e.g., Sol Ring)"
            className="flex-1 bg-transparent text-[length:var(--fs-lg)] outline-none placeholder:text-muted-foreground"
            aria-label="Search for card location"
          />
          {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <Button variant="ghost" size="icon-sm" onClick={handleClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        {/* Results area */}
        <div className="max-h-[60vh] overflow-y-auto">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-8" role="status" aria-label="Loading">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex flex-col items-center gap-3 py-8" role="alert">
              <p className="text-[length:var(--fs-md)] text-destructive">{error}</p>
            </div>
          )}

          {/* Card not found */}
          {showNoResults && (
            <div className="py-8 text-center">
              <p className="text-[length:var(--fs-md)] text-muted-foreground">
                No card found matching &quot;{debouncedQuery}&quot;
              </p>
            </div>
          )}

          {/* Card found but not in any decks */}
          {showNotInDecks && (
            <div className="flex flex-col items-center gap-4 p-6">
              <div className="w-32 overflow-hidden rounded-lg shadow-lg">
                <Image
                  src={getScryfallNormalUrl(result!.cardName!)}
                  alt={result!.cardName!}
                  width={130}
                  height={182}
                  className="aspect-[5/7] w-full object-cover"
                  unoptimized
                />
              </div>
              <div className="text-center">
                <p className="text-[length:var(--fs-lg)] font-medium">{result!.cardName}</p>
                <p className="mt-1 text-[length:var(--fs-md)] text-muted-foreground">
                  Not currently in any of your decks
                </p>
              </div>
            </div>
          )}

          {/* Locations list */}
          {showLocations && (
            <div className="p-4">
              {/* Card header with image */}
              <div className="mb-4 flex items-center gap-4">
                <div className="w-20 shrink-0 overflow-hidden rounded-lg shadow-md">
                  <Image
                    src={getScryfallNormalUrl(result!.cardName!)}
                    alt={result!.cardName!}
                    width={80}
                    height={112}
                    className="aspect-[5/7] w-full object-cover"
                    unoptimized
                  />
                </div>
                <div>
                  <p className="text-[length:var(--fs-lg)] font-medium">{result!.cardName}</p>
                  <p className="text-[length:var(--fs-sm)] text-muted-foreground">
                    Found in {result!.locations.length} deck{result!.locations.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Deck list */}
              <div role="list" className="space-y-2">
                {result!.locations.map((loc) => (
                  <Link
                    key={loc.deckId}
                    href={`/decks/${loc.deckId}`}
                    onClick={handleClose}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border border-border p-3 transition-colors',
                      'hover:bg-muted/50'
                    )}
                    role="listitem"
                  >
                    {/* Deck info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[length:var(--fs-md)] font-medium">
                          {loc.deckName}
                        </span>
                        {!loc.isActive && (
                          <Badge variant="outline" className="text-[length:var(--fs-xs)]">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-[length:var(--fs-sm)] text-muted-foreground">
                        {loc.commanderName}
                      </p>
                    </div>

                    {/* Quantity */}
                    {loc.quantity > 1 && (
                      <span className="shrink-0 text-[length:var(--fs-sm)] text-muted-foreground">
                        x{loc.quantity}
                      </span>
                    )}

                    {/* Status badge */}
                    <CardSlotBadge status={loc.status as CardSlotStatus} size="sm" />

                    {/* Arrow */}
                    <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Default state — no query yet */}
          {!hasQuery && !isLoading && (
            <div className="py-8 text-center">
              <p className="text-[length:var(--fs-md)] text-muted-foreground">
                Search for a card to see which decks contain it
              </p>
              <p className="mt-2 text-[length:var(--fs-sm)] text-muted-foreground/70">
                Tip: Press <kbd className="rounded bg-muted px-1.5 py-0.5">⌘⇧K</kbd> to open this anytime
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
