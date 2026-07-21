'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, List, LayoutGrid, Columns3, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { OwnershipBadge } from '@/components/OwnershipBadge'
import { CardImage } from '@/components/CardImage'
import { cn } from '@/lib/utils'
import { parseCategoriesCapped } from '@/lib/categoryUtils'
import type { StructuredCategories } from '@/lib/categoryUtils'
import { useDeckCategories } from '@/hooks/useDeckCategories'
import type { DeckCard } from '@/components/CardGrid'
import type { CardSlotStatus } from '@/lib/card-status'
import { isBasicLand } from '@/lib/basic-lands'
import { AddCardSearch } from '@/components/AddCardSearch'
import { DeckImportButton } from '@/components/DeckImportButton'
import { CardGroupSection } from '@/components/CardGroupSection'
import { PicklistProgress, type PicklistCard } from '@/components/PicklistV2'

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'cards' | 'groups'
type TabMode = 'all' | 'picklist'
type GroupBy = 'category' | 'type' | 'status' | 'cmc' | 'color' | 'price'
type SortBy = 'name' | 'type' | 'cmc'

interface CardsTabProps {
  cards: DeckCard[]
  deckId: number
  healthCategories?: Array<{
    category: string
    status: string
    actual: number
    min: number
    max: number
  }>
  scrollToCategory?: string | null
  onViewPicklist?: () => void
  /** Maximum copies per card allowed by the deck's format (null = no limit, 1 = singleton). Defaults to 1. */
  maxCopies?: number | null
}

// ─── API Response Types ──────────────────────────────────────────────────────

interface CardStatusResponse {
  cards: Array<{
    deckCardsId: number
    cardName: string
    physicalCopyId: number | null
    isProxy: boolean | null
    status: CardSlotStatus
  }>
  counts: {
    total: number
    original: number
    proxy: number
    open: number
    claimed: number
    unowned: number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLocalStorageKey(deckId: number): string {
  return `cards-tab-view-mode-${deckId}`
}

/** Derive a card type group from the card name heuristic or categories */
function getCardTypeGroup(card: DeckCard): string {
  const primary = parseCategoriesCapped(card.categories).primary_category.toLowerCase()
  if (primary.includes('creature')) return 'Creature'
  if (primary.includes('instant')) return 'Instant'
  if (primary.includes('sorcery') || primary.includes('sorceries')) return 'Sorcery'
  if (primary.includes('artifact')) return 'Artifact'
  if (primary.includes('enchantment')) return 'Enchantment'
  if (primary.includes('land')) return 'Land'
  if (primary.includes('planeswalker')) return 'Planeswalker'
  return 'Other'
}

/** Derive color identity group from card (simplified — uses categories as proxy) */
function getColorGroup(card: DeckCard): string {
  // Without explicit color identity data on DeckCard, use card_name heuristic
  // This will be refined when color_identity is available on the card type
  return 'Unknown'
}

/** Get CMC group bucket */
function getCmcGroup(_card: DeckCard): string {
  // CMC isn't on DeckCard — returns 'Unknown' until extended
  return 'Unknown'
}

// ─── Sort Comparators ────────────────────────────────────────────────────────

function sortCards(cards: DeckCard[], sortBy: SortBy): DeckCard[] {
  return [...cards].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.card_name.localeCompare(b.card_name)
      case 'type': {
        const catA = parseCategoriesCapped(a.categories).primary_category
        const catB = parseCategoriesCapped(b.categories).primary_category
        const catCmp = catA.localeCompare(catB)
        return catCmp !== 0 ? catCmp : a.card_name.localeCompare(b.card_name)
      }
      case 'cmc':
        return a.card_name.localeCompare(b.card_name)
      default:
        return 0
    }
  })
}

// ─── Grouping Functions ──────────────────────────────────────────────────────

function groupByCategory(cards: DeckCard[]): [string, DeckCard[]][] {
  const groups: Record<string, DeckCard[]> = {}
  for (const card of cards) {
    const category = parseCategoriesCapped(card.categories).primary_category
    if (!groups[category]) groups[category] = []
    groups[category].push(card)
  }
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === 'Other') return 1
    if (b === 'Other') return -1
    return a.localeCompare(b)
  })
}

