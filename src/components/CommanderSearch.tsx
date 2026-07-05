'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ColourPips } from '@/components/ColourPips'
import { cn } from '@/lib/utils'
import Image from 'next/image'

export interface Commander {
  name: string
  manaCost: string
  typeLine: string
  colorIdentity: string[]
  oracleText: string
  owned: boolean
}

interface CommanderSearchProps {
  onSelect: (commander: Commander) => void
  onNext: () => void
}

function getScryfallImageUrl(name: string): string {
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`
}

/**
 * Extract colour identity letters from a mana cost string.
 * e.g. "{2}{G}{U}" → ["G", "U"]
 */
function extractColourIdentity(manaCost: string): string[] {
  const colours = new Set<string>()
  const matches = manaCost.matchAll(/\{([WUBRG])\}/gi)
  for (const m of matches) {
    colours.add(m[1].toUpperCase())
  }
  return Array.from(colours)
}

export function CommanderSearch({ onSelect, onNext }: CommanderSearchProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<Commander[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Commander | null>(null)
  const [collectionOnly, setCollectionOnly] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)

  // Debounce query by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  // Fetch results when debounced query or collectionOnly changes
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
        query: `${debouncedQuery} t:legendary t:creature f:commander`,
        collectionOnly,
      }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => Promise.reject(new Error(d.error || 'Search failed')))
        return res.json()
      })
      .then((data) => {
        if (!cancelled) {
          const cards: Commander[] = (data.cards ?? []).map((card: Record<string, unknown>) => ({
            name: String(card.name ?? ''),
            manaCost: String(card.manaCost ?? ''),
            typeLine: String(card.typeLine ?? ''),
            colorIdentity: Array.isArray(card.colorIdentity)
              ? (card.colorIdentity as string[])
              : extractColourIdentity(String(card.manaCost ?? '')),
            oracleText: String(card.oracleText ?? ''),
            owned: Boolean(card.owned),
          }))
          setResults(cards)
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
  }, [debouncedQuery, collectionOnly])

  const handleSelect = useCallback(
    (commander: Commander) => {
      setSelected(commander)
      onSelect(commander)
    },
    [onSelect]
  )

  const handleRetry = useCallback(() => {
    setDebouncedQuery('')
    requestAnimationFrame(() => setDebouncedQuery(query))
  }, [query])

  const hasQuery = debouncedQuery.trim().length > 0
  const showNoResults = hasQuery && !isLoading && !error && results.length === 0

  return (
    <div className="flex flex-col gap-4" data-testid="commander-search">
      {/* Search input */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
        <Search className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search commanders by name, colour, or theme..."
          className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          aria-label="Search commanders"
        />
        {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Collection only toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={collectionOnly}
          onClick={() => setCollectionOnly(!collectionOnly)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            collectionOnly
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted'
          )}
        >
          Collection only
        </button>
      </div>

      {/* Results area */}
      <div className="min-h-[200px]">
        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" role="status" aria-label="Loading results">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[5/7] w-full rounded-lg" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center gap-3 py-8" role="alert">
            <p className="text-sm text-destructive">Search failed. {error}</p>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </div>
        )}

        {/* No results */}
        {showNoResults && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No commanders found for &apos;{debouncedQuery}&apos;. Try different terms.
          </p>
        )}

        {/* Results grid */}
        {!isLoading && !error && results.length > 0 && (
          <div
            ref={listboxRef}
            role="listbox"
            aria-label="Commander results"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
            onKeyDown={(e) => {
              if (!listboxRef.current) return
              const options = listboxRef.current.querySelectorAll<HTMLElement>('[role="option"]')
              const currentIdx = Array.from(options).findIndex((el) => el === document.activeElement)
              let nextIdx = currentIdx
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                nextIdx = currentIdx < options.length - 1 ? currentIdx + 1 : 0
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                nextIdx = currentIdx > 0 ? currentIdx - 1 : options.length - 1
              } else if (e.key === 'Home') {
                e.preventDefault()
                nextIdx = 0
              } else if (e.key === 'End') {
                e.preventDefault()
                nextIdx = options.length - 1
              }
              if (nextIdx !== currentIdx && options[nextIdx]) {
                options[nextIdx].focus()
              }
            }}
          >
            {results.map((commander) => {
              const isSelected = selected?.name === commander.name
              return (
                <div
                  key={commander.name}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => handleSelect(commander)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSelect(commander)
                    }
                  }}
                  className={cn(
                    'group relative cursor-pointer rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isSelected
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : 'hover:ring-1 hover:ring-border'
                  )}
                >
                  <div className="overflow-hidden rounded-lg bg-muted">
                    <Image
                      src={getScryfallImageUrl(commander.name)}
                      alt={`${commander.name} card`}
                      width={244}
                      height={340}
                      className="aspect-[5/7] w-full object-cover transition-transform duration-150 group-hover:scale-[1.02]"
                      unoptimized
                    />
                  </div>
                  {/* Selected badge */}
                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-primary text-primary-foreground text-[10px] gap-0.5">
                        <Check className="size-3" />
                        Selected
                      </Badge>
                    </div>
                  )}
                  {/* Owned badge */}
                  {commander.owned && !isSelected && (
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-green-600 text-white text-[10px]">Owned</Badge>
                    </div>
                  )}
                  {/* Card info */}
                  <div className="mt-1.5 space-y-0.5 px-0.5">
                    <p className="truncate text-sm font-medium">{commander.name}</p>
                    <ColourPips colours={commander.colorIdentity} size={10} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Default state — no query yet */}
        {!hasQuery && !isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Search for a legendary creature to use as your commander.
          </p>
        )}
      </div>

      {/* Next button */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={onNext}
          disabled={!selected}
          aria-disabled={!selected}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
