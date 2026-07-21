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
import { ChevronDown, ChevronRight, Tags, MoreVertical, Trash2, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { CardHoverPreview, useCardHoverPreview } from '@/components/CardHoverPreview'
import { PrintingPicker } from '@/components/PrintingPicker'
import { StatusChipPopover } from '@/components/StatusChipPopover'
import { CardSlotBadge } from '@/components/CardSlotBadge'
import { CategoryTagEditor } from '@/components/CategoryTagEditor'
import { parseCategoriesCapped } from '@/lib/categoryUtils'
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
}: {
  card: DeckCard
  status: CardSlotStatus
  deckId: number
  physicalCopyId: number | null
  availableCategories: string[]
  onCategoryChange?: (cardId: number, categories: StructuredCategories) => void
  compact?: boolean
  maxCopies?: number | null
}) {
  const [popoverOpen, setPopoverOpen] = useState(false)

  const { triggerProps, previewProps } = useCardHoverPreview({
    scryfallId: card.scryfall_id,
    cardName: card.card_name,
  })

  const parsed = parseCategoriesCapped(card.categories)

  return (
    <div
      role="listitem"
      className="group flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-white/[0.03] border-b border-[rgba(255,255,255,0.04)] last:border-b-0"
    >
      {/* Drag handle — visible on hover */}
      <GripVertical className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-40 transition-opacity cursor-grab" aria-hidden="true" />

      {/* Checkbox */}
      <input
        type="checkbox"
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

      {/* Gap between pips and status */}
      <span className="shrink-0 w-3" aria-hidden="true" />

      {/* Interactive status chip */}
      <StatusChipPopover
        status={status}
        cardName={card.card_name}
        deckId={deckId}
        deckCardsId={card.id}
        physicalCopyId={physicalCopyId}
        scryfallId={card.scryfall_id ?? null}
        className="shrink-0"
      />

      {/* Price — hidden in compact mode and on mobile */}
      {!compact && (
        <span className="hidden md:inline shrink-0 text-[length:var(--fs-xs)] tabular-nums text-muted-foreground" style={{ width: 56, textAlign: 'right' }}>
          {card.price_usd != null ? `$${card.price_usd.toFixed(2)}` : '—'}
        </span>
      )}

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
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// GenericLandRow — simple row for generic (untracked) basic lands
// ---------------------------------------------------------------------------

function GenericLandRow({ landName, count, deckId, cardIds }: { landName: string; count: number; deckId: number; cardIds: number[] }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [optimisticCount, setOptimisticCount] = useState(count)
  const queryClient = useQueryClient()

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
    queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
    queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'card-statuses'] })
    queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
    queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'health'] })
    queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'health'] })
    queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
    queryClient.invalidateQueries({ queryKey: ['picklist', String(deckId)] })
  }

  const handleAdd = () => {
    setOptimisticCount(c => c + 1)
    fetch(`/api/decks/${deckId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardName: landName }),
    }).then(res => {
      if (!res.ok) { setOptimisticCount(c => c - 1); toast.error('Failed to add') }
      invalidateAll()
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
        invalidateAll()
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

function CardRowKebab({ deckCardsId, deckId, cardName, quantity = 1, maxCopies = 1 }: { deckCardsId: number; deckId: number; cardName: string; quantity?: number; maxCopies?: number | null }) {
  const [open, setOpen] = useState(false)
  const [printingPickerOpen, setPrintingPickerOpen] = useState(false)
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
          className="absolute right-0 top-7 z-20 min-w-[140px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-1 shadow-lg"
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
}: {
  displayName: string
  count: number
  status: CardSlotStatus
  deckId: number
  cardIds: number[]
  scryfallId: string | null
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const queryClient = useQueryClient()

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
        <input type="checkbox" className="size-3.5 shrink-0 rounded border-[rgba(255,255,255,0.1)] bg-transparent opacity-30 checked:opacity-100 hover:opacity-60 transition-opacity accent-[var(--accent-primary)]" aria-label={`Select ${displayName}`} />

        <span className="w-4 shrink-0 text-right text-[length:var(--fs-xs)] text-muted-foreground">{count}</span>
        <span className="min-w-0 flex-1 truncate text-[length:var(--fs-sm)]">{displayName}</span>

        {/* Status chip */}
        <CardSlotBadge status={status} />

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
