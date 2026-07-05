'use client'

import { useState, useCallback } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { CardImage } from '@/components/CardImage'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type {
  CollectionRollupRowWithPrice,
  PrintingSubgroupRow,
} from '@/hooks/useCollectionRollup'

/* ─── Types ─────────────────────────────────────────────────────────── */

interface CollectionGridViewProps {
  rows: CollectionRollupRowWithPrice[]
  /** Lazily fetches printing subgroup details for a card_definition */
  onExpand?: (cardDefinitionId: number) => Promise<PrintingSubgroupRow[]>
  isLoading?: boolean
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

function formatPrice(price: number | null, isBasicLand: boolean): string {
  if (isBasicLand || price === null) return '—'
  return `$${price.toFixed(2)} to add`
}

function formatOwnedValuation(price: number | null): string {
  if (price === null) return '—'
  return `$${price.toFixed(2)}`
}

/* ─── Loading Skeleton ──────────────────────────────────────────────── */

function GridSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      role="list"
      aria-label="Loading collection grid"
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="space-y-2" role="listitem">
          <Skeleton className="aspect-[5/7] w-full rounded-lg" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

/* ─── Printing Subgroup Detail Panel ────────────────────────────────── */

function PrintingDetail({
  subgroups,
  onClose,
}: {
  subgroups: PrintingSubgroupRow[]
  onClose: () => void
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '0.5px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          className="text-[10px] font-medium uppercase tracking-wider"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          Printings
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 transition-colors hover:bg-[rgba(255,255,255,0.08)]"
          aria-label="Close printing details"
        >
          <X className="size-3" style={{ color: 'rgba(255,255,255,0.4)' }} />
        </button>
      </div>
      <div className="space-y-1.5">
        {subgroups.map((sg) => (
          <div
            key={sg.physicalCopyId}
            className="flex items-center justify-between rounded px-2 py-1.5 text-[11px]"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {sg.setName}
                </span>
                <span
                  className="shrink-0 rounded px-1 py-px text-[9px] font-medium uppercase"
                  style={{
                    color: 'rgba(255,255,255,0.4)',
                    background: 'rgba(255,255,255,0.06)',
                  }}
                >
                  {sg.setCode}
                </span>
                {sg.isFoil && (
                  <span
                    className="shrink-0 rounded px-1 py-px text-[9px] font-medium"
                    style={{
                      color: '#a78bfa',
                      background: 'rgba(167,139,250,0.1)',
                    }}
                  >
                    Foil
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 pl-2">
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                ×{sg.quantity}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                {sg.inUseCount} used
              </span>
              <span
                className="min-w-[52px] text-right font-mono"
                style={{ color: sg.ownedValuation !== null ? '#1D9E75' : 'rgba(255,255,255,0.25)' }}
              >
                {formatOwnedValuation(sg.ownedValuation)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Card Grid Tile ────────────────────────────────────────────────── */

function CardGridTile({
  row,
  onExpand,
}: {
  row: CollectionRollupRowWithPrice
  onExpand?: (cardDefinitionId: number) => Promise<PrintingSubgroupRow[]>
}) {
  const [expanded, setExpanded] = useState(false)
  const [subgroups, setSubgroups] = useState<PrintingSubgroupRow[] | null>(null)
  const [loadingExpand, setLoadingExpand] = useState(false)

  const handleToggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false)
      return
    }

    // If we already have subgroups cached, just toggle
    if (subgroups) {
      setExpanded(true)
      return
    }

    // Lazy fetch subgroups
    if (onExpand) {
      setLoadingExpand(true)
      try {
        const data = await onExpand(row.cardDefinitionId)
        setSubgroups(data)
        setExpanded(true)
      } catch {
        // Silently fail — user can retry
      } finally {
        setLoadingExpand(false)
      }
    }
  }, [expanded, subgroups, onExpand, row.cardDefinitionId])

  // Use the first printing's scryfall ID for art, or fall back to oracle ID
  const artId =
    row.printingSubgroups?.[0]?.scryfallPrintingId ?? row.oracleId

  return (
    <div
      className={cn(
        'group/tile flex flex-col overflow-hidden rounded-lg transition-all duration-150',
        'hover:shadow-lg',
        'motion-reduce:transition-none',
        expanded && 'col-span-2 row-span-2 sm:col-span-2'
      )}
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '0.5px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Card art */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={loadingExpand}
        className="relative w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D9E75] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0f0f]"
        aria-expanded={expanded}
        aria-label={`${row.cardName} — tap to ${expanded ? 'collapse' : 'expand'} printing details`}
      >
        {artId ? (
          <CardImage
            scryfallId={artId}
            alt={row.cardName}
            width={244}
            height={340}
            className="aspect-[5/7] w-full rounded-t-lg object-cover"
            noPreview
          />
        ) : (
          <div
            className="flex aspect-[5/7] w-full items-center justify-center rounded-t-lg text-xs"
            style={{
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.3)',
            }}
            role="img"
            aria-label={row.cardName}
          >
            {row.cardName}
          </div>
        )}

        {/* Expand indicator overlay */}
        <div
          className={cn(
            'absolute bottom-1.5 right-1.5 rounded-full p-0.5 transition-opacity',
            'opacity-0 group-hover/tile:opacity-100',
            loadingExpand && 'animate-pulse opacity-100'
          )}
          style={{ background: 'rgba(0,0,0,0.6)' }}
          aria-hidden="true"
        >
          {expanded ? (
            <ChevronUp className="size-3.5 text-white" />
          ) : (
            <ChevronDown className="size-3.5 text-white" />
          )}
        </div>
      </button>

      {/* Card info */}
      <div className="flex flex-1 flex-col gap-0.5 px-2.5 py-2">
        <span
          className="truncate text-xs font-medium"
          style={{ color: '#e8e8e6' }}
          title={row.cardName}
        >
          {row.cardName}
        </span>

        <div className="flex items-center justify-between text-[10px]">
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>
            Owned: {row.ownedQuantity}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>
            Used: {row.inUseCount}
          </span>
        </div>

        <span
          className="mt-0.5 text-[10px] font-mono"
          style={{
            color:
              row.priceToAdd !== null && !row.isBasicLand
                ? '#1D9E75'
                : 'rgba(255,255,255,0.25)',
          }}
        >
          {formatPrice(row.priceToAdd, row.isBasicLand)}
        </span>
      </div>

      {/* Expanded printing subgroups */}
      {expanded && subgroups && (
        <div className="px-2 pb-2">
          <PrintingDetail
            subgroups={subgroups}
            onClose={() => setExpanded(false)}
          />
        </div>
      )}
    </div>
  )
}

/* ─── Main Grid View ────────────────────────────────────────────────── */

export function CollectionGridView({
  rows,
  onExpand,
  isLoading,
}: CollectionGridViewProps) {
  if (isLoading) {
    return <GridSkeleton />
  }

  if (rows.length === 0) {
    return (
      <div
        className="flex min-h-[200px] items-center justify-center"
        role="status"
      >
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
          No cards match your filters.
        </p>
      </div>
    )
  }

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      role="list"
      aria-label="Collection card grid"
    >
      {rows.map((row) => (
        <div key={row.cardDefinitionId} role="listitem">
          <CardGridTile row={row} onExpand={onExpand} />
        </div>
      ))}
    </div>
  )
}
