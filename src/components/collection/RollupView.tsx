'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { useSelectionModel, type TriState } from '@/hooks/useSelectionModel'

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface RollupRow {
  oracleId: string
  cardName: string
  ownedCount: number
  proxyCount: number
  allocatedCount: number
  shortfall: number
  typeLine: string
}

interface RollupV2Response {
  rows: RollupRow[]
}

type SortField = 'cardName' | 'ownedCount' | 'proxyCount' | 'allocatedCount' | 'shortfall'
type SortDirection = 'asc' | 'desc'

export interface RollupViewProps {
  onRowSelect?: (oracleId: string) => void
}

/* ─── Column Widths ─────────────────────────────────────────────────── */

const COL = {
  gutter: 'w-[32px]',
  name: 'min-w-[240px] flex-1',
  owned: 'w-[80px]',
  proxy: 'w-[80px]',
  allocated: 'w-[100px]',
  shortfall: 'w-[90px]',
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
}: {
  label: string
  field: SortField
  align: 'left' | 'right'
  className: string
  shrink?: boolean
  sortField: SortField
  sortDirection: SortDirection
  onSort: (field: SortField) => void
}) {
  const isActive = field === sortField

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        className,
        shrink && 'shrink-0',
        'text-[length:var(--fs-xs)] font-medium uppercase tracking-wider cursor-pointer transition-colors hover:text-white/50',
        align === 'right' ? 'text-right' : 'text-left'
      )}
      style={{ color: isActive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)' }}
      aria-label={`Sort by ${label}${isActive ? `, currently ${sortDirection === 'asc' ? 'ascending' : 'descending'}` : ''}`}
    >
      <span className={cn('inline-flex items-center gap-0.5', align === 'right' && 'justify-end')}>
        {label}
        {isActive && (
          sortDirection === 'asc' ? (
            <ChevronUp className="size-3" aria-label="Sorted ascending" />
          ) : (
            <ChevronDown className="size-3" aria-label="Sorted descending" />
          )
        )}
      </span>
    </button>
  )
}

/* ─── RollupView ────────────────────────────────────────────────────── */

