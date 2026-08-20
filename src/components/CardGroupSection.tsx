'use client'

/**
 * CardGroupSection — Unified grouped card list used by both the List view
 * (single column) and Groups view (3-column masonry). One component, one
 * set of row behaviors, two layout modes.
 *
 * Features combined from both previous implementations:
 * - Collapsible sections (from List view)
 * - Header with separator line and section title (from Groups view)
 * - Card count/quantity on left (from Groups view)
 * - Hover card preview (from List view CardRow)
 * - Kebab menu with Remove (from List view CardRow)
 * - Status chip popover (both)
 * - Category tag editor (from List view)
 * - Basic land grouping (from List view)
 * - Health bar indicators (from List view)
 */

import { useState, useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Tags, MoreVertical, Trash2, GripVertical, Sparkles, Check, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CardHoverPreview, useCardHoverPreview } from '@/components/CardHoverPreview'
import { PrintingPicker } from '@/components/PrintingPicker'
import { StatusChipPopover } from '@/components/StatusChipPopover'
import { CardSlotBadge } from '@/components/CardSlotBadge'
import { CategoryTagEditor } from '@/components/CategoryTagEditor'
import { parseCategoriesCapped } from '@/lib/categoryUtils'
import { deckKeys, createDeckInvalidators } from '@/hooks/useDeckQueryKeys'
import type { StructuredCategories } from '@/lib/categoryUtils'
import type { DeckCard } from '@/components/CardGrid'
import type { CardSlotStatus } from '@/lib/card-status'
import { isBasicLand } from '@/lib/basic-lands'
import { ManaCost } from '@/components/ManaCost'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthCategory {
  category: string
  status: string
  actual: number
  min: number
  max: number
}

export interface CardGroupSectionProps {
  groupName: string
  groupCards: DeckCard[]
  statusMap: Map<number, CardSlotStatus>
  deckId: number
  physicalCopyMap: Map<number, number | null>
  /** Available categories for the tag editor */
  availableCategories?: string[]
  /** Health category data for fill-bar indicators */
  health?: HealthCategory
  /** Callback for category changes */
  onCategoryChange?: (cardId: number, categories: StructuredCategories) => void
  /** Whether the section starts collapsed */
  defaultCollapsed?: boolean
  /** Compact mode hides set name, price, and category editor (used in groups/masonry view) */
  compact?: boolean
  /** Maximum copies per card allowed by the format (null = no limit, 1 = singleton). Defaults to 1. */
  maxCopies?: number | null
  /** Selected card IDs for bulk operations */
  selectedIds?: Set<number>
  /** Callback when card selection changes */
  onSelectionChange?: (cardId: number, selected: boolean) => void
}

// ---------------------------------------------------------------------------
// CardGroupSection
// ---------------------------------------------------------------------------

