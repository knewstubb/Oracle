'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CardArtPreview } from '@/components/CardArtPreview'
import type {
  CollectionRollupRowWithPrice,
  PrintingSubgroupRow,
  DeckUsageEntry,
  ExpandResult,
} from '@/hooks/useCollectionRollup'

/* ─── Types ─────────────────────────────────────────────────────────── */

interface CollectionListViewProps {
  rows: CollectionRollupRowWithPrice[]
  expand: (cardDefinitionId: number) => Promise<ExpandResult>
}

/* ─── Price Formatting ──────────────────────────────────────────────── */

/**
 * Formats a card-level price as "$X.XX to add" or "—" if null/basic land.
 */
function formatPriceToAdd(price: number | null, isBasicLand: boolean): string {
  if (isBasicLand || price === null) return '—'
  return `$${price.toFixed(2)} to add`
}

/**
 * Formats a printing-level valuation as "$X.XX" or "—" if null/basic land.
 */
function formatOwnedValuation(price: number | null, isBasicLand: boolean): string {
  if (isBasicLand || price === null) return '—'
  return `$${price.toFixed(2)}`
}

/* ─── DeckUsageList ─────────────────────────────────────────────────── */

function DeckUsageList({ deckUsage }: { deckUsage: DeckUsageEntry[] }) {
  if (deckUsage.length === 0) {
    return (
      <div
        className="px-4 py-2 text-[11px] italic"
        style={{ color: 'rgba(255,255,255,0.25)' }}
      >
        Not used in any deck
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {deckUsage.map((entry) => (
        <div
          key={entry.deckId}
          className="flex items-center gap-3 px-4 py-1.5"
          style={{ borderTop: '0.5px solid rgba(255,255,255,0.03)' }}
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: '#1D9E75' }}
          />
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {entry.deckName}
          </span>
          <span
            className="ml-auto text-[11px] tabular-nums"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            ×{entry.quantity}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ─── PrintingSubgroupRow ───────────────────────────────────────────── */

function PrintingSubgroupRowComponent({
  subgroup,
  isBasicLand,
}: {
  subgroup: PrintingSubgroupRow
  isBasicLand: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      {/* Subgroup row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-[rgba(255,255,255,0.02)]"
        style={{ borderTop: '0.5px solid rgba(255,255,255,0.04)' }}
        aria-expanded={expanded}
        aria-label={`${subgroup.setName} (${subgroup.setCode.toUpperCase()})${subgroup.isFoil ? ' Foil' : ''} — expand for deck usage`}
      >
        {/* Indent + chevron */}
        <div className="ml-6 flex items-center gap-2">
          <ChevronRight
            className={cn(
              'size-3 shrink-0 transition-transform duration-150',
              expanded && 'rotate-90'
            )}
            style={{ color: 'rgba(255,255,255,0.2)' }}
            aria-hidden="true"
          />

          {/* Set code + name with hover preview */}
          <CardArtPreview
            scryfallId={subgroup.scryfallPrintingId}
            cardName={`${subgroup.setName} printing`}
          >
            <span className="flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {subgroup.setCode}
              </span>
              <span className="text-[length:var(--fs-base)]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {subgroup.setName}
              </span>
            </span>
          </CardArtPreview>
          {subgroup.isFoil && (
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
          )}
        </div>

        {/* Quantity */}
        <span
          className="ml-auto min-w-[50px] text-right text-[length:var(--fs-base)] tabular-nums"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          {subgroup.quantity}
        </span>

        {/* In-use */}
        <span
          className="min-w-[50px] text-right text-[length:var(--fs-base)] tabular-nums"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          {subgroup.inUseCount}
        </span>

        {/* Owned Valuation */}
        <span
          className="min-w-[90px] text-right text-[length:var(--fs-base)] tabular-nums"
          style={{
            color: isBasicLand || subgroup.ownedValuation === null
              ? 'rgba(255,255,255,0.2)'
              : 'rgba(255,255,255,0.5)',
          }}
        >
          {formatOwnedValuation(subgroup.ownedValuation, isBasicLand)}
        </span>
      </button>

      {/* Deck usage drill-down */}
      {expanded && (
        <div
          className="ml-12"
          style={{ background: 'rgba(255,255,255,0.01)' }}
        >
          <DeckUsageList deckUsage={subgroup.deckUsage} />
        </div>
      )}
    </div>
  )
}

/* ─── CardRollupRow ─────────────────────────────────────────────────── */

function CardRollupRow({
  row,
  expand,
}: {
  row: CollectionRollupRowWithPrice
  expand: (cardDefinitionId: number) => Promise<ExpandResult>
}) {
  const [expanded, setExpanded] = useState(false)

  // Use inline subgroups from the rollup data (already available, no lazy load needed)
  const subgroups = row.printingSubgroups

  // Aggregate deck usage across all subgroups for card-level display
  const allDeckUsage = subgroups.flatMap(sg => sg.deckUsage)
  const uniqueDecks = Array.from(
    new Map(allDeckUsage.map(d => [d.deckId, d])).values()
  )

  return (
    <div>
      {/* Card-level row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors',
          'hover:bg-[rgba(255,255,255,0.02)]',
          expanded && 'bg-[rgba(255,255,255,0.015)]'
        )}
        style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}
        aria-expanded={expanded}
        aria-label={`${row.cardName} — ${row.ownedQuantity} owned, ${row.inUseCount} in use`}
      >
        {/* Expand chevron */}
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 transition-transform duration-150',
            expanded && 'rotate-90'
          )}
          style={{ color: 'rgba(255,255,255,0.25)' }}
          aria-hidden="true"
        />

        {/* Card name with hover preview */}
        <span className="min-w-0 flex-1 truncate text-[length:var(--fs-base)] font-medium" style={{ color: '#e8e8e6' }}>
          <CardArtPreview
            scryfallId={row.printingSubgroups[0]?.scryfallPrintingId || ''}
            cardName={row.cardName}
          >
            {row.cardName}
          </CardArtPreview>
        </span>

        {/* Owned quantity */}
        <span
          className="min-w-[50px] text-right text-[length:var(--fs-base)] tabular-nums"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          {row.ownedQuantity}
        </span>

        {/* In-use count */}
        <span
          className={cn(
            'min-w-[50px] text-right text-[length:var(--fs-base)] tabular-nums',
          )}
          style={{
            color: row.inUseCount > row.ownedQuantity
              ? '#EF9F27'
              : row.inUseCount > 0
                ? 'rgba(255,255,255,0.5)'
                : 'rgba(255,255,255,0.35)',
          }}
        >
          {row.inUseCount}
        </span>

        {/* Price_To_Add */}
        <span
          className="min-w-[110px] text-right text-[length:var(--fs-base)] tabular-nums"
          style={{
            color: row.isBasicLand || row.priceToAdd === null
              ? 'rgba(255,255,255,0.2)'
              : '#1D9E75',
          }}
        >
          {formatPriceToAdd(row.priceToAdd, row.isBasicLand)}
        </span>
      </button>

      {/* Expanded: Deck usage + Printing subgroups */}
      {expanded && (
        <div
          style={{
            background: 'rgba(255,255,255,0.01)',
            borderBottom: '0.5px solid rgba(255,255,255,0.04)',
          }}
        >
          {/* Deck usage at card level */}
          {uniqueDecks.length > 0 && (
            <div className="ml-6 py-1.5">
              <div className="flex flex-wrap gap-x-3 gap-y-1 px-4">
                {uniqueDecks.map((deck) => (
                  <span
                    key={deck.deckId}
                    className="flex items-center gap-1.5 text-[11px]"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: '#1D9E75' }}
                    />
                    {deck.deckName}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Printing subgroups */}
          {subgroups.map((subgroup) => (
            <PrintingSubgroupRowComponent
              key={subgroup.physicalCopyId}
              subgroup={subgroup}
              isBasicLand={row.isBasicLand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── CollectionListView ────────────────────────────────────────────── */

export function CollectionListView({ rows, expand }: CollectionListViewProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Table header */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{
          background: 'rgba(255,255,255,0.02)',
          borderBottom: '0.5px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Spacer for chevron */}
        <div className="w-3.5 shrink-0" />

        <span
          className="min-w-0 flex-1 text-[length:var(--fs-xs)] font-medium uppercase tracking-wider"
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          Card
        </span>
        <span
          className="min-w-[50px] text-right text-[length:var(--fs-xs)] font-medium uppercase tracking-wider"
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          Owned
        </span>
        <span
          className="min-w-[50px] text-right text-[length:var(--fs-xs)] font-medium uppercase tracking-wider"
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          In Use
        </span>
        <span
          className="min-w-[110px] text-right text-[length:var(--fs-xs)] font-medium uppercase tracking-wider"
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          Price
        </span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div
            className="flex items-center justify-center py-16 text-[length:var(--fs-sm)]"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            No cards match your filters.
          </div>
        ) : (
          rows.map((row) => (
            <CardRollupRow key={row.cardDefinitionId} row={row} expand={expand} />
          ))
        )}
      </div>
    </div>
  )
}