function groupByType(cards: DeckCard[]): [string, DeckCard[]][] {
  const groups: Record<string, DeckCard[]> = {}
  for (const card of cards) {
    const type = getCardTypeGroup(card)
    if (!groups[type]) groups[type] = []
    groups[type].push(card)
  }
  const typeOrder = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Planeswalker', 'Other']
  return Object.entries(groups).sort(([a], [b]) => {
    const ai = typeOrder.indexOf(a)
    const bi = typeOrder.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
}

function groupByStatus(
  cards: DeckCard[],
  statusMap: Map<number, CardSlotStatus>
): [string, DeckCard[]][] {
  const groups: Record<string, DeckCard[]> = {}
  const statusOrder = ['original', 'proxy', 'available', 'claimed', 'unowned', 'generic_land']
  const labels: Record<string, string> = {
    original: 'Original',
    proxy: 'Proxy',
    open: 'Open',
    claimed: 'Claimed',
    unowned: 'Unowned',
    generic_land: 'Basic Lands (generic)',
  }
  for (const card of cards) {
    const status = statusMap.get(card.id) ?? 'available'
    const label = labels[status] ?? status
    if (!groups[label]) groups[label] = []
    groups[label].push(card)
  }
  return Object.entries(groups).sort(([a], [b]) => {
    const ai = statusOrder.indexOf(Object.entries(labels).find(([, v]) => v === a)?.[0] ?? '')
    const bi = statusOrder.indexOf(Object.entries(labels).find(([, v]) => v === b)?.[0] ?? '')
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
}

function groupByCmc(cards: DeckCard[]): [string, DeckCard[]][] {
  // CMC not available on DeckCard — group all into 'Unknown' for now
  return [['All (CMC unavailable)', cards]]
}

function groupByColor(cards: DeckCard[]): [string, DeckCard[]][] {
  // Color identity not available on DeckCard — group all into 'Unknown' for now
  return [['All (Color unavailable)', cards]]
}

/** Group by price into fixed brackets */
function groupByPrice(cards: DeckCard[]): [string, DeckCard[]][] {
  const brackets: Record<string, DeckCard[]> = {
    '$0 – $1': [],
    '$1 – $5': [],
    '$5 – $10': [],
    '$10 – $25': [],
    '$25+': [],
    'No price': [],
  }
  for (const card of cards) {
    // price_ck not available on CardGrid DeckCard — put in "No price"
    brackets['No price'].push(card)
  }
  return Object.entries(brackets).filter(([, cards]) => cards.length > 0)
}

/** Sort grouped cards so Commander is always first */
function sortCommanderFirst(groups: [string, DeckCard[]][]): [string, DeckCard[]][] {
  return groups.sort(([a, cardsA], [b, cardsB]) => {
    const aIsCommander = a.toLowerCase() === 'commander' || cardsA.some(c => c.is_commander)
    const bIsCommander = b.toLowerCase() === 'commander' || cardsB.some(c => c.is_commander)
    if (aIsCommander && !bIsCommander) return -1
    if (bIsCommander && !aIsCommander) return 1
    return 0
  })
}

function applyGrouping(
  cards: DeckCard[],
  groupBy: GroupBy,
  statusMap: Map<number, CardSlotStatus>
): [string, DeckCard[]][] {
  let groups: [string, DeckCard[]][]
  switch (groupBy) {
    case 'category': groups = groupByCategory(cards); break
    case 'type': groups = groupByType(cards); break
    case 'status': groups = groupByStatus(cards, statusMap); break
    case 'cmc': groups = groupByCmc(cards); break
    case 'color': groups = groupByColor(cards); break
    case 'price': groups = groupByPrice(cards); break
    default: groups = groupByCategory(cards)
  }
  return sortCommanderFirst(groups)
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CardsTab({ cards, deckId, healthCategories, scrollToCategory, onViewPicklist, maxCopies = 1 }: CardsTabProps) {
  // ── Derived Data ─────────────────────────────────────────────────────────────

  const availableCategories = useDeckCategories(cards)

  // ── Card Statuses Query ──────────────────────────────────────────────────────

  const { data: statusData } = useQuery<CardStatusResponse>({
    queryKey: ['decks', deckId, 'card-statuses'],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/card-statuses`)
      if (!res.ok) throw new Error('Failed to fetch card statuses')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Picklist data (for progress bar) ─────────────────────────────────────

  const { data: picklistData } = useQuery<{ cards: PicklistCard[]; progress: { resolved: number; total: number } }>({
    queryKey: ['picklist', deckId],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/picklist`)
      if (!res.ok) throw new Error('Failed to fetch picklist')
      return res.json()
    },
    staleTime: 30 * 1000,
  })

  const [tabMode, setTabMode] = useState<TabMode>('all')

  // ── Status Map — merge status data with cards by deck_cards id ───────────

  const statusMap = useMemo(() => {
    const map = new Map<number, CardSlotStatus>()
    if (statusData?.cards) {
      for (const s of statusData.cards) {
        map.set(s.deckCardsId, s.status)
      }
    }
    return map
  }, [statusData])

  // Physical copy ID map (needed for StatusChipPopover actions)
  const physicalCopyMap = useMemo(() => {
    const map = new Map<number, number | null>()
    if (statusData?.cards) {
      for (const s of statusData.cards) {
        map.set(s.deckCardsId, s.physicalCopyId)
      }
    }
    return map
  }, [statusData])

  // ── Status Counts ────────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    if (statusData?.counts) return statusData.counts
    // Fallback if statuses haven't loaded yet
    return { total: cards.length, original: 0, proxy: 0, open: 0, claimed: 0, unowned: 0 }
  }, [statusData, cards.length])

  // ── Category Mutation ────────────────────────────────────────────────────────

  const queryClient = useQueryClient()
  const categoryMutation = useMutation({
    mutationFn: async ({ cardId, categories }: { cardId: number; categories: StructuredCategories }) => {
      const res = await fetch(`/api/decks/${deckId}/cards/${cardId}/categories`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categories),
      })
      if (!res.ok) throw new Error('Failed to update categories')
      return res.json()
    },
    onMutate: async ({ cardId, categories }) => {
      await queryClient.cancelQueries({ queryKey: ['decks', deckId] })
      const previousData = queryClient.getQueryData(['decks', deckId])
      queryClient.setQueryData(['decks', deckId], (old: unknown) => {
        if (!old || typeof old !== 'object') return old
        const deck = old as { cards?: DeckCard[] }
        if (!deck.cards) return old
        return {
          ...deck,
          cards: deck.cards.map((c) =>
            c.id === cardId
              ? {
                  ...c,
                  categories: JSON.stringify([
                    categories.primary_category,
                    ...categories.additional_categories,
                  ]),
                }
              : c
          ),
        }
      })
      return { previousData }
    },
    onError: (err: Error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['decks', deckId], context.previousData)
      }
      toast.error(err.message || 'Failed to update categories')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
    },
  })

  // ── Local State ──────────────────────────────────────────────────────────────

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'groups'
    const saved = localStorage.getItem(getLocalStorageKey(deckId))
    if (saved === 'list' || saved === 'cards' || saved === 'groups') return saved
    return 'groups'
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('category')
  const [sortBy, setSortBy] = useState<SortBy>('name')

  // Persist view mode to localStorage
  useEffect(() => {
    localStorage.setItem(getLocalStorageKey(deckId), viewMode)
  }, [viewMode, deckId])

  // ── Scroll to category when prop changes ─────────────────────────────────────

  useEffect(() => {
    if (!scrollToCategory) return
    const id = `category-${scrollToCategory.toLowerCase().replace(/\s+/g, '-')}`
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [scrollToCategory])

  // ── Filter active cards (exclude Maybeboard/Sideboard) ───────────────────────

  const activeCards = useMemo(() => {
    return cards.filter((c) => {
      const primary = parseCategoriesCapped(c.categories).primary_category
      return primary !== 'Maybeboard' && primary !== 'Sideboard'
    })
  }, [cards])

  // ── Roll up basic lands — collapse duplicate basic land entries into one with summed quantity ──

  const rolledUpCards = useMemo(() => {
    const landCounts = new Map<string, { card: DeckCard; count: number }>()
    const nonLands: DeckCard[] = []

    for (const card of activeCards) {
      if (isBasicLand(card.card_name) && statusMap.get(card.id) === 'generic_land') {
        const existing = landCounts.get(card.card_name)
        if (existing) {
          existing.count += (card.quantity || 1)
        } else {
          landCounts.set(card.card_name, { card, count: card.quantity || 1 })
        }
      } else {
        nonLands.push(card)
      }
    }

    // Create rolled-up entries for basic lands
    const rolledLands: DeckCard[] = Array.from(landCounts.values()).map(({ card, count }) => ({
      ...card,
      quantity: count,
    }))

    return [...nonLands, ...rolledLands]
  }, [activeCards, statusMap])

  // ── Filtered & Sorted Cards ──────────────────────────────────────────────────

  const filteredCards = useMemo(() => {
    let result = rolledUpCards

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((c) => c.card_name.toLowerCase().includes(query))
    }

    // Sort
    result = sortCards(result, sortBy)

    return result
  }, [rolledUpCards, searchQuery, sortBy])

  // ── Grouped cards ────────────────────────────────────────────────────────────

  const groupedCards = useMemo(() => {
    return applyGrouping(filteredCards, groupBy, statusMap)
  }, [filteredCards, groupBy, statusMap])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleViewToggle = useCallback((mode: ViewMode) => {
    setViewMode(mode)
  }, [])

  const cycleSortBy = useCallback(() => {
    setSortBy((prev) => {
      if (prev === 'name') return 'type'
      if (prev === 'type') return 'cmc'
      return 'name'
    })
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* ─── Toolbar ──────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: 'var(--border-default)' }}>
        <div className="mx-auto flex flex-wrap max-w-[var(--content-max-width)] items-center gap-2 md:gap-3">
          {/* Tab mode segmented control */}
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
              aria-label="Search cards"
            />
          </div>

          {/* Group by dropdown — hidden in picklist mode */}
          {tabMode === 'all' && (
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="h-8 rounded-lg border px-2 text-[length:var(--fs-sm)] font-medium text-muted-foreground"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-emphasis)',
              }}
              aria-label="Group by"
            >
              <option value="category">Group: Category</option>
              <option value="type">Group: Type</option>
              <option value="status">Group: Status</option>
              <option value="cmc">Group: CMC</option>
              <option value="color">Group: Color</option>
              <option value="price">Group: Price</option>
            </select>
          )}

          {/* Sort chip */}
          <button
            type="button"
            onClick={cycleSortBy}
            className="rounded-full px-3 py-1 text-[length:var(--fs-sm)] font-medium text-muted-foreground transition-colors hover:text-foreground"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-emphasis)',
            }}
            aria-label={`Sort by ${sortBy}. Click to cycle.`}
          >
            Sort: {sortBy === 'cmc' ? 'CMC' : sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Add card search */}
          <AddCardSearch deckId={deckId} />

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
              aria-checked={viewMode === 'groups'}
              aria-label="Categories view"
              title="Categories"
              onClick={() => handleViewToggle('groups')}
              className={cn(
                'flex items-center justify-center p-1.5 transition-colors',
                viewMode === 'groups' ? 'text-white' : 'text-muted-foreground hover:text-foreground'
              )}
              style={{
                backgroundColor: viewMode === 'groups' ? 'var(--accent-primary)' : 'transparent',
              }}
            >
              <Columns3 className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === 'list'}
              aria-label="Table view"
              title="Table"
              onClick={() => handleViewToggle('list')}
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
              aria-checked={viewMode === 'cards'}
              aria-label="Gallery view"
              title="Gallery"
              onClick={() => handleViewToggle('cards')}
              className={cn(
                'flex items-center justify-center p-1.5 transition-colors',
                viewMode === 'cards' ? 'text-white' : 'text-muted-foreground hover:text-foreground'
              )}
              style={{
                backgroundColor: viewMode === 'cards' ? 'var(--accent-primary)' : 'transparent',
              }}
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── View Content Area ─────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-[var(--content-max-width)]">
          {/* Progress bar */}
          {picklistData && (
            <PicklistProgress
              cards={picklistData.cards}
              progress={picklistData.progress}
              action={
                onViewPicklist && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={onViewPicklist}
                    className="text-[length:var(--fs-xs)]"
                  >
                    View Picklist
                  </Button>
                )
              }
            />
          )}
          {tabMode === 'picklist' ? (
            <PicklistV2 deckId={deckId} />
          ) : cards.length === 0 ? (
            <div
              className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-lg text-center"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
            >
              <p className="text-[length:var(--fs-lg)] font-medium text-foreground">This deck is empty</p>
              <p className="max-w-sm text-[length:var(--fs-sm)] text-muted-foreground">
                Import cards from a URL or paste a list to get started. You can also add cards individually using the search above.
              </p>
              <DeckImportButton />
            </div>
          ) : filteredCards.length === 0 ? (
            <div
              className="flex min-h-[200px] items-center justify-center rounded-lg text-[length:var(--fs-md)] text-muted-foreground"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
            >
              <p>No cards match the current filters.</p>
            </div>
          ) : viewMode === 'cards' ? (
            <GridView cards={filteredCards} groupedCards={groupedCards} statusMap={statusMap} deckId={deckId} />
          ) : viewMode === 'groups' ? (
            <UnifiedGroupsLayout
              groupedCards={groupedCards}
              statusMap={statusMap}
              deckId={deckId}
              physicalCopyMap={physicalCopyMap}
              availableCategories={availableCategories}
              healthCategories={healthCategories}
              maxCopies={maxCopies}
              onCategoryChange={(cardId, categories) => {
                categoryMutation.mutate({ cardId, categories })
              }}
            />
          ) : (
            <UnifiedListLayout
              groupedCards={groupedCards}
              healthCategories={healthCategories}
              availableCategories={availableCategories}
              statusMap={statusMap}
              deckId={deckId}
              physicalCopyMap={physicalCopyMap}
              maxCopies={maxCopies}
              onCategoryChange={(cardId, categories) => {
                categoryMutation.mutate({ cardId, categories })
              }}
            />
          )}
        </div>
      </div>

      {/* ─── Summary Footer ───────────────────────────────────────────── */}
      <div
        className="shrink-0 border-t px-4 py-2"
        style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-surface)' }}
      >
        <div className="mx-auto flex flex-wrap max-w-[var(--content-max-width)] items-center gap-3 md:gap-6 text-[length:var(--fs-sm)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ border: '2px solid var(--accent-primary)' }} aria-hidden="true" />
            <span>{counts.original} original</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ border: '2px dashed var(--accent-primary)' }} aria-hidden="true" />
            <span>{counts.proxy} proxied</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ border: '2px solid var(--signal-warning)' }} aria-hidden="true" />
            <span>{counts.open} open</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ border: '2px solid var(--status-over)' }} aria-hidden="true" />
            <span>{counts.claimed} claimed</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ border: '2px solid var(--signal-critical)' }} aria-hidden="true" />
            <span>{counts.unowned} unowned</span>
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