export function CardGroupSection({
  groupName,
  groupCards,
  statusMap,
  deckId,
  physicalCopyMap,
  availableCategories = [],
  health,
  onCategoryChange,
  defaultCollapsed = false,
  compact = false,
  maxCopies = 1,
  selectedIds,
  onSelectionChange,
}: CardGroupSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const count = groupCards.reduce((sum, c) => sum + (c.quantity || 1), 0)

  const hasViolation = health && health.status !== 'ok'
  const target = health ? health.max : undefined

  // Separate generic lands and group same-printing lands, other cards render individually
  const normalCards: DeckCard[] = []
  const genericLandCounts = new Map<string, { count: number; cards: DeckCard[] }>()
  // Group specific-printing basic lands by scryfall_id (same printing = one row with qty)
  const specificLandGroups = new Map<string, { count: number; cards: DeckCard[]; card: DeckCard }>()

  for (const card of groupCards) {
    const cardStatus = statusMap.get(card.id)
    if (isBasicLand(card.card_name) && cardStatus === 'generic_land') {
      // Generic land — group by name
      const existing = genericLandCounts.get(card.card_name) ?? { count: 0, cards: [] }
      existing.count += card.quantity || 1
      existing.cards.push(card)
      genericLandCounts.set(card.card_name, existing)
    } else if (isBasicLand(card.card_name) && card.scryfall_id) {
      // Specific-printing land — group by scryfall_id
      const key = card.scryfall_id
      const existing = specificLandGroups.get(key) ?? { count: 0, cards: [], card }
      existing.count += card.quantity || 1
      existing.cards.push(card)
      specificLandGroups.set(key, existing)
    } else {
      // Normal card — render individually
      normalCards.push(card)
    }
  }

  // Determine if this is a land group with specific-printing lands (for bulk generic button)
  const hasSpecificLands = specificLandGroups.size > 0
  const isLandGroup = groupName.toLowerCase() === 'land' || groupName.toLowerCase() === 'lands'

  return (
    <section
      id={`category-${groupName.toLowerCase().replace(/\s+/g, '-')}`}
      className="rounded-lg border border-white/[0.08]"
      style={{ backgroundColor: 'rgba(26,26,30,0.5)' }}
    >
      {/* Section header — clickable to collapse */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 border-b px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
        style={{ borderColor: collapsed ? 'transparent' : 'var(--border-default)' }}
        aria-expanded={!collapsed}
        aria-controls={`category-content-${groupName.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <span className="text-[length:var(--fs-sm)] font-medium uppercase tracking-wide text-muted-foreground">
          {groupName} ({count})
        </span>

        <span className="flex-1" />

        {/* Bulk "Make all generic" — only in land groups with specific-printing lands */}
        {isLandGroup && hasSpecificLands && !collapsed && (
          <MakeAllGenericButton deckId={deckId} specificLandGroups={specificLandGroups} />
        )}

        {collapsed ? (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {/* Card rows */}
      {!collapsed && (
        <div
          id={`category-content-${groupName.toLowerCase().replace(/\s+/g, '-')}`}
          role="list"
          aria-label={`${groupName} cards`}
          className="flex flex-col py-1"
        >
          {/* Generic land rows */}
          {Array.from(genericLandCounts.entries()).map(([landName, { count, cards: landCards }]) => (
            <GenericLandRow
              key={`generic-${landName}`}
              landName={landName}
              count={count}
              deckId={deckId}
              cardIds={landCards.map(c => c.id)}
              selectedIds={selectedIds}
              onSelectionChange={onSelectionChange}
            />
          ))}

          {/* Specific-printing land rows (grouped by printing) */}
          {Array.from(specificLandGroups.entries()).map(([scryfallId, { count, cards: landCards, card }]) => {
            const displayName = card.set_code
              ? `${card.card_name} (${card.set_code.toUpperCase()})`
              : card.card_name
            const status = (statusMap.get(card.id) === 'generic_land' ? 'original' : statusMap.get(card.id)) ?? 'available'
            return (
              <SpecificLandRow
                key={`land-${scryfallId}`}
                displayName={displayName}
                count={count}
                status={status}
                deckId={deckId}
                cardIds={landCards.map(c => c.id)}
                scryfallId={card.scryfall_id ?? null}
                selectedIds={selectedIds}
                onSelectionChange={onSelectionChange}
              />
            )
          })}

          {/* Normal card rows */}
          {normalCards.map((card) => (
            <UnifiedCardRow
              key={card.id}
              card={card}
              status={(statusMap.get(card.id) === 'generic_land' ? 'original' : statusMap.get(card.id)) ?? 'available'}
              deckId={deckId}
              physicalCopyId={physicalCopyMap.get(card.id) ?? null}
              availableCategories={availableCategories}
              onCategoryChange={onCategoryChange}
              compact={compact}
              maxCopies={maxCopies}
              isSelected={selectedIds?.has(card.id) ?? false}
              onSelectionChange={onSelectionChange}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// UnifiedCardRow — quantity + name (hover preview) + category + status + kebab
// ---------------------------------------------------------------------------

function UnifiedCardRow({
  card,
  status,
  deckId,
  physicalCopyId,
  availableCategories,
  onCategoryChange,
  compact = false,
  maxCopies = 1,
  isSelected = false,
  onSelectionChange,
}: {
  card: DeckCard
  status: CardSlotStatus
  deckId: number
  physicalCopyId: number | null
  availableCategories: string[]
  onCategoryChange?: (cardId: number, categories: StructuredCategories) => void
  compact?: boolean
  maxCopies?: number | null
  isSelected?: boolean
  onSelectionChange?: (cardId: number, selected: boolean) => void
}) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const queryClient = useQueryClient()

  const { triggerProps, previewProps } = useCardHoverPreview({
    scryfallId: card.scryfall_id,
    cardName: card.card_name,
  })

  const parsed = parseCategoriesCapped(card.categories)

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
    queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
    queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'card-statuses'] })
    queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
    queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'health'] })
    queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'health'] })
    queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
    queryClient.invalidateQueries({ queryKey: ['picklist', String(deckId)] })
  }, [queryClient, deckId])

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/cards/${card.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      return res.json()
    },
    onSuccess: () => {
      invalidateAll()
      toast.success(`Removed ${card.card_name}`)
      setDeleteDialogOpen(false)
    },
    onError: () => toast.error('Failed to remove card'),
  })

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenuPos({ x: e.clientX, y: e.clientY })
  }

  const handleDeleteClick = () => {
    setContextMenuPos(null)
    setDeleteDialogOpen(true)
  }

  return (
    <>
      <div
        role="listitem"
        className="group flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-white/[0.03] border-b border-[rgba(255,255,255,0.04)] last:border-b-0"
        onContextMenu={handleContextMenu}
    >
      {/* Drag handle — visible on hover */}
      <GripVertical className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-40 transition-opacity cursor-grab" aria-hidden="true" />

      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => onSelectionChange?.(card.id, e.target.checked)}
        className="size-3.5 shrink-0 rounded border-[rgba(255,255,255,0.1)] bg-transparent opacity-30 checked:opacity-100 hover:opacity-60 transition-opacity accent-[var(--accent-primary)]"
        aria-label={`Select ${card.card_name}`}
      />

      {/* Quantity */}
      <span className="w-4 shrink-0 text-right text-[length:var(--fs-xs)] text-muted-foreground">
        {card.quantity || 1}
      </span>

      {/* Card name with hover preview */}
      <span
        className="min-w-0 flex-1 truncate text-[length:var(--fs-sm)] cursor-default"
        {...triggerProps}
      >
        {card.card_name}
        <CardHoverPreview {...previewProps} />
      </span>

      {/* Synergy score badge — only shown when deck has a build set */}
      {card.synergy_score != null && (
        <span
          className={`shrink-0 text-[length:var(--fs-xs)] font-medium tabular-nums ${
            card.synergy_score > 0
              ? 'text-emerald-500'
              : card.synergy_score < 0
              ? 'text-red-400'
              : 'text-muted-foreground'
          }`}
          title={`EDHREC synergy score: ${card.synergy_score > 0 ? '+' : ''}${card.synergy_score}%`}
        >
          {card.synergy_score > 0 ? '+' : ''}{card.synergy_score}%
        </span>
      )}

      {/* Set icon (with rarity colour) + set name */}
      {!compact && (
        <span className="hidden md:inline-flex shrink-0 items-center gap-1 text-[length:var(--fs-xs)] text-muted-foreground" style={{ width: 160 }}>
          {card.set_code && (
            <>
              <i className={`ss ss-${card.set_code.toLowerCase()} ss-fw ss-${card.rarity || 'common'} ss-grad`} style={{ fontSize: '14px' }} aria-hidden="true" />
              <span className="truncate">{card.edition_name || card.set_code.toUpperCase()}</span>
            </>
          )}
        </span>
      )}

      {/* Mana cost pips — fixed-width column, right-aligned */}
      <span className="shrink-0 flex justify-end" style={{ width: 80 }}>
        <ManaCost cost={card.mana_cost} />
      </span>

      {/* Gap between pips and price */}
      <span className="shrink-0 w-3" aria-hidden="true" />

      {/* Price — compact mode shows smaller, non-compact shows wider on desktop */}
      {compact ? (
        <span className="shrink-0 text-[length:var(--fs-xs)] tabular-nums text-muted-foreground" style={{ minWidth: 36, textAlign: 'right' }}>
          {card.price_usd != null ? `$${card.price_usd < 10 ? card.price_usd.toFixed(2) : Math.round(card.price_usd)}` : ''}
        </span>
      ) : (
        <span className="hidden md:inline shrink-0 text-[length:var(--fs-xs)] tabular-nums text-muted-foreground" style={{ width: 56, textAlign: 'right' }}>
          {card.price_usd != null ? `$${card.price_usd.toFixed(2)}` : '—'}
        </span>
      )}

      {/* Interactive status chip — after price */}
      <StatusChipPopover
        status={status}
        cardName={card.card_name}
        deckId={deckId}
        deckCardsId={card.id}
        physicalCopyId={physicalCopyId}
        scryfallId={card.scryfall_id ?? null}
        variant={compact ? 'icon' : 'icon'}
        className="shrink-0"
      />

      {/* Category edit trigger — hidden in compact mode */}
      {!compact && onCategoryChange && (
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
      )}

      {/* Kebab menu — Remove */}
      <CardRowKebab
        deckCardsId={card.id}
        deckId={deckId}
        cardName={card.card_name}
        quantity={card.quantity || 1}
        maxCopies={maxCopies}
        currentCategories={card.categories}
        onCategoryChange={onCategoryChange}
      />

      {/* Right-click context menu */}
      {contextMenuPos && (
        <div
          className="fixed z-50 min-w-[140px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-1 shadow-lg"
          style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
          onMouseLeave={() => setContextMenuPos(null)}
        >
          <button
            type="button"
            onClick={handleDeleteClick}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[length:var(--fs-xs)] transition-colors hover:bg-[rgba(226,75,74,0.1)]"
            style={{ color: 'rgba(226,75,74,0.9)' }}
          >
            <Trash2 className="size-3" />
            Remove from deck
          </button>
        </div>
      )}
    </div>

    {/* Delete confirmation dialog */}
    <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <DialogContent className="sm:max-w-[400px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Remove card?</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove <strong>{card.card_name}</strong> from this deck?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Removing...' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// GenericLandRow — simple row for generic (untracked) basic lands
// ---------------------------------------------------------------------------

function GenericLandRow({ landName, count, deckId, cardIds, selectedIds, onSelectionChange }: { 
  landName: string
  count: number
  deckId: number
  cardIds: number[]
  selectedIds?: Set<number>
  onSelectionChange?: (cardId: number, selected: boolean) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [optimisticCount, setOptimisticCount] = useState(count)
  const queryClient = useQueryClient()
  const { invalidateDeck } = createDeckInvalidators(queryClient)

  // Check if all cards in this group are selected
  const allSelected = cardIds.length > 0 && cardIds.every(id => selectedIds?.has(id))
  const someSelected = cardIds.some(id => selectedIds?.has(id))

  const handleSelectAll = (checked: boolean) => {
    cardIds.forEach(id => onSelectionChange?.(id, checked))
  }

  const handleAdd = () => {
    setOptimisticCount(c => c + 1)
    fetch(`/api/decks/${deckId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardName: landName }),
    }).then(res => {
      if (!res.ok) { setOptimisticCount(c => c - 1); toast.error('Failed to add') }
      invalidateDeck(deckId)
    }).catch(() => setOptimisticCount(c => c - 1))
  }

  const handleRemove = () => {
    if (optimisticCount <= 0) return
    setOptimisticCount(c => c - 1)
    const idToRemove = cardIds[cardIds.length - 1]
    if (!idToRemove) return
    fetch(`/api/decks/${deckId}/cards/${idToRemove}`, { method: 'DELETE' })
      .then(res => {
        if (!res.ok) { setOptimisticCount(c => c + 1); toast.error('Failed to remove') }
        invalidateDeck(deckId)
      }).catch(() => setOptimisticCount(c => c + 1))
  }

  const handleRemoveAll = () => {
    const prev = optimisticCount
    setOptimisticCount(0)
    Promise.all(cardIds.map(id => fetch(`/api/decks/${deckId}/cards/${id}`, { method: 'DELETE' })))
      .then(() => {
        toast.success(`Removed all ${landName}`)
        invalidateAll()
      })
      .catch(() => setOptimisticCount(prev))
    setMenuOpen(false)
  }

  return (
    <div role="listitem" className="border-b border-[rgba(255,255,255,0.04)] last:border-b-0">
      <div className="group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-white/[0.03]">
        {/* Drag handle */}
        <GripVertical className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-40 transition-opacity cursor-grab" aria-hidden="true" />

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
          onChange={(e) => handleSelectAll(e.target.checked)}
          className="size-3.5 shrink-0 rounded border-[rgba(255,255,255,0.1)] bg-transparent opacity-30 checked:opacity-100 hover:opacity-60 transition-opacity accent-[var(--accent-primary)]"
          aria-label={`Select ${landName}`}
        />

        {/* Quantity */}
        <span className="w-4 shrink-0 text-right text-[length:var(--fs-xs)] text-muted-foreground">
          {optimisticCount}
        </span>

        {/* Land name */}
        <span className="min-w-0 flex-1 truncate text-[length:var(--fs-sm)]">
          {landName}
        </span>

        {/* Original badge */}
        <span
          className="inline-flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium"
          style={{ color: 'var(--signal-success)', backgroundColor: 'rgba(29, 158, 117, 0.12)' }}
        >
          <span
            className="material-symbols-outlined inline-flex items-center justify-center"
            style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1, 'wght' 400, 'opsz' 20", color: 'var(--signal-success)' }}
            aria-hidden="true"
          >circle</span>
          Original
        </span>

        {/* Kebab menu with quantity picker */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded p-1 text-[var(--text-tertiary)] opacity-0 transition-all group-hover:opacity-100 hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-secondary)]"
            aria-label="More actions"
          >
            <MoreVertical className="size-3.5" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-7 z-20 min-w-[140px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-2 px-3 shadow-lg"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[length:var(--fs-xs)] text-muted-foreground">Qty:</span>
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={optimisticCount <= 0}
                  className="flex size-6 items-center justify-center rounded border border-[var(--border-default)] text-[length:var(--fs-sm)] text-foreground hover:bg-white/[0.05] disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-6 text-center text-[length:var(--fs-sm)] text-foreground tabular-nums">{optimisticCount}</span>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={false}
                  className="flex size-6 items-center justify-center rounded border border-[var(--border-default)] text-[length:var(--fs-sm)] text-foreground hover:bg-white/[0.05] disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={handleRemoveAll}
                disabled={false}
                className="flex w-full items-center gap-2 rounded px-1 py-1 text-[length:var(--fs-xs)] transition-colors hover:bg-[rgba(226,75,74,0.1)] disabled:opacity-40"
                style={{ color: 'rgba(226,75,74,0.8)' }}
              >
                <Trash2 className="size-3" />
                Remove all
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CardRowKebab — hover-revealed menu with Remove action
// ---------------------------------------------------------------------------

interface CardRowKebabProps {
  deckCardsId: number
  deckId: number
  cardName: string
  quantity?: number
  maxCopies?: number | null
  /** Current categories (JSON string from DeckCard) for pre-populating suggestions */
  currentCategories?: string
  /** Callback when categories are updated via suggestion */
  onCategoryChange?: (cardId: number, categories: StructuredCategories) => void
}

function CardRowKebab({
  deckCardsId,
  deckId,
  cardName,
  quantity = 1,
  maxCopies = 1,
  currentCategories,
  onCategoryChange,
}: CardRowKebabProps) {
  const [open, setOpen] = useState(false)
  const [printingPickerOpen, setPrintingPickerOpen] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [optimisticQty, setOptimisticQty] = useState(quantity)
  const queryClient = useQueryClient()
  const allowMultiple = maxCopies === null || maxCopies > 1

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
    queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
    queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'card-statuses'] })
    queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
    queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'health'] })
    queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'health'] })
    queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
    queryClient.invalidateQueries({ queryKey: ['picklist', String(deckId)] })
  }, [queryClient, deckId])

  const removeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/cards/${deckCardsId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Remove failed')
      return res.json()
    },
    onSuccess: () => {
      invalidateAll()
      toast.success(`Removed ${cardName}`)
    },
    onError: () => toast.error('Failed to remove card'),
  })

  const addCopyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardName }),
      })
      if (!res.ok) throw new Error('Failed to add copy')
      return res.json()
    },
    onSuccess: () => {
      invalidateAll()
      toast.success(`Added copy of ${cardName}`)
    },
    onError: () => {
      setOptimisticQty(q => q - 1)
      toast.error('Failed to add copy')
    },
  })

  const removeCopyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/cards/${deckCardsId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove copy')
      return res.json()
    },
    onSuccess: () => {
      invalidateAll()
    },
    onError: () => {
      setOptimisticQty(q => q + 1)
      toast.error('Failed to remove copy')
    },
  })

  const handleAddCopy = () => {
    if (maxCopies !== null && optimisticQty >= maxCopies) return
    setOptimisticQty(q => q + 1)
    addCopyMutation.mutate()
  }

  const handleRemoveCopy = () => {
    if (optimisticQty <= 1) return
    setOptimisticQty(q => q - 1)
    removeCopyMutation.mutate()
  }

  const handleSuggestCategory = () => {
    setOpen(false)
    setSuggestionsOpen(true)
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded p-1 text-[var(--text-tertiary)] opacity-0 transition-all group-hover:opacity-100 hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-secondary)]"
        aria-label="More actions"
        aria-expanded={open}
      >
        <MoreVertical className="size-3.5" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-7 z-20 min-w-[160px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {/* Qty adjuster — shown for non-singleton formats */}
          {allowMultiple && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border-subtle)]">
              <span className="text-[length:var(--fs-xs)] text-muted-foreground">Qty:</span>
              <button
                type="button"
                onClick={handleRemoveCopy}
                disabled={optimisticQty <= 1 || removeCopyMutation.isPending}
                className="flex size-6 items-center justify-center rounded border border-[var(--border-default)] text-[length:var(--fs-sm)] text-foreground hover:bg-white/[0.05] disabled:opacity-40"
              >
                −
              </button>
              <span className="w-6 text-center text-[length:var(--fs-sm)] text-foreground tabular-nums">{optimisticQty}</span>
              <button
                type="button"
                onClick={handleAddCopy}
                disabled={(maxCopies !== null && optimisticQty >= maxCopies) || addCopyMutation.isPending}
                className="flex size-6 items-center justify-center rounded border border-[var(--border-default)] text-[length:var(--fs-sm)] text-foreground hover:bg-white/[0.05] disabled:opacity-40"
              >
                +
              </button>
            </div>
          )}
          {/* Suggest Category — only show if callback provided */}
          {onCategoryChange && (
            <button
              type="button"
              onClick={handleSuggestCategory}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[length:var(--fs-xs)] text-foreground transition-colors hover:bg-white/[0.05]"
            >
              <Sparkles className="size-3" />
              Suggest category
            </button>
          )}
          <button
            type="button"
            onClick={() => { setPrintingPickerOpen(true); setOpen(false) }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[length:var(--fs-xs)] text-foreground transition-colors hover:bg-white/[0.05]"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden="true">swap_horiz</span>
            Change printing
          </button>
          <button
            type="button"
            onClick={() => { removeMutation.mutate(); setOpen(false) }}
            disabled={removeMutation.isPending}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[length:var(--fs-xs)] transition-colors hover:bg-[rgba(226,75,74,0.1)] disabled:opacity-40"
            style={{ color: 'rgba(226,75,74,0.8)' }}
          >
            <Trash2 className="size-3" />
            Remove{allowMultiple ? ' all' : ''}
          </button>
        </div>
      )}

      {/* Category Suggestions Dialog */}
      <CategorySuggestionsDialog
        open={suggestionsOpen}
        cardName={cardName}
        deckCardsId={deckCardsId}
        deckId={deckId}
        currentCategories={currentCategories}
        onApply={(categories) => {
          if (onCategoryChange) {
            onCategoryChange(deckCardsId, categories)
          }
          setSuggestionsOpen(false)
        }}
        onClose={() => setSuggestionsOpen(false)}
      />

      {/* Printing Picker Modal */}
      <PrintingPickerWithOwned
        open={printingPickerOpen}
        cardName={cardName}
        deckCardsId={deckCardsId}
        deckId={deckId}
        onSelect={async (printing) => {
          const res = await fetch('/api/cards/update-printing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              target: 'deck_card',
              targetId: deckCardsId,
              scryfallId: printing.scryfallId,
              setCode: printing.setCode,
              collectorNumber: printing.collectorNumber,
            }),
          })
          if (res.ok) {
            toast.success(`Changed to ${printing.setName} printing`)
            invalidateAll()
          } else {
            toast.error('Failed to change printing')
          }
          setPrintingPickerOpen(false)
        }}
        onClose={() => setPrintingPickerOpen(false)}
      />
    </div>
  )
}