export function RollupView({ onRowSelect }: RollupViewProps) {
  const [sortField, setSortField] = useState<SortField>('cardName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [hideBasicLands, setHideBasicLands] = useState(true)

  const {
    getTriState,
    selectAllInstances,
    deselectAllInstances,
    toggleAllRollupRows,
  } = useSelectionModel()

  const { data, isLoading, error } = useQuery<RollupV2Response>({
    queryKey: ['collection', 'rollup-v2'],
    queryFn: async () => {
      const res = await fetch('/api/collection/rollup-v2')
      if (!res.ok) throw new Error('Failed to load rollup data')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDirection(field === 'cardName' ? 'asc' : 'desc')
      return field
    })
  }, [])

  const sortedRows = useMemo(() => {
    if (!data?.rows) return []

    let rows = data.rows

    // Filter basic lands when toggle is active
    if (hideBasicLands) {
      rows = rows.filter(r => !r.typeLine.includes('Basic Land'))
    }

    // Sort
    const dir = sortDirection === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sortField === 'cardName') {
        return a.cardName.localeCompare(b.cardName) * dir
      }
      return ((a[sortField] ?? 0) - (b[sortField] ?? 0)) * dir
    })
  }, [data, sortField, sortDirection, hideBasicLands])

  /* ─── Selection helpers ───────────────────────────────────────────── */

  /** Total instances for a row = ownedCount + proxyCount */
  const getTotalInstances = useCallback((row: RollupRow): number => {
    return row.ownedCount + row.proxyCount
  }, [])

  /**
   * Generate placeholder physical_copy_ids for a rollup row.
   * Since we don't have actual instance IDs at the rollup level,
   * we use sequential numbers 1..N as placeholders.
   * The BulkActionBar will resolve actual IDs when executing actions.
   */
  const getPlaceholderIds = useCallback((row: RollupRow): number[] => {
    const total = row.ownedCount + row.proxyCount
    return Array.from({ length: total }, (_, i) => i + 1)
  }, [])

  /** Handle per-row checkbox toggle */
  const handleRowCheckboxToggle = useCallback(
    (row: RollupRow) => {
      const total = getTotalInstances(row)
      const triState = getTriState(row.oracleId, total)

      if (triState === 'checked') {
        deselectAllInstances(row.oracleId)
      } else {
        // Select all instances for this oracle_id
        selectAllInstances(row.oracleId, getPlaceholderIds(row))
      }
    },
    [getTriState, getTotalInstances, selectAllInstances, deselectAllInstances, getPlaceholderIds]
  )

  /** Compute global "Select All" tri-state for all visible rows */
  const selectAllTriState = useMemo((): TriState => {
    if (sortedRows.length === 0) return 'unchecked'

    let allChecked = true
    let anyChecked = false

    for (const row of sortedRows) {
      const total = row.ownedCount + row.proxyCount
      const state = getTriState(row.oracleId, total)
      if (state === 'checked') {
        anyChecked = true
      } else if (state === 'indeterminate') {
        anyChecked = true
        allChecked = false
      } else {
        allChecked = false
      }
    }

    if (allChecked) return 'checked'
    if (anyChecked) return 'indeterminate'
    return 'unchecked'
  }, [sortedRows, getTriState])

  /** Handle "Select All" checkbox in the header */
  const handleSelectAll = useCallback(() => {
    const rows = sortedRows.map(row => ({
      oracleId: row.oracleId,
      physicalCopyIds: getPlaceholderIds(row),
    }))
    toggleAllRollupRows(rows)
  }, [sortedRows, toggleAllRollupRows, getPlaceholderIds])

  /* ─── Loading State ─────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="space-y-0">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}
            >
              <div className="h-3.5 flex-1 animate-pulse rounded" style={{ background: 'rgba(255,255,255,0.05)', maxWidth: '220px' }} />
              <div className="ml-auto h-3.5 w-16 animate-pulse rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  /* ─── Error State ───────────────────────────────────────────────── */

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-[length:var(--fs-md)]" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Failed to load collection rollup.
        </p>
      </div>
    )
  }

  /* ─── Render ────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar: Basic Land toggle */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}
      >
        <span className="text-[length:var(--fs-md)]" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {sortedRows.length} card{sortedRows.length !== 1 ? 's' : ''}
        </span>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-[length:var(--fs-xs)] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Hide Basic Lands
          </span>
          <Switch
            size="sm"
            checked={hideBasicLands}
            onCheckedChange={setHideBasicLands}
            aria-label="Hide Basic Land cards"
          />
        </label>
      </div>

      {/* Table header */}
      <div
        className="flex items-center px-4 py-2"
        style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '0.5px solid rgba(255,255,255,0.07)', gap: '12px' }}
      >
        {/* Select All checkbox */}
        <div className={cn(COL.gutter, 'shrink-0 flex items-center justify-center')}>
          <Checkbox
            checked={selectAllTriState === 'checked'}
            indeterminate={selectAllTriState === 'indeterminate'}
            onCheckedChange={handleSelectAll}
            aria-label="Select all visible rows"
          />
        </div>
        <SortableHeader label="Card Name" field="cardName" align="left" className={COL.name} shrink={false} sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
        <SortableHeader label="Owned" field="ownedCount" align="right" className={COL.owned} sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
        <SortableHeader label="Proxy" field="proxyCount" align="right" className={COL.proxy} sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
        <SortableHeader label="Allocated" field="allocatedCount" align="right" className={COL.allocated} sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
        <SortableHeader label="Shortfall" field="shortfall" align="right" className={COL.shortfall} sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
      </div>

      {/* Table rows */}
      <div className="flex-1 overflow-y-auto">
        {sortedRows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-[length:var(--fs-md)]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            No cards in collection.
          </div>
        ) : (
          sortedRows.map(row => {
            const totalInstances = getTotalInstances(row)
            const triState = getTriState(row.oracleId, totalInstances)

            return (
              <div
                key={row.oracleId}
                className={cn(
                  'group/row flex w-full items-center px-4 py-2 transition-colors hover:bg-[rgba(255,255,255,0.03)]',
                  row.shortfall > 0 && 'bg-[rgba(245,158,11,0.06)]'
                )}
                style={{
                  borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                  gap: '12px',
                  borderLeft: row.shortfall > 0
                    ? '2px solid rgba(245,158,11,0.5)'
                    : '2px solid transparent',
                }}
              >
                {/* Checkbox gutter — hidden by default, visible on hover or focus-within */}
                <div
                  className={cn(
                    COL.gutter,
                    'shrink-0 flex items-center justify-center',
                    'opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity'
                  )}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={triState === 'checked'}
                    indeterminate={triState === 'indeterminate'}
                    onCheckedChange={() => handleRowCheckboxToggle(row)}
                    aria-label={`Select ${row.cardName}`}
                  />
                </div>

                {/* Clickable row area — opens Instance Panel */}
                <button
                  type="button"
                  onClick={() => onRowSelect?.(row.oracleId)}
                  className="flex flex-1 items-center cursor-pointer text-left"
                  style={{ gap: '12px' }}
                  aria-label={`${row.cardName}${row.shortfall > 0 ? `, shortfall of ${row.shortfall}` : ''}`}
                >
                  {/* Card Name */}
                  <span
                    className={cn(COL.name, 'truncate text-[length:var(--fs-md)]')}
                    style={{ color: '#e8e8e6' }}
                    title={row.cardName.length > 40 ? row.cardName : undefined}
                  >
                    {row.cardName}
                    {row.shortfall > 0 && (
                      <AlertTriangle
                        className="ml-1.5 inline-block size-3"
                        style={{ color: 'rgba(245,158,11,0.8)' }}
                        aria-hidden="true"
                      />
                    )}
                  </span>

                  {/* Owned */}
                  <span className={cn(COL.owned, 'shrink-0 text-right text-[length:var(--fs-md)] tabular-nums')} style={{ color: '#e8e8e6' }}>
                    {row.ownedCount}
                  </span>

                  {/* Proxy */}
                  <span
                    className={cn(COL.proxy, 'shrink-0 text-right text-[length:var(--fs-md)] tabular-nums')}
                    style={{ color: row.proxyCount > 0 ? 'rgba(167,139,250,0.8)' : 'rgba(255,255,255,0.3)' }}
                  >
                    {row.proxyCount}
                  </span>

                  {/* Allocated */}
                  <span className={cn(COL.allocated, 'shrink-0 text-right text-[length:var(--fs-md)] tabular-nums')} style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {row.allocatedCount}
                  </span>

                  {/* Shortfall */}
                  <span
                    className={cn(COL.shortfall, 'shrink-0 text-right text-[length:var(--fs-md)] tabular-nums font-medium')}
                    style={{
                      color: row.shortfall > 0 ? 'rgba(245,158,11,0.9)' : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    {row.shortfall > 0 ? row.shortfall : '—'}
                  </span>
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
