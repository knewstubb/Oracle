'use client'

import { useCallback, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronUp, ChevronDown, MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { truncateName, formatPrice } from '@/lib/collection-printing-utils'
import type { PrintingRowResponse } from '@/lib/collection-printing-utils'
import type { PrintingSortField, SortDirection } from '@/lib/collection-filters'
import { useIsMobile } from '@/hooks/useIsMobile'
import { MobileCardPreview } from '@/components/MobileCardPreview'
import {
  showCardPreview,
  updateCardPreviewPosition,
  hideCardPreview,
} from '@/components/CardHoverPreview'

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface PrintingListViewProps {
  rows: PrintingRowResponse[]
  sortField: PrintingSortField
  sortDirection: SortDirection
  onSort: (field: PrintingSortField) => void
}

/* ─── Column Widths ─────────────────────────────────────────────────── */

// Name has priority: group 1 keeps a minimum width (NAME_GROUP) and takes 3x the
// spare space; every other column shrinks, truncates or hides first.
// Group 1: Checkbox + Qty + Name (flex-[3], min width, inner gap-4)
// Group 2: Rarity + Set (flex-1, shrinks and truncates)
// Type: 120px, hidden below xl
// Group 3: Price + Added (Added hidden below lg)
// Actions: 40px standalone
// Outer gap between groups: gap-6 = 24px
const COL = {
  checkbox: 'w-6',      // 24px
  qty: 'w-6',           // 24px
  rarity: 'w-10',       // 40px
  type: 'w-[120px]',    // 120px
  price: 'w-12',        // 48px
  added: 'w-20',        // 80px
  actions: 'w-10',      // 40px
} as const
const NAME_GROUP = 'min-w-[260px]' // checkbox 24 + qty 24 + gaps 32 + name >= 180
/* ─── SortableHeader ────────────────────────────────────────────────── */

function SortableHeader({
  label,
  field,
  align,
  className,
  shrink = true,
  sortField,
  sortDirection,
  onSort,
  suffix,
}: {
  label: string
  field: PrintingSortField | null
  align: 'left' | 'center' | 'right'
  className: string
  shrink?: boolean
  sortField: PrintingSortField
  sortDirection: SortDirection
  onSort: (field: PrintingSortField) => void
  suffix?: React.ReactNode
}) {
  const isSortable = field !== null
  const isActive = isSortable && field === sortField

  const content = (
    <span className={cn('inline-flex items-center gap-0.5', align === 'right' && 'justify-end', align === 'center' && 'justify-center')}>
      {label}
      {isActive && (
        sortDirection === 'asc' ? (
          <ChevronUp className="size-3" aria-label="Sorted ascending" />
        ) : (
          <ChevronDown className="size-3" aria-label="Sorted descending" />
        )
      )}
      {suffix}
    </span>
  )

  const baseClasses = cn(
    className,
    shrink && 'shrink-0',
    'text-[length:var(--fs-xs)] font-medium uppercase tracking-wider',
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  )

  if (!isSortable) {
    return (
      <span className={baseClasses} style={{ color: 'rgba(255,255,255,0.25)' }}>
        {label}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onSort(field!)}
      className={cn(baseClasses, 'cursor-pointer transition-colors hover:text-white/50')}
      style={{ color: isActive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)' }}
      aria-label={`Sort by ${label}${isActive ? `, currently ${sortDirection === 'asc' ? 'ascending' : 'descending'}` : ''}`}
    >
      {content}
    </button>
  )
}

/**
 * Formats a date as short date with year (e.g. "Jul 15, 2024")
 */
function formatShortDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (isNaN(date.getTime())) return '—'
  const month = date.toLocaleString('en-US', { month: 'short' })
  const day = date.getDate()
  const year = date.getFullYear()
  return `${month} ${day}, ${year}`
}

/**
 * Extracts a short type from a full type line.
 * E.g. "Legendary Creature — Human Wizard" → "Creature"
 *      "Instant" → "Instant"
 *      "Artifact Creature — Golem" → "Artifact"
 */
function shortType(typeLine: string | null): string {
  if (!typeLine) return '—'
  // Remove everything after em-dash (subtypes)
  const mainType = typeLine.split('—')[0].trim()
  // Priority order for display
  const priorities = ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Battle']
  for (const p of priorities) {
    if (mainType.includes(p)) return p
  }
  return mainType.split(' ')[0] || '—'
}

/* ─── PrintingListView ──────────────────────────────────────────────── */

export function PrintingListView({
  rows,
  sortField,
  sortDirection,
  onSort,
}: PrintingListViewProps) {
  const isMobile = useIsMobile()
  
  // Mobile preview state
  const [previewCard, setPreviewCard] = useState<{ name: string; scryfallId: string | null } | null>(null)
  
  // Track active hover state via ref (no React state = no rerenders)
  const activeHoverRef = useRef<string | null>(null)

  const handleMouseEnter = useCallback((e: React.MouseEvent, row: PrintingRowResponse) => {
    if (row.scryfallPrintingId) {
      activeHoverRef.current = row.scryfallPrintingId
      showCardPreview(row.scryfallPrintingId, row.cardName, e.clientX, e.clientY)
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (activeHoverRef.current) {
      updateCardPreviewPosition(e.clientX, e.clientY)
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    activeHoverRef.current = null
    hideCardPreview()
  }, [])
  
  // Mobile tap handler
  const handleTap = useCallback((row: PrintingRowResponse) => {
    setPreviewCard({
      name: row.cardName,
      scryfallId: row.scryfallPrintingId,
    })
  }, [])

  // Virtualization
  const parentRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => isMobile ? 48 : 44,
    overscan: 20,
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Table header */}
      <div
        className={cn(
          "flex items-center px-4 py-2",
          isMobile ? "gap-3" : "gap-6"
        )}
        style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}
      >
        {isMobile ? (
          /* Mobile header: QTY | NAME | PRICE */
          <>
            <SortableHeader label="Qty" field="quantity" align="center" className="w-8 shrink-0" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
            <SortableHeader label="Name" field="cardName" align="left" className="flex-1 min-w-0" shrink={false} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
            <SortableHeader label="Price" field="price" align="right" className="w-14 shrink-0" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
          </>
        ) : (
          /* Desktop header: full layout */
          <>
            {/* Group 1: Checkbox + Qty + Name (FLEX) */}
            <div className={cn('flex flex-[3] items-center gap-4', NAME_GROUP)}>
              <div className={cn(COL.checkbox, 'shrink-0 flex items-center justify-center')}>
                <input type="checkbox" className="size-3.5 rounded border-[rgba(255,255,255,0.1)] bg-transparent opacity-30 checked:opacity-100 hover:opacity-60 transition-opacity accent-[var(--accent-primary)]" aria-label="Select all" />
              </div>
              <SortableHeader label="Qty" field="quantity" align="center" className={COL.qty} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
              <SortableHeader label="Name" field="cardName" align="left" className="flex-1 min-w-0" shrink={false} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
            </div>

            {/* Group 2: Rarity + Set (FLEX) */}
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <SortableHeader label="Rarity" field="rarity" align="center" className={COL.rarity} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
              <SortableHeader label="Set" field="setCode" align="left" className="flex-1 min-w-0" shrink={false} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
            </div>

            {/* Type (hidden below xl) */}
            <div className="hidden w-[120px] shrink-0 xl:block">
              <SortableHeader label="Type" field={null} align="left" className={COL.type} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
            </div>
            {/* Group 3: Price + Added (Added hidden below lg) */}
            <div className="flex shrink-0 items-center gap-6">
              <SortableHeader label="Price" field="price" align="right" className={COL.price} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
              <div className="hidden w-20 shrink-0 lg:block">
                <SortableHeader label="Added" field={null} align="left" className={COL.added} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
              </div>
            </div>
            {/* Actions (standalone 40px) */}
            <div className={cn(COL.actions, 'shrink-0')} aria-hidden="true" />
          </>
        )}
      </div>

      {/* Virtualized rows */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-[length:var(--fs-sm)]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            No cards match your filters.
          </div>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              
              if (isMobile) {
                // Mobile row: QTY | NAME (tappable) | PRICE
                return (
                  <div
                    key={`${row.id}-${row.isFoil}-${row.isProxy}`}
                    className={cn(
                      'absolute left-0 flex w-full items-center gap-3 px-4 active:bg-[rgba(255,255,255,0.04)]',
                      row.isProxy && 'opacity-60'
                    )}
                    style={{
                      height: `${virtualRow.size}px`,
                      top: `${virtualRow.start}px`,
                      borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                      borderLeft: row.isProxy ? '2px dashed rgba(255,255,255,0.15)' : '2px solid transparent',
                    }}
                    onClick={() => handleTap(row)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleTap(row)}
                  >
                    {/* Quantity */}
                    <span className="w-8 shrink-0 text-center text-[length:var(--fs-base)] tabular-nums" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {row.quantity}
                    </span>

                    {/* Name (full width, truncated) */}
                    <span className="flex-1 min-w-0 truncate text-[length:var(--fs-base)]">
                      <span style={{ color: 'var(--color-primary-text)', fontWeight: 500 }}>
                        {row.cardName}
                      </span>
                      {row.isProxy && (
                        <span className="ml-1.5 text-[9px] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>proxy</span>
                      )}
                    </span>

                    {/* Price */}
                    <span
                      className="w-14 shrink-0 text-right text-[length:var(--fs-sm)] tabular-nums"
                      style={{ color: row.price === null ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)' }}
                    >
                      {formatPrice(row.price)}
                    </span>
                  </div>
                )
              }
              
              // Desktop row: full layout
              return (
                <div
                  key={`${row.id}-${row.isFoil}-${row.isProxy}`}
                  className={cn(
                    'group absolute left-0 flex w-full items-center gap-6 px-4 transition-colors hover:bg-[rgba(255,255,255,0.02)]',
                    row.isProxy && 'opacity-60'
                  )}
                  style={{
                    height: `${virtualRow.size}px`,
                    top: `${virtualRow.start}px`,
                    borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                    borderLeft: row.isProxy ? '2px dashed rgba(255,255,255,0.15)' : '2px solid transparent',
                  }}
                >
                  {/* Group 1: Checkbox + Qty + Name (FLEX) */}
                  <div className={cn('flex flex-[3] items-center gap-4', NAME_GROUP)}>
                    <span className={cn(COL.checkbox, 'shrink-0 flex items-center justify-center')}>
                      <input type="checkbox" className="size-3.5 rounded border-[rgba(255,255,255,0.1)] bg-transparent opacity-30 checked:opacity-100 hover:opacity-60 transition-opacity accent-[var(--accent-primary)]" aria-label={`Select ${row.cardName}`} />
                    </span>

                    <span className={cn(COL.qty, 'shrink-0 text-center text-[length:var(--fs-base)] tabular-nums')} style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {row.quantity}
                    </span>

                    <span
                      className="flex-1 min-w-0 truncate text-[length:var(--fs-base)] cursor-default"
                      title={row.cardName.length > 40 ? row.cardName : undefined}
                      onMouseEnter={(e) => handleMouseEnter(e, row)}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                    >
                      <span style={{ color: 'var(--color-primary-text)', fontWeight: 500 }}>
                        {truncateName(row.cardName)}
                      </span>
                      {row.collectorNumber && (
                        <span className="ml-1.5 tabular-nums" style={{ color: 'rgba(255,255,255,0.35)' }}>#{row.collectorNumber}</span>
                      )}
                      {row.isProxy && (
                        <span className="ml-1.5 text-[9px] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>proxy</span>
                      )}
                    </span>
                  </div>

                  {/* Group 2: Rarity + Set (FLEX) */}
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <span className={cn(COL.rarity, 'shrink-0 flex items-center justify-center')}>
                      {row.setCode && (
                        <i
                          className={`ss ss-${row.setCode.toLowerCase()} ss-fw ss-${row.rarity || 'common'} ss-grad`}
                          style={{ fontSize: '14px' }}
                          aria-label={row.rarity || 'common'}
                        />
                      )}
                    </span>

                    <span className="flex-1 min-w-0 truncate text-[length:var(--fs-base)]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {row.setName}
                    </span>
                  </div>

                  {/* Type (hidden below xl) */}
                  <span
                    className={cn(COL.type, 'hidden shrink-0 truncate text-[length:var(--fs-base)] xl:block')}
                    style={{ color: 'rgba(255,255,255,0.4)' }}
                    title={row.typeLine || undefined}
                  >
                    {shortType(row.typeLine)}
                  </span>
                  {/* Group 3: Price + Added (Added hidden below lg) */}
                  <div className="flex shrink-0 items-center gap-6">
                    <span
                      className={cn(COL.price, 'shrink-0 text-right text-[length:var(--fs-base)] tabular-nums')}
                      style={{ color: row.price === null ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)' }}
                    >
                      {formatPrice(row.price)}
                    </span>
                    <span
                      className={cn(COL.added, 'hidden shrink-0 text-[length:var(--fs-sm)] lg:block')}
                      style={{ color: 'rgba(255,255,255,0.35)' }}
                    >
                      {formatShortDate(row.addedAt)}
                    </span>
                  </div>
                  {/* Actions (standalone 40px) */}
                  <span className={cn(COL.actions, 'shrink-0 flex items-center justify-end')}>
                    <button
                      type="button"
                      className="rounded p-1 opacity-0 transition-all group-hover:opacity-100 hover:bg-[rgba(255,255,255,0.05)]"
                      style={{ color: 'rgba(255,255,255,0.4)' }}
                      aria-label="More actions"
                    >
                      <MoreVertical className="size-4" />
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      
      {/* Mobile card preview modal */}
      {previewCard && (
        <MobileCardPreview
          cardName={previewCard.name}
          scryfallId={previewCard.scryfallId}
          isOpen={true}
          onClose={() => setPreviewCard(null)}
        />
      )}
    </div>
  )
}
