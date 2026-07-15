'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, List, LayoutGrid, ChevronDown, ChevronRight, AlertTriangle, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { OwnershipBadge } from '@/components/OwnershipBadge'
import { CardImage } from '@/components/CardImage'
import { CategoryTagEditor } from '@/components/CategoryTagEditor'
import { cn } from '@/lib/utils'
import { parseCategoriesCapped } from '@/lib/categoryUtils'
import type { StructuredCategories } from '@/lib/categoryUtils'
import { useDeckCategories } from '@/hooks/useDeckCategories'
import type { DeckCard } from '@/components/CardGrid'
import { CardHoverPreview } from '@/components/CardHoverPreview'
import type { CardSlotStatus } from '@/lib/card-status'
import { isBasicLand } from '@/lib/basic-lands'

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'grid'
type TabMode = 'all' | 'picklist'
type StatusFilter = 'all' | 'original' | 'proxy' | 'open' | 'claimed' | 'unowned'
type GroupBy = 'category' | 'type' | 'status' | 'cmc' | 'color'
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
  const statusOrder = ['original', 'proxy', 'open', 'claimed', 'unowned', 'generic_land']
  const labels: Record<string, string> = {
    original: 'Original',
    proxy: 'Proxy',
    open: 'Open',
    claimed: 'Claimed',
    unowned: 'Unowned',
    generic_land: 'Basic Lands (generic)',
  }
  for (const card of cards) {
    const status = statusMap.get(card.id) ?? 'open'
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

function applyGrouping(
  cards: DeckCard[],
  groupBy: GroupBy,
  statusMap: Map<number, CardSlotStatus>
): [string, DeckCard[]][] {
  switch (groupBy) {
    case 'category': return groupByCategory(cards)
    case 'type': return groupByType(cards)
    case 'status': return groupByStatus(cards, statusMap)
    case 'cmc': return groupByCmc(cards)
    case 'color': return groupByColor(cards)
    default: return groupByCategory(cards)
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CardsTab({ cards, deckId, healthCategories, scrollToCategory }: CardsTabProps) {
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

  // ── Picklist Query (only fetched when picklist mode is active) ────────────

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
    if (typeof window === 'undefined') return 'list'
    const saved = localStorage.getItem(getLocalStorageKey(deckId))
    return saved === 'grid' ? 'grid' : 'list'
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
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

  // ── Filtered & Sorted Cards ──────────────────────────────────────────────────

  const filteredCards = useMemo(() => {
    let result = activeCards

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((c) => c.card_name.toLowerCase().includes(query))
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((c) => {
        const cardStatus = statusMap.get(c.id)
        // Generic lands are exempt from status filtering — always shown
        if (cardStatus === 'generic_land') return true
        return cardStatus === statusFilter
      })
    }

    // Sort
    result = sortCards(result, sortBy)

    return result
  }, [activeCards, searchQuery, statusFilter, sortBy, statusMap])

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
        <div className="mx-auto flex max-w-[1080px] items-center gap-3">
          {/* Tab mode segmented control */}
          <div
            className="inline-flex overflow-hidden rounded-lg"
            style={{ border: '1px solid var(--border-emphasis)' }}
            role="radiogroup"
            aria-label="Tab mode"
          >
            <button
              type="button"
              role="radio"
              aria-checked={tabMode === 'all'}
              onClick={() => setTabMode('all')}
              className={cn(
                'px-3 py-1 text-[length:var(--fs-sm)] font-medium transition-colors',
                tabMode === 'all' ? 'text-white' : 'text-muted-foreground hover:text-foreground'
              )}
              style={{
                backgroundColor: tabMode === 'all' ? 'var(--accent-primary)' : 'transparent',
              }}
            >
              All cards
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={tabMode === 'picklist'}
              onClick={() => setTabMode('picklist')}
              className={cn(
                'px-3 py-1 text-[length:var(--fs-sm)] font-medium transition-colors',
                tabMode === 'picklist' ? 'text-white' : 'text-muted-foreground hover:text-foreground'
              )}
              style={{
                backgroundColor: tabMode === 'picklist' ? 'var(--accent-primary)' : 'transparent',
              }}
            >
              Picklist
            </button>
          </div>

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
              aria-checked={viewMode === 'grid'}
              aria-label="Grid view"
              onClick={() => handleViewToggle('grid')}
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

      {/* ─── Status Filter Chips ──────────────────────────────────────── */}
      {tabMode === 'all' && (
        <div className="shrink-0 border-b px-4 py-2" style={{ borderColor: 'var(--border-default)' }}>
          <div className="mx-auto flex max-w-[1080px] items-center gap-2">
            <StatusChip
              label={`All — ${counts.total}`}
              isActive={statusFilter === 'all'}
              onClick={() => setStatusFilter('all')}
              color="neutral"
            />
            <StatusChip
              label={`Original — ${counts.original}`}
              isActive={statusFilter === 'original'}
              onClick={() => setStatusFilter('original')}
              color="teal"
            />
            <StatusChip
              label={`Proxy — ${counts.proxy}`}
              isActive={statusFilter === 'proxy'}
              onClick={() => setStatusFilter('proxy')}
              color="teal-dim"
            />
            <StatusChip
              label={`Open — ${counts.open}`}
              isActive={statusFilter === 'open'}
              onClick={() => setStatusFilter('open')}
              color="amber"
            />
            <StatusChip
              label={`Claimed — ${counts.claimed}`}
              isActive={statusFilter === 'claimed'}
              onClick={() => setStatusFilter('claimed')}
              color="orange"
            />
            <StatusChip
              label={`Unowned — ${counts.unowned}`}
              isActive={statusFilter === 'unowned'}
              onClick={() => setStatusFilter('unowned')}
              color="red"
            />
          </div>
        </div>
      )}

      {/* ─── View Content Area ─────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-[1080px]">
          {tabMode === 'picklist' ? (
            <Picklist deckId={deckId} deckName="" />
          ) : filteredCards.length === 0 ? (
            <div
              className="flex min-h-[200px] items-center justify-center rounded-lg text-[length:var(--fs-md)] text-muted-foreground"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
            >
              <p>No cards match the current filters.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <GridView cards={filteredCards} groupedCards={groupedCards} statusMap={statusMap} />
          ) : (
            <GroupedListView
              groupedCards={groupedCards}
              healthCategories={healthCategories}
              availableCategories={availableCategories}
              statusMap={statusMap}
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
        <div className="mx-auto flex max-w-[1080px] items-center gap-6 text-[length:var(--fs-sm)]">
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

type ChipColor = 'neutral' | 'teal' | 'teal-dim' | 'amber' | 'orange' | 'red'

interface StatusChipProps {
  label: string
  isActive: boolean
  onClick: () => void
  color: ChipColor
}

const CHIP_COLORS: Record<ChipColor, { active: string; activeBg: string; border: string }> = {
  neutral: { active: 'var(--accent-primary)', activeBg: 'var(--accent-primary-bg)', border: 'var(--accent-primary)' },
  teal: { active: 'var(--accent-primary)', activeBg: 'var(--accent-primary-bg)', border: 'var(--accent-primary)' },
  'teal-dim': { active: 'var(--accent-primary)', activeBg: 'rgba(29, 158, 117, 0.08)', border: 'var(--accent-primary)' },
  amber: { active: 'var(--signal-warning)', activeBg: 'rgba(239, 159, 39, 0.1)', border: 'var(--signal-warning)' },
  orange: { active: 'var(--status-over)', activeBg: 'rgba(255, 95, 31, 0.12)', border: 'var(--status-over)' },
  red: { active: 'var(--signal-critical)', activeBg: 'rgba(228, 75, 74, 0.1)', border: 'var(--signal-critical)' },
}

function StatusChip({ label, isActive, onClick, color }: StatusChipProps) {
  const colors = CHIP_COLORS[color]
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--fs-sm)] font-medium transition-colors"
      style={{
        backgroundColor: isActive ? colors.activeBg : 'var(--bg-card)',
        color: isActive ? colors.active : 'rgba(255,255,255,0.6)',
        border: `1px solid ${isActive ? colors.border : 'var(--border-emphasis)'}`,
      }}
      aria-pressed={isActive}
    >
      {label}
    </button>
  )
}

// ─── Status Badge (five-state) ───────────────────────────────────────────────

// Badge rendering now uses the shared CardSlotBadge component
import { CardSlotBadge } from '@/components/CardSlotBadge'
import { Picklist } from '@/components/Picklist'

function FiveStateBadge({ status }: { status: CardSlotStatus }) {
  return <CardSlotBadge status={status} />
}

// ─── Grouped List View ───────────────────────────────────────────────────────

function GroupedListView({
  groupedCards,
  healthCategories,
  availableCategories,
  statusMap,
  onCategoryChange,
}: {
  groupedCards: [string, DeckCard[]][]
  healthCategories?: CardsTabProps['healthCategories']
  availableCategories: string[]
  statusMap: Map<number, CardSlotStatus>
  onCategoryChange: (cardId: number, categories: StructuredCategories) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleCategory = useCallback((category: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }, [])

  return (
    <div className="space-y-1">
      {groupedCards.map(([groupName, groupCards]) => {
        const isCollapsed = collapsed.has(groupName)
        const count = groupCards.reduce((sum, c) => sum + (c.quantity || 1), 0)

        // Find matching health category
        const health = healthCategories?.find(
          (h) => h.category.toLowerCase() === groupName.toLowerCase()
        )
        const hasViolation = health && health.status !== 'ok'
        const target = health ? health.max : undefined

        return (
          <section
            key={groupName}
            id={`category-${groupName.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {/* Group Header */}
            <button
              type="button"
              onClick={() => toggleCategory(groupName)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
              aria-expanded={!isCollapsed}
              aria-controls={`category-content-${groupName.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <span
                className="text-[11px] font-medium uppercase tracking-wide"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                {groupName}
              </span>
              <span className="text-[11px] text-muted-foreground">{count}</span>

              {/* Fill bar — proportional to count/target if health-monitored */}
              {target !== undefined && target > 0 && (
                <div
                  className="h-1 flex-1 overflow-hidden rounded-full"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', maxWidth: 80 }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      width: `${Math.min(100, (count / target) * 100)}%`,
                    }}
                  />
                </div>
              )}

              {hasViolation && (
                <AlertTriangle
                  className="size-3 shrink-0"
                  style={{ color: 'var(--signal-warning)' }}
                  aria-label={`${groupName} health warning`}
                />
              )}

              <span className="flex-1" />

              {isCollapsed ? (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              ) : (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
            </button>

            {/* Card rows */}
            {!isCollapsed && (
              <div
                id={`category-content-${groupName.toLowerCase().replace(/\s+/g, '-')}`}
                role="list"
                aria-label={`${groupName} cards`}
                className="mb-2"
              >
                {(() => {
                  // Separate basic lands from normal cards for collapsing
                  const normalCards: DeckCard[] = []
                  const basicLandGroups = new Map<string, { generic: DeckCard[]; tracked: DeckCard[] }>()

                  for (const card of groupCards) {
                    if (isBasicLand(card.card_name)) {
                      const existing = basicLandGroups.get(card.card_name) ?? { generic: [], tracked: [] }
                      const cardStatus = statusMap.get(card.id)
                      if (cardStatus === 'generic_land') {
                        existing.generic.push(card)
                      } else {
                        existing.tracked.push(card)
                      }
                      basicLandGroups.set(card.card_name, existing)
                    } else {
                      normalCards.push(card)
                    }
                  }

                  return (
                    <>
                      {/* Collapsed basic land rows */}
                      {Array.from(basicLandGroups.entries()).map(([landName, { generic, tracked }]) => (
                        <BasicLandRow
                          key={`land-${landName}`}
                          landName={landName}
                          genericCount={generic.reduce((sum, c) => sum + (c.quantity || 1), 0)}
                          trackedCards={tracked}
                          statusMap={statusMap}
                        />
                      ))}
                      {/* Normal card rows */}
                      {normalCards.map((card) => (
                        <CardRow
                          key={card.id}
                          card={card}
                          status={statusMap.get(card.id) ?? 'open'}
                          availableCategories={availableCategories}
                          onCategoryChange={onCategoryChange}
                        />
                      ))}
                    </>
                  )
                })()}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

// ─── Card Row ────────────────────────────────────────────────────────────────

// ─── Basic Land Row (Collapsed) ──────────────────────────────────────────────

function BasicLandRow({
  landName,
  genericCount,
  trackedCards,
  statusMap,
}: {
  landName: string
  genericCount: number
  trackedCards: DeckCard[]
  statusMap: Map<number, CardSlotStatus>
}) {
  const [expanded, setExpanded] = useState(false)
  const trackedCount = trackedCards.length
  const totalCount = genericCount + trackedCount

  return (
    <div role="listitem">
      {/* Main collapsed row */}
      <div
        className="group flex items-center gap-3 rounded px-3 py-1.5 transition-colors hover:bg-white/[0.03]"
        style={{ minHeight: 36 }}
      >
        {/* Land name with quantity */}
        <span className="min-w-0 flex-1 truncate text-[length:var(--fs-sm)]">
          {landName}
          <span className="ml-1.5 text-muted-foreground">×{totalCount}</span>
        </span>

        {/* Tracked indicator or "Generic" label */}
        {trackedCount > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground transition-colors"
          >
            {trackedCount} tracked
            {expanded ? (
              <ChevronDown className="ml-1 inline size-3" aria-hidden="true" />
            ) : (
              <ChevronRight className="ml-1 inline size-3" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="shrink-0 text-[length:var(--fs-xs)] text-muted-foreground/60">
            Generic
          </span>
        )}
      </div>

      {/* Expanded tracked copies */}
      {expanded && trackedCount > 0 && (
        <div className="ml-6 flex flex-col gap-0.5 pb-1">
          {trackedCards.map((card) => (
            <div
              key={card.id}
              className="flex items-center gap-3 rounded px-3 py-1 text-[length:var(--fs-xs)]"
            >
              <span className="flex-1 text-muted-foreground">
                {card.set_code?.toUpperCase() || 'Unknown set'}
                {card.scryfall_id ? '' : ''}
              </span>
              <FiveStateBadge status={statusMap.get(card.id) ?? 'original'} />
            </div>
          ))}
          {genericCount > 0 && (
            <div className="px-3 py-1 text-[length:var(--fs-xs)] text-muted-foreground/50 italic">
              + {genericCount} generic — not individually tracked
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Card Row ────────────────────────────────────────────────────────────────

function CardRow({
  card,
  status,
  availableCategories,
  onCategoryChange,
}: {
  card: DeckCard
  status: CardSlotStatus
  availableCategories: string[]
  onCategoryChange: (cardId: number, categories: StructuredCategories) => void
}) {
  const [showPreview, setShowPreview] = useState(false)
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [popoverOpen, setPopoverOpen] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const parsed = parseCategoriesCapped(card.categories)

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setPreviewPos({ x: rect.left + rect.width / 2, y: rect.top })
    timeoutRef.current = setTimeout(() => setShowPreview(true), 300)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setShowPreview(false)
  }

  return (
    <div
      role="listitem"
      className="group flex items-center gap-3 rounded px-3 py-1.5 transition-colors hover:bg-white/[0.03]"
      style={{ minHeight: 36 }}
    >
      {/* Card name with hover preview */}
      <span
        className="min-w-0 flex-1 truncate text-[length:var(--fs-sm)] cursor-default"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {card.card_name}
        {showPreview && card.scryfall_id && (
          <CardHoverPreview
            scryfallId={card.scryfall_id}
            cardName={card.card_name}
            anchorX={previewPos.x}
            anchorY={previewPos.y}
            visible={true}
          />
        )}
      </span>

      {/* Type — muted */}
      <span className="hidden shrink-0 text-[length:var(--fs-xs)] text-muted-foreground sm:inline">
        {parsed.primary_category}
      </span>

      {/* Category edit trigger — visible on hover */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger
          className="inline-flex items-center justify-center size-6 rounded-[min(var(--radius-md),10px)] opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
          aria-label={`Edit categories for ${card.card_name}`}
        >
          <Tags className="size-3" />
        </PopoverTrigger>
        <PopoverContent className="w-64" align="end">
          <CategoryTagEditor
            primaryCategory={parsed.primary_category}
            additionalCategories={parsed.additional_categories}
            availableCategories={availableCategories}
            onChange={(updated) => {
              onCategoryChange(card.id, updated)
              setPopoverOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      {/* Five-state status badge */}
      <FiveStateBadge status={status} />
    </div>
  )
}

// ─── Grid View ───────────────────────────────────────────────────────────────

function GridView({
  cards,
  groupedCards,
  statusMap,
}: {
  cards: DeckCard[]
  groupedCards: [string, DeckCard[]][]
  statusMap: Map<number, CardSlotStatus>
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
          <div className="grid grid-cols-4 gap-3" role="list" aria-label={`${groupName} cards`}>
            {groupCards.map((card) => {
              const cardStatus = statusMap.get(card.id) ?? 'open'
              const statusLabels: Record<string, string> = {
                original: 'Original', proxy: 'Proxy', open: 'Open',
                claimed: 'Claimed', unowned: 'Unowned', generic_land: '',
              }
              const statusLabel = statusLabels[cardStatus] || ''

              // Border style encodes status at tile scale (no text pill, no corner dot)
              const tileBorderStyle: React.CSSProperties = (() => {
                switch (cardStatus) {
                  case 'original':
                    return { border: '2.5px solid var(--accent-primary)' }
                  case 'proxy':
                    return { border: '2.5px dashed var(--accent-primary)' }
                  case 'open':
                    return { border: '2.5px solid var(--signal-warning)' }
                  case 'claimed':
                    return { border: '2.5px solid var(--status-over)' }
                  case 'unowned':
                    return { border: '2.5px solid var(--signal-critical)' }
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
                  {/* Full card image */}
                  {card.scryfall_id ? (
                    <div className="absolute inset-0">
                      <CardImage
                        scryfallId={card.scryfall_id}
                        alt={card.card_name}
                        width={240}
                        height={336}
                        noPreview
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center bg-muted text-[length:var(--fs-sm)] text-muted-foreground"
                      role="img"
                      aria-label={card.card_name}
                    >
                      {card.card_name}
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center opacity-0 transition-opacity group-hover/tile:opacity-100"
                    style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                    aria-hidden="true"
                  >
                    <span className="px-2 text-center text-[length:var(--fs-sm)] font-medium text-white">
                      {card.card_name}
                    </span>
                    <span className="mt-1 text-[length:var(--fs-xs)] text-white/70">
                      {statusLabel}
                    </span>
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