// ─── Status Chip ─────────────────────────────────────────────────────────────

// ─── Status Badge (five-state) ───────────────────────────────────────────────

// Badge rendering now uses the shared CardGroupSection component
import { PicklistV2 } from '@/components/PicklistV2'

// ─── Unified List Layout (single column, uses CardGroupSection) ──────────────

function UnifiedListLayout({
  groupedCards,
  healthCategories,
  availableCategories,
  statusMap,
  deckId,
  physicalCopyMap,
  onCategoryChange,
  maxCopies,
}: {
  groupedCards: [string, DeckCard[]][]
  healthCategories?: CardsTabProps['healthCategories']
  availableCategories: string[]
  statusMap: Map<number, CardSlotStatus>
  deckId: number
  physicalCopyMap: Map<number, number | null>
  onCategoryChange: (cardId: number, categories: StructuredCategories) => void
  maxCopies?: number | null
}) {
  return (
    <div className="space-y-2">
      {groupedCards.map(([groupName, groupCards]) => {
        const health = healthCategories?.find(
          (h) => h.category.toLowerCase() === groupName.toLowerCase()
        )
        return (
          <CardGroupSection
            key={groupName}
            groupName={groupName}
            groupCards={groupCards}
            statusMap={statusMap}
            deckId={deckId}
            physicalCopyMap={physicalCopyMap}
            availableCategories={availableCategories}
            health={health}
            onCategoryChange={onCategoryChange}
            maxCopies={maxCopies}
          />
        )
      })}
    </div>
  )
}

