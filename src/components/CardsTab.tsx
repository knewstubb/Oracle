'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, List, LayoutGrid, Columns3, ChevronDown, ChevronRight, AlertTriangle, Sparkles, Loader2, Check, X, Trash2, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { OwnershipBadge } from '@/components/OwnershipBadge'
import { CardImage } from '@/components/CardImage'
import { cn } from '@/lib/utils'
import { parseCategoriesCapped } from '@/lib/categoryUtils'
import type { StructuredCategories } from '@/lib/categoryUtils'
import { useDeckCategories } from '@/hooks/useDeckCategories'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
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
    available: number
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

/** Derive color identity group from card mana cost */
function getColorGroup(card: DeckCard): string {
  if (!card.mana_cost) return 'Colorless'
  const colors: string[] = []
  if (card.mana_cost.includes('W')) colors.push('W')
  if (card.mana_cost.includes('U')) colors.push('U')
  if (card.mana_cost.includes('B')) colors.push('B')
  if (card.mana_cost.includes('R')) colors.push('R')
  if (card.mana_cost.includes('G')) colors.push('G')
  if (colors.length === 0) return 'Colorless'
  if (colors.length > 1) return 'Multicolor'
  const colorNames: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' }
  return colorNames[colors[0]] || 'Colorless'
}

/** Extract CMC from mana_cost string (e.g. "{2}{U}{U}" -> 4) */
function extractCmc(manaCost: string | null | undefined): number {
  if (!manaCost) return 0
  let cmc = 0
  // Match generic mana {X} where X is a number
  const genericMatch = manaCost.match(/\{(\d+)\}/g)
  if (genericMatch) {
    for (const m of genericMatch) {
      cmc += parseInt(m.replace(/[{}]/g, ''), 10)
    }
  }
  // Count colored pips (each is 1 CMC)
  const coloredPips = manaCost.match(/\{[WUBRGC]\}/gi)
  if (coloredPips) cmc += coloredPips.length
  // Hybrid mana counts as 1
  const hybridPips = manaCost.match(/\{[WUBRG]\/[WUBRG]\}/gi)
  if (hybridPips) cmc += hybridPips.length
  // Phyrexian mana counts as 1
  const phyrexianPips = manaCost.match(/\{[WUBRG]\/P\}/gi)
  if (phyrexianPips) cmc += phyrexianPips.length
  return cmc
}

/** Get CMC group bucket */
function getCmcGroup(card: DeckCard): string {
  const cmc = extractCmc(card.mana_cost)
  if (cmc === 0) return '0'
  if (cmc === 1) return '1'
  if (cmc === 2) return '2'
  if (cmc === 3) return '3'
  if (cmc === 4) return '4'
  if (cmc === 5) return '5'
  if (cmc === 6) return '6'
  return '7+'
}

