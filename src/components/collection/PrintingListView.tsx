'use client'

import { useState, useCallback, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CardHoverPreview as SharedCardHoverPreview } from '@/components/CardHoverPreview'
import { truncateName, formatPrice } from '@/lib/collection-printing-utils'
import type { PrintingRowResponse } from '@/lib/collection-printing-utils'
import type { PrintingSortField, SortDirection } from '@/lib/collection-filters'

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface PrintingListViewProps {
  rows: PrintingRowResponse[]
  sortField: PrintingSortField
  sortDirection: SortDirection
  onSort: (field: PrintingSortField) => void
  isPriceStale?: boolean
  lastPriceRefresh?: string | null
}

/* ─── Column Widths ─────────────────────────────────────────────────── */

const COL = {
  qty: 'w-[56px]',
  name: 'min-w-[320px] flex-1',
  printing: 'w-[260px]',
  finish: 'w-[110px]',
  price: 'w-[100px]',
} as const

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
  align: 'left' | 'right'
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
    <span className={cn('inline-flex items-center gap-0.5', align === 'right' && 'justify-end')}>
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
    align === 'right' ? 'text-right' : 'text-left'
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

/* ─── PriceStaleIcon ────────────────────────────────────────────────── */

function PriceStaleIcon({ lastPriceRefresh }: { lastPriceRefresh?: string | null }) {
  const tooltip = lastPriceRefresh
    ? `Prices may be outdated — last refreshed ${formatRelativeTimestamp(lastPriceRefresh)}`
    : 'Prices may be outdated — never refreshed'

  return (
    <span className="relative ml-1 inline-flex" title={tooltip}>
      <AlertTriangle
        className="size-2.5"
        style={{ color: 'rgba(245,158,11,0.7)' }}
        aria-label={tooltip}
      />
    </span>
  )
}

function formatRelativeTimestamp(iso: string): string {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return 'unknown'
  const month = date.toLocaleString('en-US', { month: 'short' })
  const day = date.getDate()
  const time = date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${month} ${day} at ${time}`
}

/* ─── CardHoverPreview — uses shared component ─────────────────────── */

/* ─── PrintingListView ──────────────────────────────────────────────── */

export function PrintingListView({
  rows,
  sortField,
  sortDirection,
  onSort,
  isPriceStale = false,
  lastPriceRefresh = null,
}: PrintingListViewProps) {
  const [hoverCard, setHoverCard] = useState<{ scryfallId: string; cardName: string; x: number; y: number } | null>(null)

  const handleMouseEnter = useCallback((e: React.MouseEvent, row: PrintingRowResponse) => {
    if (row.scryfallPrintingId) {
      setHoverCard({ scryfallId: row.scryfallPrintingId, cardName: row.cardName, x: e.clientX, y: e.clientY })
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (hoverCard) setHoverCard((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
  }, [hoverCard])

  const handleMouseLeave = useCallback(() => setHoverCard(null), [])

  // Virtualization
  const parentRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 20,
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Table header */}
      <div
        className="flex items-center px-4 py-2"
        style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '0.5px solid rgba(255,255,255,0.07)', gap: '12px' }}
      >
        <SortableHeader label="Qty" field="quantity" align="right" className={COL.qty} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
        <div className="w-2 shrink-0" aria-hidden="true" />
        <SortableHeader label="Name" field="cardName" align="left" className={COL.name} shrink={false} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
        <SortableHeader label="Printing" field="setCode" align="left" className={COL.printing} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
        <SortableHeader label="Finish" field={null} align="left" className={COL.finish} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
        <SortableHeader
          label="Price"
          field="price"
          align="right"
          className={COL.price}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={onSort}
          suffix={isPriceStale ? <PriceStaleIcon lastPriceRefresh={lastPriceRefresh} /> : undefined}
        />
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
              return (
                <div
                  key={`${row.id}-${row.isFoil}-${row.isProxy}`}
                  className={cn(
                    'absolute left-0 flex w-full items-center px-4 transition-colors hover:bg-[rgba(255,255,255,0.02)]',
                    row.isProxy && 'opacity-60'
                  )}
                  style={{
                    height: `${virtualRow.size}px`,
                    top: `${virtualRow.start}px`,
                    borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                    gap: '12px',
                    borderLeft: row.isProxy ? '2px dashed rgba(255,255,255,0.15)' : '2px solid transparent',
                  }}
                >
                  {/* Qty */}
                  <span className={cn(COL.qty, 'shrink-0 text-right text-[length:var(--fs-base)] tabular-nums')} style={{ color: '#e8e8e6' }}>
                    {row.quantity}
                  </span>

                  <div className="w-2 shrink-0" aria-hidden="true" />

                  {/* Name */}
                  <span
                    className={cn(COL.name, 'truncate text-[length:var(--fs-base)] cursor-default')}
                    style={{ color: '#e8e8e6' }}
                    title={row.cardName.length > 40 ? row.cardName : undefined}
                    onMouseEnter={(e) => handleMouseEnter(e, row)}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                  >
                    {truncateName(row.cardName)}
                    {row.isProxy && (
                      <span className="ml-1.5 text-[9px] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>proxy</span>
                    )}
                  </span>

                  {/* Printing */}
                  <span className={cn(COL.printing, 'shrink-0 flex items-center gap-1.5')}>
                    <span className="truncate text-[length:var(--fs-base)]" style={{ color: '#e8e8e6' }}>{row.setName}</span>
                    <span className="shrink-0 text-[length:var(--fs-xs)] font-mono uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>{row.setCode}</span>
                  </span>

                  {/* Finish */}
                  <span className={cn(COL.finish, 'shrink-0')}>
                    {row.isFoil ? (
                      <span className="rounded-sm px-1 py-px text-[9px] font-medium uppercase" style={{ background: 'rgba(167,139,250,0.15)', color: 'rgba(167,139,250,0.8)', border: '0.5px solid rgba(167,139,250,0.2)' }}>Foil</span>
                    ) : (
                      <span className="text-[length:var(--fs-base)]" style={{ color: 'rgba(255,255,255,0.5)' }}>Normal</span>
                    )}
                  </span>

                  {/* Price */}
                  <span
                    className={cn(COL.price, 'shrink-0 text-right text-[length:var(--fs-base)] tabular-nums')}
                    style={{ color: row.price === null ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)' }}
                  >
                    {formatPrice(row.price)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Card hover preview */}
      {hoverCard && <SharedCardHoverPreview scryfallId={hoverCard.scryfallId} cardName={hoverCard.cardName} anchorX={hoverCard.x} anchorY={hoverCard.y} visible={true} />}
    </div>
  )
}
