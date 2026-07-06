'use client'

import { ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { truncateName, formatPrice } from '@/lib/collection-printing-utils'
import type { PrintingRowResponse } from '@/lib/collection-printing-utils'
import type { PrintingSortField, SortDirection } from '@/lib/collection-filters'
import { UsedByCell } from './UsedByCell'

/* ─── Types ─────────────────────────────────────────────────────────── */

interface PrintingListViewProps {
  rows: PrintingRowResponse[]
  sortField: PrintingSortField
  sortDirection: SortDirection
  onSort: (field: PrintingSortField) => void
}

/* ─── Column Definitions ────────────────────────────────────────────── */

interface ColumnDef {
  label: string
  field: PrintingSortField | null // null = not sortable
  align: 'left' | 'right'
  width: string
}

const COLUMNS: ColumnDef[] = [
  { label: 'Qty', field: 'quantity', align: 'right', width: 'min-w-[50px]' },
  { label: 'Name', field: 'cardName', align: 'left', width: 'min-w-0 flex-1' },
  { label: 'Printing', field: 'setCode', align: 'left', width: 'min-w-[140px]' },
  { label: 'Finish', field: null, align: 'left', width: 'min-w-[70px]' },
  { label: 'Used By', field: 'usedByCount', align: 'right', width: 'min-w-[70px]' },
  { label: 'Price', field: 'price', align: 'right', width: 'min-w-[90px]' },
]

/* ─── SortableHeader ────────────────────────────────────────────────── */

function SortableHeader({
  column,
  sortField,
  sortDirection,
  onSort,
}: {
  column: ColumnDef
  sortField: PrintingSortField
  sortDirection: SortDirection
  onSort: (field: PrintingSortField) => void
}) {
  const isSortable = column.field !== null
  const isActive = isSortable && column.field === sortField

  const headerContent = (
    <span className="inline-flex items-center gap-0.5">
      {column.label}
      {isActive && (
        sortDirection === 'asc' ? (
          <ChevronUp className="size-3" aria-label="Sorted ascending" />
        ) : (
          <ChevronDown className="size-3" aria-label="Sorted descending" />
        )
      )}
    </span>
  )

  const baseClasses = cn(
    column.width,
    'text-[10px] font-medium uppercase tracking-wider',
    column.align === 'right' && 'text-right'
  )

  if (!isSortable) {
    return (
      <span className={baseClasses} style={{ color: 'rgba(255,255,255,0.25)' }}>
        {column.label}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onSort(column.field!)}
      className={cn(
        baseClasses,
        'cursor-pointer transition-colors hover:text-white/50'
      )}
      style={{ color: isActive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)' }}
      aria-label={`Sort by ${column.label}${isActive ? `, currently ${sortDirection === 'asc' ? 'ascending' : 'descending'}` : ''}`}
    >
      {headerContent}
    </button>
  )
}

/* ─── PrintingListView ──────────────────────────────────────────────── */

export function PrintingListView({
  rows,
  sortField,
  sortDirection,
  onSort,
}: PrintingListViewProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Table header */}
      <div
        className="flex items-center gap-3 px-4 py-2"
        style={{
          background: 'rgba(255,255,255,0.02)',
          borderBottom: '0.5px solid rgba(255,255,255,0.07)',
        }}
      >
        {COLUMNS.map((col) => (
          <SortableHeader
            key={col.label}
            column={col}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ))}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div
            className="flex items-center justify-center py-16 text-xs"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            No cards match your filters.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={`${row.id}-${row.isFoil}`}
              className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-[rgba(255,255,255,0.02)]"
              style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}
            >
              {/* Quantity */}
              <span
                className="min-w-[50px] text-right text-xs tabular-nums"
                style={{ color: '#e8e8e6' }}
              >
                {row.quantity}
              </span>

              {/* Name */}
              <span
                className="min-w-0 flex-1 truncate text-xs"
                style={{ color: '#e8e8e6' }}
                title={row.cardName.length > 40 ? row.cardName : undefined}
              >
                {truncateName(row.cardName)}
              </span>

              {/* Printing */}
              <span className="min-w-[140px] flex items-center gap-1.5">
                <span className="text-xs" style={{ color: '#e8e8e6' }}>
                  {row.setName}
                </span>
                <span
                  className="text-[10px] font-mono uppercase"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  {row.setCode}
                </span>
              </span>

              {/* Finish */}
              <span className="min-w-[70px]">
                {row.isFoil ? (
                  <span
                    className="rounded-sm px-1 py-px text-[9px] font-medium uppercase"
                    style={{
                      background: 'rgba(167,139,250,0.15)',
                      color: 'rgba(167,139,250,0.8)',
                      border: '0.5px solid rgba(167,139,250,0.2)',
                    }}
                  >
                    Foil
                  </span>
                ) : (
                  <span
                    className="text-xs"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    Normal
                  </span>
                )}
              </span>

              {/* Used By */}
              <span className="min-w-[70px] text-right">
                <UsedByCell
                  usedByCount={row.usedByCount}
                  quantity={row.quantity}
                  decks={row.usedByDecks}
                />
              </span>

              {/* Price */}
              <span
                className="min-w-[90px] text-right text-xs tabular-nums"
                style={{
                  color: row.price === null
                    ? 'rgba(255,255,255,0.2)'
                    : 'rgba(255,255,255,0.5)',
                }}
              >
                {formatPrice(row.price)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