/** Get price bracket */
function getPriceBracket(price: number | null | undefined): string {
  if (price === null || price === undefined) return 'No price'
  if (price < 0.5) return '$0 – $0.50'
  if (price < 1) return '$0.50 – $1'
  if (price < 2) return '$1 – $2'
  if (price < 5) return '$2 – $5'
  if (price < 10) return '$5 – $10'
  if (price < 20) return '$10 – $20'
  if (price < 50) return '$20 – $50'
  if (price < 100) return '$50 – $100'
  return '$100+'
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
    claimed: 'In Decks',
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
  const groups: Record<string, DeckCard[]> = {}
  for (const card of cards) {
    const cmcGroup = getCmcGroup(card)
    if (!groups[cmcGroup]) groups[cmcGroup] = []
    groups[cmcGroup].push(card)
  }
  const cmcOrder = ['0', '1', '2', '3', '4', '5', '6', '7+']
  return Object.entries(groups)
    .filter(([, cards]) => cards.length > 0)
    .sort(([a], [b]) => {
      const ai = cmcOrder.indexOf(a)
      const bi = cmcOrder.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
}

function groupByColor(cards: DeckCard[]): [string, DeckCard[]][] {
  const groups: Record<string, DeckCard[]> = {}
  for (const card of cards) {
    const color = getColorGroup(card)
    if (!groups[color]) groups[color] = []
    groups[color].push(card)
  }
  const colorOrder = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless']
  return Object.entries(groups)
    .filter(([, cards]) => cards.length > 0)
    .sort(([a], [b]) => {
      const ai = colorOrder.indexOf(a)
      const bi = colorOrder.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
}

/** Group by price into fixed brackets */
function groupByPrice(cards: DeckCard[]): [string, DeckCard[]][] {
  const groups: Record<string, DeckCard[]> = {}
  for (const card of cards) {
    const bracket = getPriceBracket(card.price_usd)
    if (!groups[bracket]) groups[bracket] = []
    groups[bracket].push(card)
  }
  const priceOrder = ['$0 – $0.50', '$0.50 – $1', '$1 – $2', '$2 – $5', '$5 – $10', '$10 – $20', '$20 – $50', '$50 – $100', '$100+', 'No price']
  return Object.entries(groups)
    .filter(([, cards]) => cards.length > 0)
    .sort(([a], [b]) => {
      const ai = priceOrder.indexOf(a)
      const bi = priceOrder.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
}

/** Move Commander category group to front (only when it's literally named "Commander"), and sort cards within each group by name */
function sortCommanderFirst(groups: [string, DeckCard[]][]): [string, DeckCard[]][] {
  // Sort cards within each group by name (ascending)
  const sortedGroups = groups.map(([name, cards]) => [
    name,
    [...cards].sort((a, b) => a.card_name.localeCompare(b.card_name))
  ] as [string, DeckCard[]])
  
  // Only move the "Commander" category group to front — don't disrupt CMC/Color/Type/Price order
  const commanderIdx = sortedGroups.findIndex(([name]) => 
    name.toLowerCase() === 'commander'
  )
  if (commanderIdx > 0) {
    const [commanderGroup] = sortedGroups.splice(commanderIdx, 1)
    sortedGroups.unshift(commanderGroup)
  }
  return sortedGroups
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
    queryKey: deckKeys.cardStatuses(deckId),
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/card-statuses`)
      if (!res.ok) throw new Error('Failed to fetch card statuses')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Picklist data (for progress bar) ─────────────────────────────────────

  const { data: picklistData } = useQuery<{ cards: PicklistCard[]; progress: { resolved: number; total: number } }>({
    queryKey: deckKeys.picklist(deckId),
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/picklist`)
      if (!res.ok) throw new Error('Failed to fetch picklist')
      return res.json()
    },
    staleTime: 5 * 1000, // Shorter stale time for more responsive updates
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
      await queryClient.cancelQueries({ queryKey: deckKeys.detail(deckId) })
      const previousData = queryClient.getQueryData(deckKeys.detail(deckId))
      queryClient.setQueryData(deckKeys.detail(deckId), (old: unknown) => {
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
        queryClient.setQueryData(deckKeys.detail(deckId), context.previousData)
      }
      toast.error(err.message || 'Failed to update categories')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) })
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
  const [selectedCardIds, setSelectedCardIds] = useState<Set<number>>(new Set())

  // Selection handlers
  const handleSelectionChange = useCallback((cardId: number, selected: boolean) => {
    setSelectedCardIds(prev => {
      const next = new Set(prev)
      if (selected) {
        next.add(cardId)
      } else {
        next.delete(cardId)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    // Select all non-commander cards
    const ids = cards.filter(c => !c.is_commander).map(c => c.id)
    setSelectedCardIds(new Set(ids))
  }, [cards])

  const handleDeselectAll = useCallback(() => {
    setSelectedCardIds(new Set())
  }, [])

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

          {/* Auto-categorize button */}
          <AutoCategorizeButton cards={cards} deckId={deckId} />

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

      {/* ─── Selection Toolbar (appears when cards are selected) ──────────── */}
      {selectedCardIds.size > 0 && (
        <div className="shrink-0 border-b px-4 py-2" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--accent-primary-muted, rgba(29, 158, 117, 0.08))' }}>
          <div className="mx-auto flex max-w-[var(--content-max-width)] items-center gap-3">
            <span className="text-[length:var(--fs-sm)] font-medium">
              {selectedCardIds.size} card{selectedCardIds.size !== 1 ? 's' : ''} selected
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={handleSelectAll}
              className="text-[length:var(--fs-xs)]"
            >
              Select All
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={handleDeselectAll}
              className="text-[length:var(--fs-xs)]"
            >
              Deselect All
            </Button>
            <span className="flex-1" />
            {/* Bulk action buttons */}
            <BulkActionsBar
              selectedIds={selectedCardIds}
              deckId={deckId}
              availableCategories={availableCategories}
              onComplete={() => {
                handleDeselectAll()
                queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) })
                queryClient.invalidateQueries({ queryKey: deckKeys.cardStatuses(deckId) })
              }}
            />
          </div>
        </div>
      )}

      {/* ─── View Content Area ─────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-[var(--content-max-width)]">
          {/* Progress bar - uses statusData.counts for immediate updates */}
          {statusData?.counts && (
            <PicklistProgress
              counts={{
                original: statusData.counts.original,
                proxy: statusData.counts.proxy,
                available: statusData.counts.available,
                claimed: statusData.counts.claimed,
                unowned: statusData.counts.unowned,
                total: statusData.counts.total,
              }}
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
              selectedIds={selectedCardIds}
              onSelectionChange={handleSelectionChange}
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
              selectedIds={selectedCardIds}
              onSelectionChange={handleSelectionChange}
              onCategoryChange={(cardId, categories) => {
                categoryMutation.mutate({ cardId, categories })
              }}
            />
          )}
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
  selectedIds,
  onSelectionChange,
}: {
  groupedCards: [string, DeckCard[]][]
  healthCategories?: CardsTabProps['healthCategories']
  availableCategories: string[]
  statusMap: Map<number, CardSlotStatus>
  deckId: number
  physicalCopyMap: Map<number, number | null>
  onCategoryChange: (cardId: number, categories: StructuredCategories) => void
  maxCopies?: number | null
  selectedIds?: Set<number>
  onSelectionChange?: (cardId: number, selected: boolean) => void
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
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChange}
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
  selectedIds,
  onSelectionChange,
}: {
  groupedCards: [string, DeckCard[]][]
  statusMap: Map<number, CardSlotStatus>
  deckId: number
  physicalCopyMap: Map<number, number | null>
  availableCategories: string[]
  healthCategories?: CardsTabProps['healthCategories']
  onCategoryChange: (cardId: number, categories: StructuredCategories) => void
  maxCopies?: number | null
  selectedIds?: Set<number>
  onSelectionChange?: (cardId: number, selected: boolean) => void
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
                selectedIds={selectedIds}
                onSelectionChange={onSelectionChange}
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
                claimed: 'In Decks', unowned: 'Unowned', generic_land: '',
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
                      aria-label="In another deck"
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
                        <GridCardAction label="Pull" deckId={deckId} deckCardsId={card.id} cardName={card.card_name} action="claim" />
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
        queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) })
        queryClient.invalidateQueries({ queryKey: deckKeys.cardStatuses(deckId) })
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