// ---------------------------------------------------------------------------
// PrintingPickerWithOwned — wraps PrintingPicker with owned-printings query
// ---------------------------------------------------------------------------

function PrintingPickerWithOwned({
  open,
  cardName,
  deckCardsId,
  deckId,
  onSelect,
  onClose,
}: {
  open: boolean
  cardName: string
  deckCardsId: number
  deckId: number
  onSelect: (printing: { scryfallId: string; setCode: string; collectorNumber: string; setName: string }) => void
  onClose: () => void
}) {
  const { data: ownedData } = useQuery<{ printingIds: string[]; printings?: Array<{ scryfallPrintingId: string; location: string }> }>({
    queryKey: ['owned-printings', cardName],
    queryFn: () => fetch(`/api/cards/owned-printings?cardName=${encodeURIComponent(cardName)}`).then(r => r.json()),
    enabled: open,
    staleTime: 60 * 1000,
  })

  const ownedSet = useMemo(() => new Set(ownedData?.printingIds ?? []), [ownedData])
  const ownedLocations = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of ownedData?.printings ?? []) {
      map.set(p.scryfallPrintingId, p.location)
    }
    return map
  }, [ownedData])

  return (
    <PrintingPicker
      open={open}
      cardName={cardName}
      ownedPrintingIds={ownedSet}
      ownedLocations={ownedLocations}
      onSelect={onSelect}
      onClose={onClose}
    />
  )
}

