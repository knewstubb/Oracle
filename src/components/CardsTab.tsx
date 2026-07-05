'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, List, LayoutGrid, ChevronDown, ChevronRight, AlertTriangle, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { OwnershipBadge } from '@/components/OwnershipBadge'
import { CardImage } from '@/components/CardImage'
import { CategoryTagEditor } from '@/components/CategoryTagEditor'
import { cn } from '@/lib/utils'
import { parseCategoriesCapped } from '@/lib/categoryUtils'
import { categoryPrimaryColour, categorySecondaryColour, categoryInitial } from '@/lib/categoryColour'
import type { StructuredCategories } from '@/lib/categoryUtils'
import { useDeckCategories } from '@/hooks/useDeckCategories'
import type { DeckCard } from '@/components/CardGrid'
import { createPortal } from 'react-dom'

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'grid'
type OwnershipFilter = 'all' | 'original' | 'proxy' | 'not_owned'
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOwnershipStatus(card: DeckCard): 'original' | 'proxy' | 'not_owned' {
  if (card.allocation_role === 'proxy') return 'proxy'
  if (card.allocation_role === 'not_owned') return 'not_owned'
  return 'original'
}

function getLocalStorageKey(deckId: number): string {
  return `cards-tab-view-mode-${deckId}`
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
      case 'cmc': {
        // CMC isn't on DeckCard type directly — sort alphabetically as fallback
        // This will be enhanced when CMC data is available
        return a.card_name.localeCompare(b.card_name)
      }
      default:
        return 0
    }
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CardsTab({ cards, deckId, healthCategories, scrollToCategory }: CardsTabProps) {
  // ── Derived Data ─────────────────────────────────────────────────────────────

  const availableCategories = useDeckCategories(cards)

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
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['decks', deckId] })

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['decks', deckId])

      // Optimistic update: patch the card's categories in the cached deck data
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
      // Roll back to the previous value on error
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
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [proxiesOnly, setProxiesOnly] = useState(false)

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

  // ── Ownership Counts ─────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    let originals = 0
    let proxies = 0
    let notOwned = 0

    for (const card of activeCards) {
      const qty = card.quantity || 1
      const status = getOwnershipStatus(card)
      if (status === 'original') originals += qty
      else if (status === 'proxy') proxies += qty
      else notOwned += qty
    }

    return { total: originals + proxies + notOwned, originals, proxies, notOwned }
  }, [activeCards])

  // ── Filtered & Sorted Cards ──────────────────────────────────────────────────

  const filteredCards = useMemo(() => {
    let result = activeCards

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((c) => c.card_name.toLowerCase().includes(query))
    }

    // Ownership filter
    if (ownershipFilter !== 'all') {
      result = result.filter((c) => getOwnershipStatus(c) === ownershipFilter)
    }

    // Proxies only chip
    if (proxiesOnly) {
      result = result.filter((c) => getOwnershipStatus(c) === 'proxy')
    }

    // Sort
    result = sortCards(result, sortBy)

    return result
  }, [activeCards, searchQuery, ownershipFilter, proxiesOnly, sortBy])

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

          {/* Proxies only chip */}
          <button
            type="button"
            onClick={() => setProxiesOnly(!proxiesOnly)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              proxiesOnly
                ? 'text-white'
                : 'text-muted-foreground hover:text-foreground'
            )}
            style={{
              backgroundColor: proxiesOnly ? 'var(--color-teal)' : 'var(--bg-card)',
              border: `1px solid ${proxiesOnly ? 'var(--color-teal)' : 'var(--border-emphasis)'}`,
            }}
            aria-pressed={proxiesOnly}
          >
            Proxies only
          </button>

          {/* Sort chip */}
          <button
            type="button"
            onClick={cycleSortBy}
            className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
                backgroundColor: viewMode === 'list' ? 'var(--color-teal)' : 'transparent',
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
                backgroundColor: viewMode === 'grid' ? 'var(--color-teal)' : 'transparent',
              }}
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Ownership Filter Chips ───────────────────────────────────── */}
      <div className="shrink-0 border-b px-4 py-2" style={{ borderColor: 'var(--border-default)' }}>
        <div className="mx-auto flex max-w-[1080px] items-center gap-2">
          <OwnershipChip
            label={`All — ${counts.total}`}
            symbol=""
            isActive={ownershipFilter === 'all'}
            onClick={() => setOwnershipFilter('all')}
          />
          <OwnershipChip
            label={`Originals — ${counts.originals}`}
            symbol="●"
            isActive={ownershipFilter === 'original'}
            onClick={() => setOwnershipFilter('original')}
          />
          <OwnershipChip
            label={`Proxies — ${counts.proxies}`}
            symbol="◐"
            isActive={ownershipFilter === 'proxy'}
            onClick={() => setOwnershipFilter('proxy')}
          />
          <OwnershipChip
            label={`Not owned — ${counts.notOwned}`}
            symbol="○"
            isActive={ownershipFilter === 'not_owned'}
            onClick={() => setOwnershipFilter('not_owned')}
          />
        </div>
      </div>

      {/* ─── View Content Area ─────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-[1080px]">
          {filteredCards.length === 0 ? (
            <div
              className="flex min-h-[200px] items-center justify-center rounded-lg text-sm text-muted-foreground"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
            >
              <p>No cards match the current filters.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <GridView cards={filteredCards} />
          ) : (
            <CategoryListView
              cards={filteredCards}
              healthCategories={healthCategories}
              availableCategories={availableCategories}
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
        <div className="mx-auto flex max-w-[1080px] items-center gap-6 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span style={{ color: 'var(--color-teal)' }} aria-hidden="true">●</span>
            <span>{counts.originals} originals</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span style={{ color: 'var(--color-amber)' }} aria-hidden="true">◐</span>
            <span>{counts.proxies} proxies</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span style={{ color: 'rgba(255,255,255,0.5)' }} aria-hidden="true">○</span>
            <span>{counts.notOwned} not owned</span>
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

/** Groups cards by primary category and returns sorted entries */
function groupByCategory(cards: DeckCard[]): [string, DeckCard[]][] {
  const groups: Record<string, DeckCard[]> = {}
  for (const card of cards) {
    const category = parseCategoriesCapped(card.categories).primary_category
    if (!groups[category]) groups[category] = []
    groups[category].push(card)
  }
  // Sort categories alphabetically, but keep "Other" last
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === 'Other') return 1
    if (b === 'Other') return -1
    return a.localeCompare(b)
  })
}