// ─── Unified Groups Layout (3-column masonry, uses CardGroupSection) ─────────

function UnifiedGroupsLayout({
  groupedCards,
  statusMap,
  deckId,
  physicalCopyMap,
  availableCategories,
  healthCategories,
  onCategoryChange,
  maxCopies,
}: {
  groupedCards: [string, DeckCard[]][]
  statusMap: Map<number, CardSlotStatus>
  deckId: number
  physicalCopyMap: Map<number, number | null>
  availableCategories: string[]
  healthCategories?: CardsTabProps['healthCategories']
  onCategoryChange: (cardId: number, categories: StructuredCategories) => void
  maxCopies?: number | null
}) {
  // Distribute groups across 3 columns using a greedy shortest-column algorithm
  const columns = useMemo(() => {
    const cols: [string, DeckCard[]][][] = [[], [], []]
    const heights = [0, 0, 0]

    for (const group of groupedCards) {
      const [, cards] = group
      const groupHeight = 1 + cards.length
      const minIdx = heights.indexOf(Math.min(...heights))
      cols[minIdx].push(group)
      heights[minIdx] += groupHeight
    }

    return cols
  }, [groupedCards])

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {columns.map((column, colIdx) => (
        <div key={colIdx} className="flex flex-col gap-3">
          {column.map(([groupName, groupCards]) => {
            const health = healthCategories?.find(
              (h) => h.category.toLowerCase() === groupName.toLowerCase()
            )
            return (
              <CardGroupSection
                key={groupName}
                groupName={groupName}
                groupCards={groupCards}
                statusMap={statusMap}
                deckId={deckId}
                physicalCopyMap={physicalCopyMap}
                availableCategories={availableCategories}
                health={health}
                onCategoryChange={onCategoryChange}
                maxCopies={maxCopies}
                compact
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─── Grid View ───────────────────────────────────────────────────────────────

function GridView({
  cards,
  groupedCards,
  statusMap,
  deckId,
}: {
  cards: DeckCard[]
  groupedCards: [string, DeckCard[]][]
  statusMap: Map<number, CardSlotStatus>
  deckId: number
}) {
  return (
    <div className="space-y-6">
      {groupedCards.map(([groupName, groupCards]) => (
        <section
          key={groupName}
          id={`category-${groupName.toLowerCase().replace(/\s+/g, '-')}`}
          aria-label={groupName}
        >
          <h4 className="mb-2 text-[length:var(--fs-sm)] font-medium uppercase text-muted-foreground">
            {groupName} ({groupCards.reduce((sum, c) => sum + (c.quantity || 1), 0)})
          </h4>
          <div className="grid grid-cols-6 gap-3" role="list" aria-label={`${groupName} cards`}>
            {groupCards.map((card) => {
              const cardStatus = statusMap.get(card.id) ?? 'available'
              const statusLabels: Record<string, string> = {
                original: 'Original', proxy: 'Proxy', open: 'Open',
                claimed: 'Claimed', unowned: 'Unowned', generic_land: '',
              }
              const statusLabel = statusLabels[cardStatus] || ''

              // Border style encodes status at tile scale (no text pill, no corner dot)
              const tileBorderStyle: React.CSSProperties = (() => {
                switch (cardStatus) {
                  case 'original':
                    return { border: '1px solid var(--border-default)' }
                  case 'proxy':
                    return { border: '2px dashed var(--accent-primary)', boxShadow: '0 0 12px rgba(29, 158, 117, 0.6), 0 0 4px rgba(29, 158, 117, 0.3)' }
                  case 'available':
                    return { border: '2.5px solid var(--signal-warning)', boxShadow: '0 0 12px rgba(239, 159, 39, 0.6), 0 0 4px rgba(239, 159, 39, 0.3)' }
                  case 'claimed':
                    return { border: '2.5px solid var(--status-over)', boxShadow: '0 0 12px rgba(255, 95, 31, 0.6), 0 0 4px rgba(255, 95, 31, 0.3)' }
                  case 'unowned':
                    return { border: '2.5px solid var(--signal-critical)', boxShadow: '0 0 12px rgba(226, 75, 74, 0.6), 0 0 4px rgba(226, 75, 74, 0.3)' }
                  default:
                    return { border: '1px solid var(--border-default)' }
                }
              })()

              return (
                <div
                  key={card.id}
                  role="listitem"
                  className="group/tile relative aspect-[5/7] overflow-hidden rounded-lg"
                  style={tileBorderStyle}
                >
                  {/* Full card image — high resolution */}
                  {card.scryfall_id ? (
                    <img
                      src={`https://cards.scryfall.io/large/front/${card.scryfall_id.charAt(0)}/${card.scryfall_id.charAt(1)}/${card.scryfall_id}.jpg`}
                      alt={card.card_name}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center bg-muted text-[length:var(--fs-sm)] text-muted-foreground"
                      role="img"
                      aria-label={card.card_name}
                    >
                      {card.card_name}
                    </div>
                  )}

                  {/* Quantity badge — top right, shown when rolled up (quantity > 1) */}
                  {(card.quantity || 1) > 1 && (
                    <div
                      className="absolute top-2 right-2 flex items-center justify-center rounded-full px-2.5 py-1 text-[length:var(--fs-md)] font-bold text-white"
                      style={{ backgroundColor: 'rgba(0,0,0,0.85)', minWidth: '28px' }}
                    >
                      ×{card.quantity}
                    </div>
                  )}

                  {/* Status icon — bottom left corner */}
                  {cardStatus === 'claimed' && (
                    <div
                      className="absolute bottom-2 left-2 flex items-center justify-center rounded-full p-1"
                      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
                      aria-label="Claimed by another deck"
                    >
                      <AlertTriangle className="size-5" style={{ color: 'var(--status-over)' }} />
                    </div>
                  )}
                  {cardStatus === 'available' && (
                    <div
                      className="absolute bottom-2 left-2 flex items-center justify-center rounded-full p-1"
                      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
                      aria-label="Open — copy available"
                    >
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="M10 2a8 8 0 0 1 0 16" stroke="var(--signal-warning)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                      </svg>
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-0 transition-opacity group-hover/tile:opacity-100"
                    style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
                  >
                    <span className="px-2 text-center text-[length:var(--fs-sm)] font-medium text-white">
                      {card.card_name}
                    </span>
                    <span className="text-[length:var(--fs-xs)] text-white/70">
                      {statusLabel}
                    </span>

                    {/* Action buttons — state-dependent */}
                    {(cardStatus === 'original' || cardStatus === 'proxy') && (
                      <div className="mt-1 flex items-center gap-2">
                        <GridCardAction label="Reassign" deckId={deckId} deckCardsId={card.id} cardName={card.card_name} action="reassign" />
                        <GridCardAction label="Remove" deckId={deckId} deckCardsId={card.id} cardName={card.card_name} action="remove" />
                      </div>
                    )}
                    {cardStatus === 'available' && (
                      <div className="mt-1 flex items-center gap-2">
                        <GridCardAction label="Fill" deckId={deckId} deckCardsId={card.id} cardName={card.card_name} action="fill" />
                        <GridCardAction label="Remove" deckId={deckId} deckCardsId={card.id} cardName={card.card_name} action="remove" />
                      </div>
                    )}
                    {cardStatus === 'claimed' && (
                      <div className="mt-1 flex items-center gap-2">
                        <GridCardAction label="Claim" deckId={deckId} deckCardsId={card.id} cardName={card.card_name} action="claim" />
                        <GridCardAction label="Remove" deckId={deckId} deckCardsId={card.id} cardName={card.card_name} action="remove" />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

// ─── Grid Card Action Button ─────────────────────────────────────────────────

function GridCardAction({
  label,
  deckId,
  deckCardsId,
  cardName,
  action,
}: {
  label: string
  deckId: number
  deckCardsId: number
  cardName: string
  action: 'reassign' | 'remove' | 'fill' | 'claim'
}) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setPending(true)

    try {
      if (action === 'remove') {
        const res = await fetch(`/api/decks/${deckId}/cards/${deckCardsId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Remove failed')
        queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
        queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
        toast.success(`Removed ${cardName}`)
      } else if (action === 'fill' || action === 'claim') {
        // Direct to the status chip for the full flow (candidate selection, confirmation)
        toast.info(`Click the status badge on this card to ${action}`)
      } else if (action === 'reassign') {
        toast.info('Click the status badge on this card to reassign')
      }
    } catch {
      toast.error(`Failed to ${action} ${cardName}`)
    } finally {
      setPending(false)
    }
  }

  const isDestructive = action === 'remove'
  const isPrimary = action === 'fill' || action === 'claim' || action === 'reassign'

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded-md px-2.5 py-1 text-[length:var(--fs-xs)] font-medium transition-colors disabled:opacity-40"
      style={{
        background: isDestructive
          ? 'rgba(226,75,74,0.2)'
          : isPrimary
            ? 'rgba(29,158,117,0.2)'
            : 'rgba(255,255,255,0.1)',
        color: isDestructive
          ? '#E24B4A'
          : isPrimary
            ? 'var(--accent-primary)'
            : 'rgba(255,255,255,0.9)',
        border: `0.5px solid ${
          isDestructive
            ? 'rgba(226,75,74,0.4)'
            : isPrimary
              ? 'rgba(29,158,117,0.4)'
              : 'rgba(255,255,255,0.2)'
        }`,
      }}
    >
      {label}
    </button>
  )
}