// ---------------------------------------------------------------------------
// MakeAllGenericButton — bulk convert specific-printing lands to generic
// ---------------------------------------------------------------------------

function MakeAllGenericButton({
  deckId,
  specificLandGroups,
}: {
  deckId: number
  specificLandGroups: Map<string, { count: number; cards: DeckCard[]; card: DeckCard }>
}) {
  const [isPending, setIsPending] = useState(false)
  const queryClient = useQueryClient()

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent collapsing the section
    setIsPending(true)
    toast.loading('Converting all lands to generic...', { id: 'bulk-generic' })

    try {
      const allCardIds = Array.from(specificLandGroups.values()).flatMap(g => g.cards.map(c => c.id))
      await Promise.all(
        allCardIds.map(id =>
          fetch(`/api/decks/${deckId}/cards/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scryfall_id: null, set_code: null }),
          })
        )
      )
      toast.dismiss('bulk-generic')
      toast.success(`Converted ${allCardIds.length} lands to generic`)
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
      queryClient.invalidateQueries({ queryKey: ['picklist', String(deckId)] })
    } catch {
      toast.dismiss('bulk-generic')
      toast.error('Failed to convert some lands')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="shrink-0 rounded px-2 py-0.5 text-[length:var(--fs-xs)] font-medium text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-40"
      aria-label="Convert all specific-printing lands to generic"
    >
      {isPending ? 'Converting...' : 'Make all generic'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// SpecificLandRow — grouped row for same-printing basic lands with status + qty
// ---------------------------------------------------------------------------

function SpecificLandRow({
  displayName,
  count,
  status,
  deckId,
  cardIds,
  scryfallId,
  selectedIds,
  onSelectionChange,
}: {
  displayName: string
  count: number
  status: CardSlotStatus
  deckId: number
  cardIds: number[]
  scryfallId: string | null
  selectedIds?: Set<number>
  onSelectionChange?: (cardId: number, selected: boolean) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const queryClient = useQueryClient()

  // Check if all cards in this group are selected
  const allSelected = cardIds.length > 0 && cardIds.every(id => selectedIds?.has(id))
  const someSelected = cardIds.some(id => selectedIds?.has(id))

  const handleSelectAll = (checked: boolean) => {
    cardIds.forEach(id => onSelectionChange?.(id, checked))
  }

  const updateQtyMutation = useMutation({
    mutationFn: async (newQty: number) => {
      if (newQty > cardIds.length) {
        // Can't add more of a specific printing from here — user should use Add Card
        throw new Error('Use "Add card" to add more copies of this printing')
      } else if (newQty < cardIds.length) {
        const toRemove = cardIds.slice(newQty)
        for (const id of toRemove) {
          const res = await fetch(`/api/decks/${deckId}/cards/${id}`, { method: 'DELETE' })
          if (!res.ok) throw new Error('Failed to remove')
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'health'] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'health'] })
      queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
      queryClient.invalidateQueries({ queryKey: ['picklist', String(deckId)] })
      toast.success(`Updated to ${qty} copies`)
      setMenuOpen(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const makeGenericMutation = useMutation({
    mutationFn: async () => {
      toast.loading('Converting to generic...', { id: 'make-generic' })
      for (const id of cardIds) {
        const res = await fetch(`/api/decks/${deckId}/cards/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scryfall_id: null, set_code: null }),
        })
        if (!res.ok) throw new Error('Failed to update')
      }
    },
    onSuccess: () => {
      toast.dismiss('make-generic')
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'health'] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'health'] })
      queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
      queryClient.invalidateQueries({ queryKey: ['picklist', String(deckId)] })
      toast.success('Converted to generic')
      setMenuOpen(false)
    },
    onError: (err: Error) => { toast.dismiss('make-generic'); toast.error(err.message) },
  })

  return (
    <div role="listitem" className="border-b border-[rgba(255,255,255,0.04)] last:border-b-0">
      <div className="group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-white/[0.03]">
        <GripVertical className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-40 transition-opacity cursor-grab" aria-hidden="true" />
        <input 
          type="checkbox" 
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
          onChange={(e) => handleSelectAll(e.target.checked)}
          className="size-3.5 shrink-0 rounded border-[rgba(255,255,255,0.1)] bg-transparent opacity-30 checked:opacity-100 hover:opacity-60 transition-opacity accent-[var(--accent-primary)]" 
          aria-label={`Select ${displayName}`} 
        />

        <span className="w-4 shrink-0 text-right text-[length:var(--fs-xs)] text-muted-foreground">{count}</span>
        <span className="min-w-0 flex-1 truncate text-[length:var(--fs-sm)]">{displayName}</span>

        {/* Status chip */}
        <CardSlotBadge status={status} variant="icon" />

        {/* Kebab menu */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded p-1 text-[var(--text-tertiary)] opacity-0 transition-all group-hover:opacity-100 hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-secondary)]"
            aria-label="More actions"
          >
            <MoreVertical className="size-3.5" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-7 z-20 min-w-[140px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-2 px-3 shadow-lg"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[length:var(--fs-xs)] text-muted-foreground">Qty:</span>
                <button
                  type="button"
                  onClick={() => { if (count > 1) updateQtyMutation.mutate(count - 1) }}
                  disabled={count <= 1 || updateQtyMutation.isPending}
                  className="flex size-6 items-center justify-center rounded border border-[var(--border-default)] text-[length:var(--fs-sm)] text-foreground hover:bg-white/[0.05] disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-6 text-center text-[length:var(--fs-sm)] text-foreground tabular-nums">{count}</span>
                <button
                  type="button"
                  disabled={true}
                  className="flex size-6 items-center justify-center rounded border border-[var(--border-default)] text-[length:var(--fs-sm)] text-foreground opacity-40"
                  title="Use Add Card to add more copies"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => makeGenericMutation.mutate()}
                disabled={makeGenericMutation.isPending}
                className="flex w-full items-center gap-2 rounded px-1 py-1 text-[length:var(--fs-xs)] text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground disabled:opacity-40"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '12px' }} aria-hidden="true">circle</span>
                Make generic
              </button>
              <button
                type="button"
                onClick={() => updateQtyMutation.mutate(0)}
                disabled={updateQtyMutation.isPending}
                className="flex w-full items-center gap-2 rounded px-1 py-1 text-[length:var(--fs-xs)] transition-colors hover:bg-[rgba(226,75,74,0.1)] disabled:opacity-40"
                style={{ color: 'rgba(226,75,74,0.8)' }}
              >
                <Trash2 className="size-3" />
                Remove all
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CategorySuggestionsDialog — fetches and displays category suggestions
// ---------------------------------------------------------------------------

