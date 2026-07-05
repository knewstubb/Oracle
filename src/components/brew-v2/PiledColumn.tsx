'use client'

import type { DeckCard } from '@/lib/brew-v2-types'
import { GenericLandBadge } from '@/components/generic-land-badge'
import { categoryPrimaryColour } from '@/lib/categoryColour'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PiledColumnProps {
  category: string
  cards: DeckCard[]
  healthStatus: 'healthy' | 'low' | 'high' | 'unmonitored'
  onDragIn: (cardName: string) => void
  isDragTarget: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLUMN_WIDTH = 150

/** Health status → icon */
const HEALTH_ICONS: Record<PiledColumnProps['healthStatus'], string | null> = {
  healthy: '✓',
  low: '⚠',
  high: '⚠',
  unmonitored: null,
}

/** Health status → colour class */
const HEALTH_COLOURS: Record<PiledColumnProps['healthStatus'], string> = {
  healthy: 'text-emerald-400',
  low: 'text-amber-400',
  high: 'text-red-400',
  unmonitored: '',
}

/** Ownership status → dot colour */
const OWNERSHIP_DOT_COLOURS: Record<DeckCard['ownership_status'], string> = {
  original: '#2dd4bf',
  proxy: '#f97316',
  not_owned: '#6b7280',
  generic: '#818cf8',
}

// ---------------------------------------------------------------------------
// PiledColumn — Kanban-style column for Piled mode
// ---------------------------------------------------------------------------

/**
 * Renders a single category column in Piled mode (150px wide).
 *
 * Header: category name (uppercase) + card count + health icon (when monitored)
 * Body: compact name-view card rows (ownership dot + truncated name)
 *
 * Drag behavior:
 * - Each card row is draggable (handled by parent via `getPointerProps`)
 * - Dropping a card from another column into this column calls `onDragIn`
 * - Dropping within the same column is a no-op (handled by parent logic)
 *
 * Visual cues:
 * - When `isDragTarget` is true (card being dragged over), the column gets
 *   a blue dashed highlight border
 * - Dragging source card renders at 0.4 opacity (handled by parent via isDragging prop)
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
export function PiledColumn({
  category,
  cards,
  healthStatus,
  isDragTarget,
}: PiledColumnProps) {
  const healthIcon = HEALTH_ICONS[healthStatus]
  const healthColour = HEALTH_COLOURS[healthStatus]

  return (
    <div
      className="flex flex-col shrink-0"
      style={{ width: COLUMN_WIDTH }}
      data-testid={`piled-column-${category}`}
      data-category={category}
    >
      {/* Column container */}
      <div
        className="flex flex-col rounded-lg h-full overflow-hidden transition-colors duration-150"
        style={{
          background: 'rgba(25, 25, 35, 0.9)',
          border: isDragTarget
            ? '2px dashed rgba(55, 138, 221, 0.8)'
            : '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: isDragTarget
            ? '0 0 12px rgba(55, 138, 221, 0.2)'
            : '0 2px 8px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Header: category name + count + health icon */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[rgba(255,255,255,0.06)]">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-[rgba(255,255,255,0.7)] truncate flex-1">
            {category}
          </span>

          <span className="text-[9px] text-[rgba(255,255,255,0.4)] tabular-nums shrink-0">
            {cards.length}
          </span>

          {healthIcon && (
            <span
              className={`text-[10px] shrink-0 ${healthColour}`}
              aria-label={`Health: ${healthStatus}`}
              title={`Category health: ${healthStatus}`}
            >
              {healthIcon}
            </span>
          )}
        </div>

        {/* Card rows — compact name-view */}
        <div className="flex flex-col gap-0.5 p-1 overflow-y-auto flex-1 min-h-0">
          {cards.map((card) => (
            <PiledCardRow key={card.card_name} card={card} />
          ))}

          {cards.length === 0 && (
            <div className="flex items-center justify-center py-3">
              <span className="text-[8px] text-[rgba(255,255,255,0.25)] italic">
                Empty
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PiledCardRow — compact name-view card row within a column
// ---------------------------------------------------------------------------

export interface PiledCardRowProps {
  card: DeckCard
  isDragging?: boolean
  pointerProps?: { onPointerDown: (e: React.PointerEvent) => void }
  /** Resolved art URL for generic land slots (from useGenericLandPreferences) */
  genericLandArtUrl?: string | null
}

/**
 * A single card row in compact name-view format: ownership dot + card name (truncated).
 * Each row is draggable via pointer events from useCanvasDrag.
 *
 * While dragging, source card renders at 0.4 opacity (ghost).
 */
export function PiledCardRow({
  card,
  isDragging = false,
  pointerProps,
  genericLandArtUrl,
}: PiledCardRowProps) {
  const dotColour = OWNERSHIP_DOT_COLOURS[card.ownership_status]

  return (
    <div
      className="flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded transition-opacity"
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        borderLeft: `3px solid ${categoryPrimaryColour(card.primary_category)}`,
        opacity: isDragging ? 0.4 : 1,
        cursor: pointerProps ? 'grab' : 'default',
      }}
      data-testid={`piled-card-row-${card.card_name}`}
      data-card-name={card.card_name}
      {...(pointerProps ?? {})}
    >
      {/* Ownership dot */}
      <span
        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: dotColour }}
        aria-label={`Ownership: ${card.ownership_status}`}
      />

      {/* Card name — truncated */}
      <span className="text-[9px] text-[rgba(255,255,255,0.85)] truncate flex-1 leading-tight">
        {card.card_name}
      </span>

      {/* Generic land badge — compact in piled mode */}
      {card.is_generic_land && (
        <GenericLandBadge
          landType={card.card_name}
          artUrl={genericLandArtUrl}
          className="text-[7px] px-1 py-0 shrink-0"
        />
      )}
    </div>
  )
}
