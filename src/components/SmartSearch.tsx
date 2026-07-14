'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ManaCost } from '@/components/ManaCost'
import { cn } from '@/lib/utils'
import Image from 'next/image'

interface SearchCard {
  name: string
  manaCost: string
  typeLine: string
  oracleText: string
  owned: boolean
  ownedCount: number
}

interface SmartSearchProps {
  /** Card names currently in the active deck, used for "In deck" badge */
  currentDeckCards?: string[]
}

function getScryfallNormalUrl(name: string): string {
  // Use Scryfall's named card image API
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`
}

export function SmartSearch({ currentDeckCards = [] }: SmartSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<SearchCard[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter state
  const [collectionOnly, setCollectionOnly] = useState(false)
  const [colorIdentity, setColorIdentity] = useState('')
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined)

  const overlayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const currentDeckSet = useRef(new Set(currentDeckCards.map((c) => c.toLowerCase())))

  // Update deck set when prop changes
  useEffect(() => {
    currentDeckSet.current = new Set(currentDeckCards.map((c) => c.toLowerCase()))
  }, [currentDeckCards])

  // Listen for open-search custom event (from Sidebar Cmd+K)
  useEffect(() => {
    function handleOpenSearch() {
      setOpen(true)
    }
    window.addEventListener('open-search', handleOpenSearch)
    return () => window.removeEventListener('open-search', handleOpenSearch)
  }, [])

  // Auto-focus input when overlay opens
  useEffect(() => {
    if (open) {
      // Small delay to ensure the DOM is ready
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

  // Focus trap
  useEffect(() => {
    if (!open || !overlayRef.current) return
    const overlay = overlayRef.current

    function trapFocus(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const focusable = overlay.querySelectorAll<HTMLElement>(
        'input, button, [tabindex]:not([tabindex="-1"]), a[href]'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', trapFocus)
    return () => document.removeEventListener('keydown', trapFocus)
  }, [open, results, isLoading])

  // Debounce query by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  // Fetch results when debounced query or filters change
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([])
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetch('/api/ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: debouncedQuery,
        collectionOnly,
        colorIdentity: colorIdentity || undefined,
        maxPrice: maxPrice || undefined,
      }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => Promise.reject(new Error(d.error || 'Search failed')))
        return res.json()
      })
      .then((data) => {
        if (!cancelled) {
          setResults(data.cards ?? [])
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
  }, [debouncedQuery, collectionOnly, colorIdentity, maxPrice])

  const handleClose = useCallback(() => {
    setOpen(false)
    setQuery('')
    setDebouncedQuery('')
    setResults([])
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

  const handleRetry = useCallback(() => {
    // Re-trigger search by bumping debounced query
    setDebouncedQuery('')
    requestAnimationFrame(() => setDebouncedQuery(query))
  }, [query])

  if (!open) return null

  const hasQuery = debouncedQuery.trim().length > 0
  const showNoResults = hasQuery && !isLoading && !error && results.length === 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[10vh] backdrop-blur-sm"
      onClick={handleBackdropClick}
      data-testid="smart-search-overlay"
    >
      <div
        ref={overlayRef}
        role="dialog"
        aria-label="Smart search"
        className="mx-4 flex w-full max-w-2xl flex-col rounded-2xl bg-popover shadow-2xl shadow-black/8 ring-1 ring-border"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards in plain English..."
            className="flex-1 bg-transparent text-[length:var(--fs-lg)] outline-none placeholder:text-muted-foreground"
            aria-label="Search cards"
          />
          {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <Button variant="ghost" size="icon-sm" onClick={handleClose} aria-label="Close search">
            <X className="size-4" />
          </Button>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <button
            type="button"
            role="switch"
            aria-checked={collectionOnly}
            aria-label="Collection only"
            onClick={() => setCollectionOnly(!collectionOnly)}
            className={cn(
              'rounded-full border px-3 py-1 text-[length:var(--fs-sm)] font-medium transition-colors',
              collectionOnly
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            Collection only
          </button>
          <select
            value={colorIdentity}
            onChange={(e) => setColorIdentity(e.target.value)}
            aria-label="Colour identity filter"
            className="rounded-full border border-border bg-transparent px-3 py-1 text-[length:var(--fs-sm)] font-medium text-muted-foreground outline-none hover:bg-muted"
          >
            <option value="">Any colour</option>
            <option value="W">White</option>
            <option value="U">Blue</option>
            <option value="B">Black</option>
            <option value="R">Red</option>
            <option value="G">Green</option>
            <option value="WU">Azorius</option>
            <option value="WB">Orzhov</option>
            <option value="UB">Dimir</option>
            <option value="UR">Izzet</option>
            <option value="BR">Rakdos</option>
            <option value="BG">Golgari</option>
            <option value="RG">Gruul</option>
            <option value="RW">Boros</option>
            <option value="GW">Selesnya</option>
            <option value="GU">Simic</option>
          </select>
          <input
            type="number"
            min={0}
            step={0.5}
            value={maxPrice ?? ''}
            onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="Max price ($)"
            aria-label="Budget cap"
            className="w-28 rounded-full border border-border bg-transparent px-3 py-1 text-[length:var(--fs-sm)] font-medium text-muted-foreground outline-none placeholder:text-muted-foreground hover:bg-muted"
          />
        </div>

        {/* Results area */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {/* Loading skeleton */}
          {isLoading && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="status" aria-label="Loading results">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[5/7] w-full rounded-lg" />
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex flex-col items-center gap-3 py-8" role="alert">
              <p className="text-[length:var(--fs-md)] text-destructive">Search failed. {error}</p>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                Retry
              </Button>
            </div>
          )}

          {/* No results */}
          {showNoResults && (
            <p className="py-8 text-center text-[length:var(--fs-md)] text-muted-foreground">
              No cards found for &apos;{debouncedQuery}&apos;. Try different terms.
            </p>
          )}

          {/* Results grid */}
          {!isLoading && !error && results.length > 0 && (
            <div role="list" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {results.map((card) => {
                const inDeck = currentDeckSet.current.has(card.name.toLowerCase())
                return (
                  <div key={card.name} role="listitem" className="group relative">
                    <div className="overflow-hidden rounded-lg bg-muted">
                      <Image
                        src={getScryfallNormalUrl(card.name)}
                        alt={`${card.name} card`}
                        width={244}
                        height={340}
                        className="aspect-[5/7] w-full object-cover transition-transform duration-150 group-hover:scale-[1.02]"
                        unoptimized
                      />
                    </div>
                    {/* Badges */}
                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                      {card.owned && (
                        <Badge className="bg-green-600 text-white text-[length:var(--fs-xs)]">Owned</Badge>
                      )}
                      {inDeck && (
                        <Badge className="bg-blue-600 text-white text-[length:var(--fs-xs)]">In deck</Badge>
                      )}
                    </div>
                    {/* Card info */}
                    <div className="mt-1.5 space-y-0.5">
                      <p className="truncate text-[length:var(--fs-md)] font-medium">{card.name}</p>
                      <ManaCost cost={card.manaCost} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Default state — no query yet */}
          {!hasQuery && !isLoading && (
            <p className="py-8 text-center text-[length:var(--fs-md)] text-muted-foreground">
              Type a query to search for Commander-legal cards.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