interface CategorySuggestion {
  category: string
  confidence: 'high' | 'medium' | 'low'
  source: 'tag' | 'archetype' | 'theme'
  sourceValue: string
}

interface CategorySuggestionsDialogProps {
  open: boolean
  cardName: string
  deckCardsId: number
  deckId: number
  currentCategories?: string
  onApply: (categories: StructuredCategories) => void
  onClose: () => void
}

function CategorySuggestionsDialog({
  open,
  cardName,
  deckCardsId,
  deckId,
  currentCategories,
  onApply,
  onClose,
}: CategorySuggestionsDialogProps) {
  const [selectedPrimary, setSelectedPrimary] = useState<string | null>(null)
  const [selectedSecondary, setSelectedSecondary] = useState<string[]>([])

  // Parse current categories to show what's already set
  const parsed = useMemo(() => parseCategoriesCapped(currentCategories || '[]'), [currentCategories])

  // Fetch suggestions from API
  const { data, isLoading, error } = useQuery<{
    cardName: string
    suggestions: CategorySuggestion[]
    tags: string[]
  }>({
    queryKey: ['category-suggestions', cardName],
    queryFn: async () => {
      const res = await fetch(`/api/cards/suggest-categories?cardName=${encodeURIComponent(cardName)}`)
      if (!res.ok) throw new Error('Failed to fetch suggestions')
      return res.json()
    },
    enabled: open,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })

  // Reset selections when dialog opens
  useMemo(() => {
    if (open && data?.suggestions) {
      // Pre-select the highest confidence primary suggestion
      const primary = data.suggestions.find(s => s.confidence === 'high')?.category || data.suggestions[0]?.category || null
      setSelectedPrimary(primary)
      setSelectedSecondary([])
    }
  }, [open, data])

  const handleApply = () => {
    if (!selectedPrimary) return
    onApply({
      primary_category: selectedPrimary,
      additional_categories: selectedSecondary.slice(0, 2), // Max 2 secondary
    })
  }

  const toggleSecondary = (category: string) => {
    if (category === selectedPrimary) return // Can't add primary as secondary
    setSelectedSecondary(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category)
      }
      if (prev.length >= 2) {
        return [...prev.slice(1), category] // Replace oldest
      }
      return [...prev, category]
    })
  }

  const confidenceColors = {
    high: 'text-emerald-500 bg-emerald-500/10',
    medium: 'text-amber-500 bg-amber-500/10',
    low: 'text-muted-foreground bg-white/5',
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[400px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-amber-400" />
            Category Suggestions
          </DialogTitle>
          <DialogDescription>
            Suggestions for <strong>{cardName}</strong> based on Scryfall tags.
            {parsed.primary_category && (
              <span className="block mt-1 text-muted-foreground">
                Current: {parsed.primary_category}
                {parsed.additional_categories.length > 0 && ` + ${parsed.additional_categories.join(', ')}`}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <span className="animate-pulse">Loading suggestions...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 py-4 text-amber-500">
              <AlertCircle className="size-4" />
              <span>No tags found for this card</span>
            </div>
          )}

          {data && data.suggestions.length === 0 && (
            <div className="flex items-center gap-2 py-4 text-muted-foreground">
              <AlertCircle className="size-4" />
              <span>No category suggestions available</span>
            </div>
          )}

          {data && data.suggestions.length > 0 && (
            <div className="space-y-3">
              {/* Primary category selection */}
              <div>
                <label className="text-[length:var(--fs-xs)] font-medium text-muted-foreground uppercase tracking-wide">
                  Primary Category
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.suggestions.slice(0, 6).map((suggestion) => (
                    <button
                      key={suggestion.category}
                      type="button"
                      onClick={() => {
                        setSelectedPrimary(suggestion.category)
                        // Remove from secondary if it was there
                        setSelectedSecondary(prev => prev.filter(c => c !== suggestion.category))
                      }}
                      className={`
                        inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--fs-xs)] font-medium
                        transition-all border
                        ${selectedPrimary === suggestion.category
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                          : 'border-[var(--border-default)] hover:border-[var(--border-subtle)] hover:bg-white/5'
                        }
                      `}
                    >
                      {selectedPrimary === suggestion.category && <Check className="size-3" />}
                      {suggestion.category}
                      <span className={`ml-1 rounded px-1 py-0.5 text-[10px] ${confidenceColors[suggestion.confidence]}`}>
                        {suggestion.confidence}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Secondary categories */}
              {data.suggestions.length > 1 && (
                <div>
                  <label className="text-[length:var(--fs-xs)] font-medium text-muted-foreground uppercase tracking-wide">
                    Secondary (up to 2)
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.suggestions
                      .filter(s => s.category !== selectedPrimary)
                      .slice(0, 8)
                      .map((suggestion) => (
                        <button
                          key={suggestion.category}
                          type="button"
                          onClick={() => toggleSecondary(suggestion.category)}
                          className={`
                            inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--fs-xs)] font-medium
                            transition-all border
                            ${selectedSecondary.includes(suggestion.category)
                              ? 'border-[var(--accent-secondary)] bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)]'
                              : 'border-[var(--border-default)] hover:border-[var(--border-subtle)] hover:bg-white/5'
                            }
                          `}
                        >
                          {selectedSecondary.includes(suggestion.category) && <Check className="size-3" />}
                          {suggestion.category}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Source tags for context */}
              {data.tags.length > 0 && (
                <div className="pt-2 border-t border-[var(--border-subtle)]">
                  <label className="text-[length:var(--fs-xs)] text-muted-foreground">
                    Based on tags: {data.tags.slice(0, 5).join(', ')}
                    {data.tags.length > 5 && ` +${data.tags.length - 5} more`}
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            onClick={handleApply}
            disabled={!selectedPrimary || isLoading}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
