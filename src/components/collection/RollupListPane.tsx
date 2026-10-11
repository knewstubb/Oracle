'use client'

import { Search, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RollupV2Row } from '@/app/api/collection/rollup-v2/route'
import { RollupRow } from './RollupRow'

/* ─── Types ─────────────────────────────────────────────────────────── */

type RollupSortField = 'cardName' | 'ownedCount' | 'proxyCount' | 'allocatedCount' | 'shortfall'
type SortDirection = 'asc' | 'desc'

export interface RollupListPaneProps {
  rows: RollupV2Row[]
  isLoading: boolean
  error: Error | null
  searchQuery: string
  onSearchChange: (q: string) => void
  sortField: string
  sortDirection: SortDirection
  onSortFieldChange: (field: RollupSortField) => void
  onSortDirectionChange: (dir: SortDirection) => void
  basicLandFilter: boolean
  onBasicLandFilterChange: (v: boolean) => void
  allocatedFilter: boolean
  onAllocatedFilterChange: (v: boolean) => void
  selectedOracleId: string | null
  onRowClick: (oracleId: string) => void
  onCheckboxToggle: (oracleId: string) => void
  getTriState: (oracleId: string) => 'checked' | 'unchecked' | 'indeterminate'
  isPanelOpen: boolean
}

/* ─── Column Definitions ────────────────────────────────────────────── */

interface ColumnDef {
  key: RollupSortField | '__checkbox'
  label: string
  width: string
  sortable: boolean
  align?: 'left' | 'right'
}

const columns: ColumnDef[] = [
  { key: '__checkbox', label: '', width: '32px', sortable: false },
  { key: 'cardName', label: 'Name', width: '1fr', sortable: true, align: 'left' },
  { key: 'ownedCount', label: 'Owned', width: '70px', sortable: true, align: 'right' },
  { key: 'proxyCount', label: 'Proxy', width: '70px', sortable: true, align: 'right' },
  { key: 'allocatedCount', label: 'Alloc', width: '70px', sortable: true, align: 'right' },
  { key: 'shortfall', label: 'Short', width: '70px', sortable: true, align: 'right' },
]

/* ─── SortIndicator ─────────────────────────────────────────────────── */

function SortIndicator({ field, sortField, sortDirection }: {
  field: string
  sortField: string
  sortDirection: SortDirection
}) {
  if (field !== sortField) return null
  return sortDirection === 'asc'
    ? <ChevronUp className="ml-0.5 inline-block size-3" />
    : <ChevronDown className="ml-0.5 inline-block size-3" />
}

/* ─── RollupListPane ────────────────────────────────────────────────── */

