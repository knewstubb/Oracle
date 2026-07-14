'use client'

import { useRef, useEffect } from 'react'
import { AlertTriangle, Check, Circle } from 'lucide-react'

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface RollupRowProps {
  oracleId: string
  cardName: string
  ownedCount: number
  proxyCount: number
  allocatedCount: number
  shortfall: number
  isActive: boolean
  triState: 'checked' | 'unchecked' | 'indeterminate'
  onRowClick: () => void
  onCheckboxToggle: () => void
}

/* ─── RollupRow ─────────────────────────────────────────────────────── */

export function RollupRow({
  oracleId,
  cardName,
  ownedCount,
  proxyCount,
  allocatedCount,
  shortfall,
  isActive,
  triState,
  onRowClick,
  onCheckboxToggle,
}: RollupRowProps) {
  const checkboxRef = useRef<HTMLInputElement>(null)

  // Sync the indeterminate DOM property via ref
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = triState === 'indeterminate'
    }
  }, [triState])

  return (
    <div
      className={`group grid w-full items-center px-[var(--row-h-pad)] h-[var(--row-height)] border-b border-[var(--border-subtle)] transition-colors ${
        isActive ? 'bg-[var(--border-subtle)]' : ''
      }`}
      style={{
        gridTemplateColumns: '32px 1fr 70px 70px 70px 70px var(--status-slot-width)',
      }}
      data-oracle-id={oracleId}
    >
      {/* ─── Checkbox Gutter (separate click zone) ─────────────── */}
      <div
        className="flex items-center justify-center"
        onClick={(e) => {
          e.stopPropagation()
          onCheckboxToggle()
        }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            onCheckboxToggle()
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Select ${cardName}`}
      >
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={triState === 'checked'}
          onChange={onCheckboxToggle}
          onClick={(e) => e.stopPropagation()}
          aria-checked={triState === 'indeterminate' ? 'mixed' : triState === 'checked'}
          aria-label={`Select ${cardName}`}
          className="size-[14px] cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
          style={{ accentColor: '#6366f1' }}
        />
      </div>

      {/* ─── Row Body (opens detail panel on click) ────────────── */}
      <div
        className="col-span-6 grid h-full cursor-pointer"
        style={{ gridTemplateColumns: '1fr 70px 70px 70px 70px var(--status-slot-width)', alignItems: 'center' }}
        onClick={onRowClick}
        role="button"
        tabIndex={0}
        aria-label={`View details for ${cardName}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onRowClick()
          } else if (e.key === ' ') {
            e.preventDefault()
            onCheckboxToggle()
          }
        }}
      >
        {/* Card name */}
        <span className="truncate text-[length:var(--fs-base)] font-[number:var(--font-medium)] text-[var(--text-primary)]">
          {cardName}
        </span>

        {/* Owned */}
        <div style={{ textAlign: 'right' }} className="text-[length:var(--fs-base)] tabular-nums text-[var(--text-secondary)]">
          {ownedCount}
        </div>

        {/* Proxy */}
        <div style={{ textAlign: 'right' }} className={`text-[length:var(--fs-base)] tabular-nums ${
          proxyCount > 0 && allocatedCount > 0 ? 'text-[var(--status-proxy)]' : 'text-[var(--text-secondary)]'
        }`}>
          {proxyCount}
        </div>

        {/* Allocated */}
        <div style={{ textAlign: 'right' }} className="text-[length:var(--fs-base)] tabular-nums text-[var(--text-secondary)]">
          {allocatedCount}
        </div>

        {/* Shortfall */}
        <div
          style={{ textAlign: 'right' }}
          className={`text-[length:var(--fs-base)] tabular-nums font-[number:var(--font-medium)] ${
            shortfall > 0 ? 'text-[var(--status-over)]' : 'text-[var(--text-secondary)]'
          }`}
        >
          {shortfall}
        </div>

        {/* Status slot — allocation state icon */}
        <div className="w-[var(--status-slot-width)] flex items-center justify-center">
          <AllocationStatusIcon
            ownedCount={ownedCount}
            proxyCount={proxyCount}
            allocatedCount={allocatedCount}
            shortfall={shortfall}
          />
        </div>
      </div>
    </div>
  )
}


/* ─── AllocationStatusIcon ──────────────────────────────────────────── */

/**
 * Determines and renders the correct status icon for a rollup row.
 * Priority order (first match wins):
 * 1. Shortfall > 0 → Alert triangle (--status-over)
 * 2. Proxy in use (proxyCount > 0 AND allocated to a deck) → Mask icon (--status-proxy)
 * 3. Fully allocated (allocatedCount >= ownedCount + proxyCount, allocatedCount > 0) → Checkmark
 * 4. Partially allocated (allocatedCount > 0 but not full) → Half circle (--status-partial)
 * 5. Unallocated (allocatedCount === 0) → Dashed circle (--text-tertiary)
 */
function AllocationStatusIcon({
  ownedCount,
  proxyCount,
  allocatedCount,
  shortfall,
}: {
  ownedCount: number
  proxyCount: number
  allocatedCount: number
  shortfall: number
}) {
  const totalSupply = ownedCount + proxyCount

  // 1. Over-allocated / shortfall
  if (shortfall > 0) {
    return <AlertTriangle className="size-3.5" style={{ color: 'var(--status-over)' }} aria-label="Over-allocated" />
  }

  // 2. Proxy in use in a deck
  if (proxyCount > 0 && allocatedCount > 0) {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-label="Proxy in use" style={{ color: 'var(--status-proxy)' }}>
        <circle cx="8" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M4 12c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <rect x="3" y="4" width="10" height="3" rx="1" fill="currentColor" opacity="0.3" />
      </svg>
    )
  }

  // 3. Fully allocated
  if (allocatedCount > 0 && allocatedCount >= totalSupply) {
    return <Check className="size-3.5 text-[var(--text-secondary)]" aria-label="Fully allocated" />
  }

  // 4. Partially allocated
  if (allocatedCount > 0 && allocatedCount < totalSupply) {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-label="Partially allocated" style={{ color: 'var(--status-partial)' }}>
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M8 2a6 6 0 0 1 0 12" fill="currentColor" opacity="0.6" />
      </svg>
    )
  }

  // 5. Unallocated
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-label="Unallocated" style={{ color: 'var(--text-tertiary)' }}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
    </svg>
  )
}
