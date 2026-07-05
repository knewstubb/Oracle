'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { OwnershipBadge } from '@/components/OwnershipBadge'
import { cn } from '@/lib/utils'

/* ─── Types ─────────────────────────────────────────────────────────── */

interface AllocationDeckEntry {
  deckId: number
  deckName: string
  ownershipStatus: 'original' | 'proxy' | 'not_owned'
  proxyOfDeckId: number | null
}

interface AllocationCardGroup {
  cardName: string
  decks: AllocationDeckEntry[]
}

interface AllocationResponse {
  cards: AllocationCardGroup[]
}

interface DeckInfo {
  id: number
  name: string
  card_count?: number
}

/* ─── Constants ─────────────────────────────────────────────────────── */

const PAGE_SIZE = 100

/* ─── Helpers ───────────────────────────────────────────────────────── */

/** Abbreviate deck name to ≤8 chars */
function abbreviate(name: string, max = 8): string {
  if (name.length <= max) return name
  return name.slice(0, max - 1) + '…'
}

/** Check if a card row has a proxy */
function rowHasProxy(cardGroup: AllocationCardGroup): boolean {
  return cardGroup.decks.some((d) => d.ownershipStatus === 'proxy')
}

/** Check if a card row has a strict allocation conflict (multiple originals) */
function rowHasConflict(cardGroup: AllocationCardGroup): boolean {
  const originals = cardGroup.decks.filter((d) => d.ownershipStatus === 'original')
  return originals.length > 1
}

/* ─── Component ─────────────────────────────────────────────────────── */