/** List view: cards grouped by category with collapsible sections */
function CategoryListView({
  cards,
  healthCategories,
  availableCategories,
  onCategoryChange,
}: {
  cards: DeckCard[]
  healthCategories?: CardsTabProps['healthCategories']
  availableCategories: string[]
  onCategoryChange: (cardId: number, categories: StructuredCategories) => void
}) {
  const groups = useMemo(() => groupByCategory(cards), [cards])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleCategory = useCallback((category: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }, [])

  return (
    <div className="space-y-1">
      {groups.map(([category, categoryCards]) => {
        const isCollapsed = collapsed.has(category)
        const count = categoryCards.reduce((sum, c) => sum + (c.quantity || 1), 0)

        // Find matching health category
        const health = healthCategories?.find(
          (h) => h.category.toLowerCase() === category.toLowerCase()
        )
        const hasViolation = health && health.status !== 'ok'
        const target = health ? health.max : undefined

        return (
          <section
            key={category}
            id={`category-${category.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {/* Category Header */}
            <button
              type="button"
              onClick={() => toggleCategory(category)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
              aria-expanded={!isCollapsed}
              aria-controls={`category-content-${category.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {/* Category name */}
              <span
                className="text-[11px] font-medium uppercase tracking-wide"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                {category}
              </span>

              {/* Count */}
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
                      backgroundColor: 'var(--color-teal)',
                      width: `${Math.min(100, (count / target) * 100)}%`,
                    }}
                  />
                </div>
              )}

              {/* Health warning icon — only if violated */}
              {hasViolation && (
                <AlertTriangle
                  className="size-3 shrink-0"
                  style={{ color: 'var(--color-amber)' }}
                  aria-label={`${category} health warning`}
                />
              )}

              {/* Spacer to push chevron right */}
              <span className="flex-1" />

              {/* Chevron */}
              {isCollapsed ? (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              ) : (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
            </button>

            {/* Card rows */}
            {!isCollapsed && (
              <div
                id={`category-content-${category.toLowerCase().replace(/\s+/g, '-')}`}
                role="list"
                aria-label={`${category} cards`}
                className="mb-2"
              >
                {categoryCards.map((card) => (
                  <CardRow key={card.id} card={card} availableCategories={availableCategories} onCategoryChange={onCategoryChange} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** Single card row within a category section */
function CardRow({ card, availableCategories, onCategoryChange }: { card: DeckCard; availableCategories: string[]; onCategoryChange: (cardId: number, categories: StructuredCategories) => void }) {
  const ownership = getOwnershipStatus(card)
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
      style={{ borderLeft: `3px solid ${categoryPrimaryColour(parsed.primary_category)}`, minHeight: 36 }}
    >
      {/* Card name with hover preview */}
      <span
        className="min-w-0 flex-1 truncate text-xs cursor-default"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {card.card_name}
        {showPreview && card.scryfall_id && (
          <CardHoverPreview
            scryfallId={card.scryfall_id}
            cardName={card.card_name}
            x={previewPos.x}
            y={previewPos.y}
          />
        )}
      </span>

      {/* Secondary category letter badges */}
      {parsed.additional_categories.length > 0 ? (
        <span className="flex items-center gap-0.5 shrink-0">
          {parsed.additional_categories.map(cat => (
            <span
              key={cat}
              className="inline-flex items-center justify-center w-2 h-2 rounded-full text-[5px] font-bold text-white leading-none"
              style={{ backgroundColor: categorySecondaryColour(cat) }}
              title={cat}
              aria-label={`Secondary category: ${cat}`}
            >
              {categoryInitial(cat)}
            </span>
          ))}
        </span>
      ) : (
        <span className="shrink-0 w-5" aria-hidden="true" />
      )}

      {/* Type — muted 10px (using categories as a proxy for type info) */}
      <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
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

      {/* Ownership badge */}
      <OwnershipBadge
        status={ownership}
        holderDeckName={undefined}
      />
    </div>
  )
}

/** Corner dot indicator for ownership status in grid view */
function OwnershipDot({ status }: { status: 'original' | 'proxy' | 'not_owned' }) {
  const label =
    status === 'original' ? 'Original' : status === 'proxy' ? 'Proxy' : 'Not owned'

  return (
    <span
      className="absolute right-2 top-2 z-10 block size-3.5 rounded-full"
      style={{
        backgroundColor:
          status === 'original'
            ? 'var(--color-teal)'
            : status === 'proxy'
              ? 'var(--color-amber)'
              : 'transparent',
        border:
          status === 'not_owned' ? '2px solid rgba(255,255,255,0.5)' : 'none',
        boxShadow: status !== 'not_owned' ? '0 1px 3px rgba(0,0,0,0.5)' : 'none',
      }}
      aria-label={label}
      role="img"
    />
  )
}

/** Grid view: 5-column grid grouped by category */
function GridView({ cards }: { cards: DeckCard[] }) {
  const groups = useMemo(() => groupByCategory(cards), [cards])

  return (
    <div className="space-y-6">
      {groups.map(([category, categoryCards]) => (
        <section
          key={category}
          id={`category-${category.toLowerCase().replace(/\s+/g, '-')}`}
          aria-label={category}
        >
          <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
            {category} ({categoryCards.reduce((sum, c) => sum + (c.quantity || 1), 0)})
          </h4>
          <div className="grid grid-cols-4 gap-3" role="list" aria-label={`${category} cards`}>
            {categoryCards.map((card) => {
              const ownership = getOwnershipStatus(card)
              const ownershipLabel =
                ownership === 'original'
                  ? 'Original'
                  : ownership === 'proxy'
                    ? 'Proxy'
                    : 'Not owned'

              return (
                <div
                  key={card.id}
                  role="listitem"
                  className="group/tile relative aspect-[5/7] overflow-hidden rounded-lg"
                  style={{ border: '1px solid var(--border-default)' }}
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
                      className="absolute inset-0 flex items-center justify-center bg-muted text-xs text-muted-foreground"
                      role="img"
                      aria-label={card.card_name}
                    >
                      {card.card_name}
                    </div>
                  )}

                  {/* Corner dot indicator */}
                  <OwnershipDot status={ownership} />

                  {/* Hover overlay */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center opacity-0 transition-opacity group-hover/tile:opacity-100"
                    style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                    aria-hidden="true"
                  >
                    <span className="px-2 text-center text-xs font-medium text-white">
                      {card.card_name}
                    </span>
                    <span className="mt-1 text-[10px] text-white/70">
                      {ownershipLabel}
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

interface OwnershipChipProps {
  label: string
  symbol: string
  isActive: boolean
  onClick: () => void
}

function OwnershipChip({ label, symbol, isActive, onClick }: OwnershipChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors'
      )}
      style={{
        backgroundColor: isActive ? 'var(--color-teal-bg)' : 'var(--bg-card)',
        color: isActive ? 'var(--color-teal)' : 'rgba(255,255,255,0.6)',
        border: `1px solid ${isActive ? 'var(--color-teal)' : 'var(--border-emphasis)'}`,
      }}
      aria-pressed={isActive}
    >
      {symbol && <span aria-hidden="true">{symbol}</span>}
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Card Hover Preview — shows Scryfall image on hover via portal
// ---------------------------------------------------------------------------

function CardHoverPreview({
  scryfallId,
  cardName,
  x,
  y,
}: {
  scryfallId: string
  cardName: string
  x: number
  y: number
}) {
  const a = scryfallId.charAt(0)
  const b = scryfallId.charAt(1)
  const url = `https://cards.scryfall.io/normal/front/${a}/${b}/${scryfallId}.jpg`

  // Position above the cursor, centred horizontally
  const style: React.CSSProperties = {
    position: 'fixed',
    left: `${x}px`,
    top: `${y - 8}px`,
    transform: 'translate(-50%, -100%)',
    zIndex: 9999,
    pointerEvents: 'none',
  }

  return createPortal(
    <div style={style}>
      <img
        src={url}
        alt={cardName}
        width={200}
        height={280}
        className="rounded-lg shadow-2xl shadow-black/50"
        style={{ display: 'block' }}
      />
    </div>,
    document.body
  )
}