// ---------------------------------------------------------------------------
// AutoCategorizeButton — bulk categorize uncategorized cards
// ---------------------------------------------------------------------------

interface CategorySuggestion {
  category: string
  confidence: 'high' | 'medium' | 'low'
  source: 'tag' | 'archetype' | 'theme'
  sourceValue: string
}

interface BatchSuggestionResult {
  cardName: string
  suggestions: CategorySuggestion[]
  tags: string[]
  error?: string
}

interface AutoCategorizeButtonProps {
  cards: DeckCard[]
  deckId: number
}

function AutoCategorizeButton({ cards, deckId }: AutoCategorizeButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState<BatchSuggestionResult[]>([])
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  // Find uncategorized cards (category is 'Other' or missing)
  const uncategorizedCards = useMemo(() => {
    return cards.filter((card) => {
      // Skip basic lands
      if (isBasicLand(card.card_name)) return false
      // Skip commanders
      if (card.is_commander) return false
      
      const parsed = parseCategoriesCapped(card.categories)
      return parsed.primary_category === 'Other' || parsed.primary_category === ''
    })
  }, [cards])

  const handleOpen = async () => {
    setDialogOpen(true)
    setProcessing(true)
    setResults([])
    setApplied(new Set())

    try {
      // Call batch API
      const cardNames = uncategorizedCards.map(c => c.card_name)
      const res = await fetch('/api/cards/suggest-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardNames }),
      })

      if (!res.ok) throw new Error('Failed to fetch suggestions')

      const data = await res.json()
      setResults(data.results || [])
    } catch {
      toast.error('Failed to fetch category suggestions')
    } finally {
      setProcessing(false)
    }
  }

  const handleApplySingle = async (cardName: string, suggestion: CategorySuggestion) => {
    const card = uncategorizedCards.find(c => c.card_name === cardName)
    if (!card) return

    try {
      const categories: StructuredCategories = {
        primary_category: suggestion.category,
        additional_categories: [],
      }

      const res = await fetch(`/api/decks/${deckId}/cards/${card.id}/categories`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categories),
      })

      if (!res.ok) throw new Error('Failed to update')

      setApplied(prev => new Set([...prev, cardName]))
      queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) })
      toast.success(`Categorized ${cardName} as ${suggestion.category}`)
    } catch {
      toast.error(`Failed to categorize ${cardName}`)
    }
  }

  const handleApplyAll = async () => {
    setProcessing(true)
    let successCount = 0
    let failCount = 0

    for (const result of results) {
      if (applied.has(result.cardName)) continue
      if (!result.suggestions.length) continue

      const card = uncategorizedCards.find(c => c.card_name === result.cardName)
      if (!card) continue

      // Get best suggestion (first one, highest confidence)
      const best = result.suggestions[0]
      const secondaries = result.suggestions
        .slice(1, 3)
        .filter(s => s.confidence !== 'low')
        .map(s => s.category)

      try {
        const categories: StructuredCategories = {
          primary_category: best.category,
          additional_categories: secondaries,
        }

        const res = await fetch(`/api/decks/${deckId}/cards/${card.id}/categories`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(categories),
        })

        if (res.ok) {
          setApplied(prev => new Set([...prev, result.cardName]))
          successCount++
        } else {
          failCount++
        }
      } catch {
        failCount++
      }
    }

    queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) })
    setProcessing(false)

    if (successCount > 0) {
      toast.success(`Categorized ${successCount} card${successCount !== 1 ? 's' : ''}`)
    }
    if (failCount > 0) {
      toast.error(`Failed to categorize ${failCount} card${failCount !== 1 ? 's' : ''}`)
    }
  }

  // Hide button if no uncategorized cards
  if (uncategorizedCards.length === 0) {
    return null
  }

  const resultsWithSuggestions = results.filter(r => r.suggestions.length > 0 && !applied.has(r.cardName))
  const noSuggestionCount = results.filter(r => r.suggestions.length === 0).length

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="gap-1.5"
      >
        <Sparkles className="size-3.5" />
        Auto-Categorize ({uncategorizedCards.length})
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-amber-400" />
              Auto-Categorize Cards
            </DialogTitle>
            <DialogDescription>
              Found {uncategorizedCards.length} uncategorized card{uncategorizedCards.length !== 1 ? 's' : ''}.
              Suggestions based on Scryfall function tags.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto py-4">
            {processing && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="size-5 animate-spin mr-2" />
                <span>Fetching suggestions...</span>
              </div>
            )}

            {!processing && results.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No suggestions found. Cards may not have Scryfall tags.
              </div>
            )}

            {!processing && results.length > 0 && (
              <div className="space-y-3">
                {/* Summary */}
                {noSuggestionCount > 0 && (
                  <div className="text-[length:var(--fs-xs)] text-muted-foreground px-1 mb-2">
                    {noSuggestionCount} card{noSuggestionCount !== 1 ? 's' : ''} had no tag matches
                  </div>
                )}

                {/* Cards with suggestions */}
                {results.map((result) => {
                  if (result.suggestions.length === 0) return null
                  const isApplied = applied.has(result.cardName)

                  return (
                    <div
                      key={result.cardName}
                      className={cn(
                        'rounded-lg border p-3 transition-colors',
                        isApplied
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : 'border-[var(--border-default)] bg-[var(--bg-card)]'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {isApplied && <Check className="size-4 text-emerald-500 shrink-0" />}
                            <span className="font-medium text-[length:var(--fs-sm)] truncate">
                              {result.cardName}
                            </span>
                          </div>
                          {!isApplied && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {result.suggestions.slice(0, 4).map((suggestion, idx) => (
                                <button
                                  key={suggestion.category}
                                  type="button"
                                  onClick={() => handleApplySingle(result.cardName, suggestion)}
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium transition-colors hover:ring-1',
                                    idx === 0
                                      ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] hover:ring-[var(--accent-primary)]'
                                      : 'bg-white/5 text-muted-foreground hover:text-foreground hover:ring-white/20'
                                  )}
                                >
                                  {suggestion.category}
                                  <span className={cn(
                                    'text-[10px] opacity-70',
                                    suggestion.confidence === 'high' && 'text-emerald-400',
                                    suggestion.confidence === 'medium' && 'text-amber-400',
                                    suggestion.confidence === 'low' && 'text-muted-foreground'
                                  )}>
                                    {suggestion.confidence === 'high' ? '★' : suggestion.confidence === 'medium' ? '◆' : '○'}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Cards with no suggestions */}
                {noSuggestionCount > 0 && (
                  <details className="text-[length:var(--fs-xs)]">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground py-1">
                      Show {noSuggestionCount} card{noSuggestionCount !== 1 ? 's' : ''} without suggestions
                    </summary>
                    <ul className="mt-2 space-y-1 pl-4 text-muted-foreground">
                      {results.filter(r => r.suggestions.length === 0).map(r => (
                        <li key={r.cardName} className="truncate">{r.cardName}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Close
            </DialogClose>
            {resultsWithSuggestions.length > 0 && (
              <Button
                onClick={handleApplyAll}
                disabled={processing}
              >
                {processing ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    Applying...
                  </>
                ) : (
                  <>Apply All ({resultsWithSuggestions.length})</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// BulkActionsBar — actions for selected cards
// ---------------------------------------------------------------------------

interface BulkActionsBarProps {
  selectedIds: Set<number>
  deckId: number
  availableCategories: string[]
  onComplete: () => void
}

function BulkActionsBar({ selectedIds, deckId, availableCategories, onComplete }: BulkActionsBarProps) {
  const [moveCategoryOpen, setMoveCategoryOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [proxyConfirmOpen, setProxyConfirmOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  const cardIds = Array.from(selectedIds)

  const handleDelete = async () => {
    setProcessing(true)
    try {
      const res = await fetch(`/api/decks/${deckId}/cards/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'delete',
          cardIds,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete cards')
      }

      const data = await res.json()
      toast.success(`Removed ${data.affected} card${data.affected !== 1 ? 's' : ''}`)
      setDeleteConfirmOpen(false)
      onComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete cards')
    } finally {
      setProcessing(false)
    }
  }

  const handleMoveCategory = async () => {
    if (!selectedCategory) {
      toast.error('Please select a category')
      return
    }

    setProcessing(true)
    try {
      const res = await fetch(`/api/decks/${deckId}/cards/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'move-category',
          cardIds,
          payload: {
            primary_category: selectedCategory,
            additional_categories: [],
          },
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to move cards')
      }

      const data = await res.json()
      toast.success(`Moved ${data.affected} card${data.affected !== 1 ? 's' : ''} to ${selectedCategory}`)
      setMoveCategoryOpen(false)
      setSelectedCategory('')
      onComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to move cards')
    } finally {
      setProcessing(false)
    }
  }

  const handleAddProxy = async () => {
    setProcessing(true)
    try {
      const res = await fetch(`/api/decks/${deckId}/cards/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'add-proxy',
          cardIds,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add proxies')
      }

      const data = await res.json()
      if (data.affected === 0) {
        toast.info(data.message || 'No cards needed proxies')
      } else {
        toast.success(`Added proxies to ${data.affected} card${data.affected !== 1 ? 's' : ''}`)
      }
      setProxyConfirmOpen(false)
      onComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add proxies')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Move to Category */}
        <Button
          variant="outline"
          size="xs"
          onClick={() => setMoveCategoryOpen(true)}
          className="text-[length:var(--fs-xs)] gap-1"
        >
          <Tags className="size-3" />
          Move to Category
        </Button>

        {/* Add Proxy */}
        <Button
          variant="outline"
          size="xs"
          onClick={() => setProxyConfirmOpen(true)}
          className="text-[length:var(--fs-xs)] gap-1"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '12px' }} aria-hidden="true">
            content_copy
          </span>
          Add Proxy
        </Button>

        {/* Remove */}
        <Button
          variant="outline"
          size="xs"
          onClick={() => setDeleteConfirmOpen(true)}
          className="text-[length:var(--fs-xs)] gap-1 text-red-400 hover:text-red-300 hover:border-red-400/50"
        >
          <Trash2 className="size-3" />
          Remove
        </Button>
      </div>

      {/* Move to Category Dialog */}
      <Dialog open={moveCategoryOpen} onOpenChange={setMoveCategoryOpen}>
        <DialogContent className="sm:max-w-[400px]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Move to Category</DialogTitle>
            <DialogDescription>
              Move {selectedIds.size} selected card{selectedIds.size !== 1 ? 's' : ''} to a category.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full h-9 rounded-lg border px-3 text-[length:var(--fs-sm)]"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-emphasis)',
              }}
            >
              <option value="">Select a category…</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button onClick={handleMoveCategory} disabled={processing || !selectedCategory}>
              {processing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Moving...
                </>
              ) : (
                'Move Cards'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove cards?</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {selectedIds.size} card{selectedIds.size !== 1 ? 's' : ''} from this deck?
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Removing...
                </>
              ) : (
                `Remove ${selectedIds.size} Card${selectedIds.size !== 1 ? 's' : ''}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Proxy Confirmation Dialog */}
      <Dialog open={proxyConfirmOpen} onOpenChange={setProxyConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Add Proxy Copies</DialogTitle>
            <DialogDescription>
              Add proxy copies to {selectedIds.size} selected card{selectedIds.size !== 1 ? 's' : ''}.
              This will only affect cards that don&apos;t already have a copy assigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button onClick={handleAddProxy} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Adding...
                </>
              ) : (
                'Add Proxies'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
