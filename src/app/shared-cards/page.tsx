'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, RefreshCw, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { CardImage } from '@/components/CardImage'
import { PageHeader } from '@/components/PageHeader'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface PrintingDeck {
  id: number
  name: string
  is_proxy: boolean
}

interface Printing {
  set_code: string
  set_name: string
  scryfall_id: string
  owned: number
  in_decks: number
  decks: PrintingDeck[]
}

interface CardGroup {
  card_name: string
  total_deck_count: number
  owned_total: number
  needing_proxies: boolean
  printings: Printing[]
}

interface SharedCardsResponse {
  groups: CardGroup[]
  collectionSynced: boolean
}

type SortField = 'total_deck_count' | 'card_name'
type SortOrder = 'asc' | 'desc'

const SORT_LABELS: Record<SortField, string> = {
  total_deck_count: 'Deck count',
  card_name: 'Card name',
}

export default function SharedCardsPage() {
  const [sortField, setSortField] = useState<SortField>('total_deck_count')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [proxiesOnly, setProxiesOnly] = useState(false)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  const { data, isLoading, error, refetch } = useQuery<SharedCardsResponse>({
    queryKey: ['shared-cards'],
    queryFn: () =>
      fetch('/api/shared-cards').then((r) => {
        if (!r.ok) throw new Error('Failed to load shared cards')
        return r.json()
      }),
    staleTime: 5 * 60 * 1000,
  })

  const groups = data?.groups
  const collectionSynced = data?.collectionSynced ?? false

  const filtered = useMemo(() => {
    if (!groups) return []
    let result = [...groups]
    if (proxiesOnly) {
      result = result.filter((g) => g.needing_proxies)
    }
    result.sort((a, b) => {
      let cmp: number
      if (sortField === 'total_deck_count') {
        cmp = a.total_deck_count - b.total_deck_count
      } else {
        cmp = a.card_name.localeCompare(b.card_name)
      }
      return sortOrder === 'asc' ? cmp : -cmp
    })
    return result
  }, [groups, proxiesOnly, sortField, sortOrder])

  const totalShared = groups?.length ?? 0
  const totalNeedingProxies = groups?.filter((g) => g.needing_proxies).length ?? 0

  function toggleExpanded(cardName: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(cardName)) next.delete(cardName)
      else next.add(cardName)
      return next
    })
  }

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] px-8 py-8 bg-[var(--bg-canvas)] min-h-full">
      <header className="mb-8">
        <PageHeader title="Shared Cards" />
        {groups && groups.length > 0 && (
          <p className="mt-1 text-[length:var(--fs-md)] text-muted-foreground" data-testid="summary-stats">
            {totalShared} cards shared{collectionSynced ? ` · ${totalNeedingProxies} need proxies` : ''}
          </p>
        )}
        {!collectionSynced && groups && groups.length > 0 && (
          <p className="mt-1 text-[length:var(--fs-sm)] text-warning">
            Collection not synced — ownership data unavailable. Sync to see owned counts.
          </p>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-[length:var(--fs-md)] text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Couldn&apos;t load shared cards. {(error as Error).message}</span>
          <Button variant="destructive" size="sm" onClick={() => refetch()}>
            <RefreshCw className="size-3.5" aria-hidden="true" data-icon="inline-start" />
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !error && groups && groups.length > 0 && (
        <div className="mb-4 flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm">
                  <ArrowUpDown className="size-3.5" aria-hidden="true" data-icon="inline-start" />
                  Sort: {SORT_LABELS[sortField]}
                </Button>
              }
            />
            <DropdownMenuContent>
              <DropdownMenuRadioGroup value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
                <DropdownMenuRadioItem value="total_deck_count">Deck count</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="card_name">Card name</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            aria-label={`Sort order: ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
          >
            {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
          </Button>

          <label className="flex items-center gap-2 text-[length:var(--fs-md)] text-muted-foreground">
            <Switch checked={proxiesOnly} onCheckedChange={(checked) => setProxiesOnly(checked)} />
            Needs proxies only
          </label>
        </div>
      )}

      {isLoading ? (
        <div role="list" aria-label="Loading shared cards" className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} role="listitem" className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-12 rounded" />
                <Skeleton className="h-5 w-40" />
                <div className="flex-1" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : groups && groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-muted-foreground">No shared cards found.</p>
        </div>
      ) : filtered.length === 0 && proxiesOnly ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-muted-foreground">
            No cards match.{' '}
            <button type="button" className="underline hover:text-foreground" onClick={() => setProxiesOnly(false)}>
              Clear filters
            </button>
          </p>
        </div>
      ) : (
        <div role="list" aria-label="Shared cards list" className="space-y-3">
          {filtered.map((group) => {
            const isExpanded = expandedCards.has(group.card_name)

            return (
              <div key={group.card_name} role="listitem" className="rounded-2xl border border-border bg-card shadow-sm">
                {/* Card name header row */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(group.card_name)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}

                  <div className="min-w-0 flex-1">
                    <span className="text-[length:var(--fs-md)] font-medium text-foreground">{group.card_name}</span>
                    <span className="ml-2 text-[length:var(--fs-sm)] text-muted-foreground">
                      {group.printings.length} {group.printings.length === 1 ? 'printing' : 'printings'}
                    </span>
                  </div>

                  <span className="text-[length:var(--fs-sm)] text-muted-foreground">
                    In {group.total_deck_count} {group.total_deck_count === 1 ? 'deck' : 'decks'}
                  </span>

                  {collectionSynced && (
                    <span className={cn('text-[length:var(--fs-sm)] font-medium tabular-nums', group.owned_total === 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      Owned: {group.owned_total}
                    </span>
                  )}

                  {group.needing_proxies && collectionSynced && (
                    <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
                  )}
                </button>

                {/* Expanded: printings list */}
                {isExpanded && (
                  <div className="border-t border-border px-4 pb-3 pt-2">
                    <div className="space-y-2">
                      {group.printings.map((printing) => {
                        const isUnused = printing.in_decks === 0 && printing.owned > 0
                        return (
                          <div
                            key={`${printing.set_code}|${printing.scryfall_id}`}
                            className={cn(
                              'flex items-center gap-3 rounded-xl px-3 py-2',
                              isUnused ? 'bg-muted/50' : ''
                            )}
                          >
                            <CardImage
                              scryfallId={printing.scryfall_id}
                              alt={`${group.card_name} (${printing.set_code.toUpperCase()})`}
                              width={36}
                              height={50}
                              noPreview
                              className="rounded"
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[length:var(--fs-sm)] font-medium uppercase text-muted-foreground">
                                  {printing.set_code || '???'}
                                </span>
                                {printing.set_name && (
                                  <span className="text-[length:var(--fs-sm)] text-muted-foreground/70">
                                    {printing.set_name}
                                  </span>
                                )}
                                {collectionSynced && (
                                  <span className={cn(
                                    'text-[length:var(--fs-sm)] tabular-nums',
                                    printing.owned === 0 ? 'font-medium text-destructive' : 'text-muted-foreground'
                                  )}>
                                    Owned: {printing.owned}
                                  </span>
                                )}
                                {isUnused && (
                                  <Badge variant="secondary" className="text-[length:var(--fs-xs)] text-muted-foreground">
                                    Not in any deck
                                  </Badge>
                                )}
                              </div>

                              {/* Deck badges for this printing */}
                              {printing.decks.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {printing.decks.map((deck) => (
                                    <Badge key={deck.id} variant="secondary" className="text-[length:var(--fs-xs)]">
                                      {deck.name}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