export function RollupListPane({
  rows,
  isLoading,
  error,
  searchQuery,
  onSearchChange,
  sortField,
  sortDirection,
  onSortFieldChange,
  onSortDirectionChange,
  basicLandFilter,
  onBasicLandFilterChange,
  allocatedFilter,
  onAllocatedFilterChange,
  selectedOracleId,
  onRowClick,
  onCheckboxToggle,
  getTriState,
  isPanelOpen,
}: RollupListPaneProps) {
  // ─── Sort toggle handler ───────────────────────────────────────
  const handleSort = (field: RollupSortField) => {
    if (field === sortField) {
      onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      onSortFieldChange(field)
      onSortDirectionChange('asc')
    }
  }

  // ─── Loading state ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <p className="text-[length:var(--fs-base)] text-[var(--text-tertiary)]">
          Loading rollup data…
        </p>
      </div>
    )
  }

  // ─── Error state ───────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <p className="text-[length:var(--fs-base)] text-[var(--text-secondary)]">
          Failed to load collection rollup.
        </p>
      </div>
    )
  }

  // ─── Grid template for columns ─────────────────────────────────
  const gridTemplate = columns.map((c) => c.width).join(' ') + ' var(--status-slot-width)'

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* ─── Toolbar: Search + Basic Land Toggle ─────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border-subtle)]">
        {/* Search input */}
        <div className="relative max-w-[260px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-[13px] -translate-y-1/2"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          />
          <input
            type="text"
            placeholder="Search cards..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-md px-2.5 py-1.5 pl-[30px] text-[length:var(--fs-sm)] text-white placeholder:text-[rgba(255,255,255,0.2)]"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '0.5px solid rgba(255,255,255,0.1)',
            }}
            aria-label="Search cards by name"
          />
        </div>

        {/* Basic land filter toggle */}
        <button
          type="button"
          onClick={() => onBasicLandFilterChange(!basicLandFilter)}
          className={cn(
            'rounded-full px-2.5 py-[4px] text-[11px] transition-colors',
            basicLandFilter
              ? 'text-[#1D9E75]'
              : 'text-[rgba(255,255,255,0.35)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.5)]'
          )}
          style={{
            border: basicLandFilter
              ? '0.5px solid rgba(29,158,117,0.4)'
              : '0.5px solid rgba(255,255,255,0.1)',
            background: basicLandFilter ? 'rgba(29,158,117,0.1)' : undefined,
          }}
          aria-pressed={basicLandFilter}
          title={basicLandFilter ? 'Show basic lands' : 'Hide basic lands'}
        >
          Hide Basics
        </button>

        {/* Allocated filter toggle */}
        <button
          type="button"
          onClick={() => onAllocatedFilterChange(!allocatedFilter)}
          className={cn(
            'rounded-full px-2.5 py-[4px] text-[11px] transition-colors',
            allocatedFilter
              ? 'text-[#1D9E75]'
              : 'text-[rgba(255,255,255,0.35)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.5)]'
          )}
          style={{
            border: allocatedFilter
              ? '0.5px solid rgba(29,158,117,0.4)'
              : '0.5px solid rgba(255,255,255,0.1)',
            background: allocatedFilter ? 'rgba(29,158,117,0.1)' : undefined,
          }}
          aria-pressed={allocatedFilter}
          title={allocatedFilter ? 'Show all cards' : 'Show only allocated cards'}
        >
          Allocated
        </button>
      </div>

      {/* ─── Column Headers ──────────────────────────────────────── */}
      <div
        className="grid items-center px-[var(--row-h-pad)] py-1.5 border-b border-[var(--border-subtle)]"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((col) => {
          if (!col.sortable) {
            return <div key={col.key} />
          }
          return (
            <button
              key={col.key}
              type="button"
              onClick={() => handleSort(col.key as RollupSortField)}
              className={`flex w-full items-center text-[length:var(--fs-xs)] font-[number:var(--font-medium)] uppercase tracking-wide transition-colors hover:text-[var(--text-primary)] ${
                col.key === sortField
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)]'
              } ${col.align === 'right' ? 'justify-end' : 'justify-start'}`}
            >
              {col.label}
              <SortIndicator
                field={col.key}
                sortField={sortField}
                sortDirection={sortDirection}
              />
            </button>
          )
        })}
        {/* Status slot spacer */}
        <div />
      </div>

      {/* ─── Scrollable Row List ────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-[length:var(--fs-base)] text-[var(--text-tertiary)]">
              No cards match the current filters.
            </p>
          </div>
        ) : (
          rows.map((row, index) => (
            <RollupRow
              key={`${row.oracleId}-${index}`}
              oracleId={row.oracleId}
              cardName={row.cardName}
              ownedCount={row.ownedCount}
              proxyCount={row.proxyCount}
              allocatedCount={row.allocatedCount}
              shortfall={row.shortfall}
              isActive={row.oracleId === selectedOracleId}
              triState={getTriState(row.oracleId)}
              onRowClick={() => onRowClick(row.oracleId)}
              onCheckboxToggle={() => onCheckboxToggle(row.oracleId)}
            />
          ))
        )}
      </div>

      {/* ─── Footer: Row Count ───────────────────────────────────── */}
      <div className="flex items-center px-[var(--row-h-pad)] py-[var(--row-v-pad)] border-t border-[var(--border-subtle)]">
        <span className="text-[length:var(--fs-xs)] tabular-nums text-[var(--text-tertiary)]">
          {rows.length.toLocaleString()} cards
        </span>
      </div>
    </div>
  )
}