export function AllocationTab({ deckFilter: externalDeckFilter }: { deckFilter?: number }) {
  const queryClient = useQueryClient()
  const [internalDeckFilter, setInternalDeckFilter] = useState<number | 'all' | 'conflicts'>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Derive the effective deck filter: external prop takes precedence
  const effectiveDeckFilter = externalDeckFilter ?? internalDeckFilter

  // Numeric deck ID for the API call
  const deckIdParam = typeof effectiveDeckFilter === 'number' ? effectiveDeckFilter : undefined

  // Fetch decks list for the filter dropdown
  const { data: decks } = useQuery<DeckInfo[]>({
    queryKey: ['decks'],
    queryFn: () => fetch('/api/decks').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  // Fetch allocation data — query key matches spec: ['allocation', deckFilter]
  const {
    data: allocationData,
    isLoading,
    error,
    refetch,
  } = useQuery<AllocationResponse>({
    queryKey: ['allocation', deckIdParam],
    queryFn: () => {
      const url = new URL('/api/allocation', window.location.origin)
      url.searchParams.set('view', 'shared')
      if (deckIdParam) url.searchParams.set('deckId', String(deckIdParam))
      return fetch(url.toString()).then((r) => {
        if (!r.ok) throw new Error('Failed to load allocation data')
        return r.json()
      })
    },
    staleTime: 5 * 60 * 1000,
  })

  // Reassign mutation with optimistic updates
  const reassignMutation = useMutation({
    mutationFn: async ({
      cardName,
      targetDeckId,
    }: {
      cardName: string
      targetDeckId: number
    }) => {
      const res = await fetch('/api/allocation/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardName, targetDeckId }),
      })
      if (!res.ok) throw new Error('Reassign failed')
      return res.json()
    },
    onMutate: async ({ cardName, targetDeckId }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['allocation', deckIdParam] })

      // Snapshot previous value
      const previousData = queryClient.getQueryData<AllocationResponse>(['allocation', deckIdParam])

      // Optimistically update the cache
      queryClient.setQueryData<AllocationResponse>(['allocation', deckIdParam], (old) => {
        if (!old) return old
        return {
          ...old,
          cards: old.cards.map((cardGroup) => {
            if (cardGroup.cardName !== cardName) return cardGroup
            return {
              ...cardGroup,
              decks: cardGroup.decks.map((deck) => {
                if (deck.deckId === targetDeckId) {
                  // Target becomes original
                  return { ...deck, ownershipStatus: 'original' as const, proxyOfDeckId: null }
                }
                if (deck.ownershipStatus === 'original') {
                  // Previous original becomes proxy
                  return { ...deck, ownershipStatus: 'proxy' as const, proxyOfDeckId: targetDeckId }
                }
                return deck
              }),
            }
          }),
        }
      })

      return { previousData }
    },
    onError: (_err, _variables, context) => {
      // Revert optimistic update on failure
      if (context?.previousData) {
        queryClient.setQueryData(['allocation', deckIdParam], context.previousData)
      }
      toast.error('Reassign failed. Please try again.')
    },
    onSuccess: () => {
      toast.success('Card reassigned successfully')
    },
    onSettled: () => {
      // Always refetch after mutation to ensure server state is accurate
      queryClient.invalidateQueries({ queryKey: ['allocation'] })
    },
  })

  // Derive card rows — filter for "conflicts only" view
  const cards = useMemo(() => {
    if (!allocationData?.cards) return []
    if (effectiveDeckFilter === 'conflicts') {
      return allocationData.cards.filter((c) => rowHasConflict(c))
    }
    return allocationData.cards
  }, [allocationData, effectiveDeckFilter])

  // Pagination
  const totalCards = cards.length
  const totalPages = Math.max(1, Math.ceil(totalCards / PAGE_SIZE))
  const paginatedCards = cards.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  // Stats
  const conflictCount = useMemo(
    () => (allocationData?.cards ?? []).filter((c) => rowHasConflict(c)).length,
    [allocationData]
  )
  const proxyCount = useMemo(
    () =>
      (allocationData?.cards ?? []).filter((c) => rowHasProxy(c)).length,
    [allocationData]
  )

  // All unique decks from allocation data (for table columns)
  const allDecksFromData = useMemo(() => {
    if (!decks) return []
    return decks
  }, [decks])

  // Card count per deck (for sidebar)
  const deckCardCounts = useMemo(() => {
    const counts = new Map<number, number>()
    if (!allocationData?.cards) return counts
    for (const card of allocationData.cards) {
      for (const d of card.decks) {
        counts.set(d.deckId, (counts.get(d.deckId) || 0) + 1)
      }
    }
    return counts
  }, [allocationData])

  // Reset page when filter changes
  const handleFilterChange = (filter: number | 'all' | 'conflicts') => {
    setInternalDeckFilter(filter)
    setCurrentPage(1)
  }

  // Handle reassign — pass the specific target deck for original reassignment
  const handleReassign = (cardGroup: AllocationCardGroup, targetDeckId: number) => {
    reassignMutation.mutate({
      cardName: cardGroup.cardName,
      targetDeckId,
    })
  }

  // Error state
  if (error) {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">Failed to load allocation data.</span>
        <Button variant="destructive" size="sm" onClick={() => refetch()}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="flex gap-0" style={{ minHeight: '500px' }}>
      {/* ─── Sidebar ──────────────────────────────────────────────── */}
      {!externalDeckFilter && (
        <aside
          className="shrink-0 border-r"
          style={{
            width: '180px',
            borderColor: 'var(--border-default)',
          }}
        >
          <nav className="flex flex-col py-2" aria-label="Deck filter">
            {/* All decks option */}
            <button
              type="button"
              onClick={() => handleFilterChange('all')}
              className={cn(
                'px-3 py-2 text-left text-sm transition-colors hover:bg-white/5',
                internalDeckFilter === 'all' &&
                  'border-r-2 font-medium text-[var(--color-teal)]'
              )}
              style={{
                borderColor: internalDeckFilter === 'all' ? 'var(--color-teal)' : 'transparent',
              }}
            >
              All decks
            </button>

            {/* Deck list */}
            {decks?.map((deck) => (
              <button
                key={deck.id}
                type="button"
                onClick={() => handleFilterChange(deck.id)}
                className={cn(
                  'flex items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-white/5',
                  internalDeckFilter === deck.id &&
                    'border-r-2 font-medium text-[var(--color-teal)]'
                )}
                style={{
                  borderColor: internalDeckFilter === deck.id ? 'var(--color-teal)' : 'transparent',
                }}
              >
                <span className="truncate">{deck.name}</span>
                {deckCardCounts.has(deck.id) && (
                  <span className="ml-1 shrink-0 text-xs text-muted-foreground">
                    {deckCardCounts.get(deck.id)}
                  </span>
                )}
              </button>
            ))}

            {/* Conflicts only shortcut */}
            <div className="mt-auto border-t pt-2" style={{ borderColor: 'var(--border-default)' }}>
              <button
                type="button"
                onClick={() => handleFilterChange('conflicts')}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/5',
                  internalDeckFilter === 'conflicts' &&
                    'border-r-2 font-medium'
                )}
                style={{
                  color: 'var(--color-amber)',
                  borderColor: internalDeckFilter === 'conflicts' ? 'var(--color-teal)' : 'transparent',
                }}
              >
                ⚠ Conflicts only
              </button>
            </div>
          </nav>
        </aside>
      )}

      {/* ─── Main table area ──────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="border-b text-left"
                    style={{ borderColor: 'var(--border-emphasis)' }}
                  >
                    <th className="sticky left-0 bg-background px-3 py-2 font-medium">
                      Card
                    </th>
                    {allDecksFromData.map((deck) => (
                      <th key={deck.id} className="px-2 py-2 text-center font-medium">
                        <Tooltip>
                          <TooltipTrigger
                            render={<span className="cursor-default" />}
                          >
                            {abbreviate(deck.name)}
                          </TooltipTrigger>
                          <TooltipContent>{deck.name}</TooltipContent>
                        </Tooltip>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCards.length === 0 ? (
                    <tr>
                      <td
                        colSpan={allDecksFromData.length + 2}
                        className="px-3 py-12 text-center text-muted-foreground"
                      >
                        No shared cards found.
                      </td>
                    </tr>
                  ) : (
                    paginatedCards.map((cardGroup) => {
                      const isConflict = rowHasConflict(cardGroup)

                      return (
                        <tr
                          key={cardGroup.cardName}
                          className={cn(
                            'group border-b transition-colors hover:bg-white/[0.02]',
                            isConflict && 'bg-[rgba(239,159,39,0.03)]'
                          )}
                          style={{ borderColor: 'var(--border-default)' }}
                        >
                          {/* Card name */}
                          <td className="sticky left-0 bg-background px-3 py-2 font-medium">
                            <div className="flex items-center gap-2">
                              {isConflict && (
                                <AlertTriangle
                                  className="size-3.5 shrink-0"
                                  style={{ color: 'var(--color-amber)' }}
                                  aria-label="Allocation conflict"
                                />
                              )}
                              <span>{cardGroup.cardName}</span>
                            </div>
                          </td>

                          {/* Deck columns with OwnershipBadge */}
                          {allDecksFromData.map((deck) => {
                            const entry = cardGroup.decks.find(
                              (d) => d.deckId === deck.id
                            )
                            if (!entry) {
                              return (
                                <td
                                  key={deck.id}
                                  className="px-2 py-2 text-center"
                                />
                              )
                            }

                            return (
                              <td key={deck.id} className="px-2 py-2 text-center">
                                <div className="inline-flex items-center gap-1">
                                  <OwnershipBadge status={entry.ownershipStatus} />
                                  {entry.ownershipStatus === 'proxy' && (
                                    <button
                                      type="button"
                                      className="ml-1 rounded px-1.5 py-0.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
                                      style={{
                                        color: 'rgba(255,255,255,0.4)',
                                        background: 'rgba(255,255,255,0.06)',
                                      }}
                                      onClick={() => handleReassign(cardGroup, entry.deckId)}
                                      disabled={reassignMutation.isPending}
                                      title={`Make ${deck.name} the original holder`}
                                    >
                                      ↑
                                    </button>
                                  )}
                                </div>
                              </td>
                            )
                          })}

                          {/* Row-level reassign action */}
                          <td className="px-3 py-2 text-right">
                            {rowHasProxy(cardGroup) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="opacity-0 transition-opacity group-hover:opacity-100"
                                style={{
                                  fontSize: '11px',
                                  height: '24px',
                                  padding: '0 8px',
                                  color: 'var(--color-amber)',
                                }}
                                onClick={() => {
                                  const proxyDeck = cardGroup.decks.find(
                                    (d) => d.ownershipStatus === 'proxy'
                                  )
                                  if (proxyDeck) {
                                    handleReassign(cardGroup, proxyDeck.deckId)
                                  }
                                }}
                                disabled={reassignMutation.isPending}
                              >
                                Reassign
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* ─── Pagination footer ──────────────────────────────── */}
            <footer
              className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground"
              style={{ borderColor: 'var(--border-emphasis)' }}
            >
              <div className="flex items-center gap-4">
                <span>
                  Showing {paginatedCards.length} of {totalCards} cards
                </span>
                <span className="flex items-center gap-2">
                  <span style={{ color: 'var(--color-amber)' }}>
                    {conflictCount} conflicts
                  </span>
                  ·
                  <span>{proxyCount} proxies</span>
                </span>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                    className="size-7 p-0"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>

                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 7) {
                      pageNum = i + 1
                    } else if (currentPage <= 4) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 3) {
                      pageNum = totalPages - 6 + i
                    } else {
                      pageNum = currentPage - 3 + i
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className="size-7 p-0 text-xs"
                      >
                        {pageNum}
                      </Button>
                    )
                  })}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                    className="size-7 p-0"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              )}
            </footer>

            {/* ─── Legend ──────────────────────────────────────────── */}
            <div
              className="flex items-center gap-6 border-t px-4 py-2 text-xs text-muted-foreground"
              style={{ borderColor: 'var(--border-default)' }}
            >
              <span className="flex items-center gap-1.5">
                <OwnershipBadge status="original" />
                Original in this deck
              </span>
              <span className="flex items-center gap-1.5">
                <OwnershipBadge status="proxy" />
                Proxy in this deck
              </span>
              <span className="flex items-center gap-1.5">
                <AlertTriangle
                  className="size-3"
                  style={{ color: 'var(--color-amber)' }}
                  aria-hidden="true"
                />
                Allocation conflict
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
