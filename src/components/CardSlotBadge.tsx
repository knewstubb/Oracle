'use client'

import type { CardSlotStatus } from '@/lib/card-status'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardSlotBadgeProps {
  status: CardSlotStatus
  /** For claimed: which deck holds the card */
  heldBy?: { deckName: string; deckStatus: string } | null
  /** Display style: 'badge' for list views, 'border' for tile/grid views */
  variant?: 'badge' | 'border'
  className?: string
}

// ---------------------------------------------------------------------------
// Status Configuration
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  Exclude<CardSlotStatus, 'generic_land'>,
  { label: string; color: string; bg: string; dotStyle: 'solid' | 'dashed' | 'half' | 'crossed' | 'empty' }
> = {
  original: {
    label: 'Original',
    color: 'var(--signal-success)',
    bg: 'rgba(29, 158, 117, 0.12)',
    dotStyle: 'solid',
  },
  proxy: {
    label: 'Proxy',
    color: 'var(--signal-success)',
    bg: 'rgba(29, 158, 117, 0.06)',
    dotStyle: 'dashed',
  },
  open: {
    label: 'Open',
    color: 'var(--signal-warning)',
    bg: 'rgba(239, 159, 39, 0.10)',
    dotStyle: 'half',
  },
  claimed: {
    label: 'Claimed',
    color: 'var(--status-over)',
    bg: 'rgba(255, 95, 31, 0.12)',
    dotStyle: 'crossed',
  },
  unowned: {
    label: 'Unowned',
    color: 'var(--signal-critical)',
    bg: 'rgba(228, 75, 74, 0.10)',
    dotStyle: 'empty',
  },
}

// ---------------------------------------------------------------------------
// Dot Rendering
// ---------------------------------------------------------------------------

function StatusDot({ dotStyle, color }: { dotStyle: string; color: string }) {
  const baseClass = 'inline-block size-2 rounded-full'

  switch (dotStyle) {
    case 'solid':
      return (
        <span
          className={baseClass}
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      )
    case 'dashed':
      return (
        <span
          className={baseClass}
          style={{ border: `1.5px dashed ${color}` }}
          aria-hidden="true"
        />
      )
    case 'half':
      return (
        <span
          className={baseClass}
          style={{
            background: `linear-gradient(to right, ${color} 50%, transparent 50%)`,
            border: `1.5px solid ${color}`,
          }}
          aria-hidden="true"
        />
      )
    case 'crossed':
      return (
        <span
          className={`${baseClass} relative`}
          style={{ border: `1.5px solid ${color}` }}
          aria-hidden="true"
        >
          <span
            className="absolute inset-0 flex items-center justify-center text-[6px] font-bold leading-none"
            style={{ color }}
          >
            ×
          </span>
        </span>
      )
    case 'empty':
      return (
        <span
          className={baseClass}
          style={{ border: `1.5px solid ${color}` }}
          aria-hidden="true"
        />
      )
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Badge Component
// ---------------------------------------------------------------------------

/**
 * Unified badge component for the five-state card slot taxonomy.
 * Used in Cards Tab, Builder search, and Picklist.
 *
 * For 'claimed' status, shows a "Claimed by [deck]" subtext line.
 * For 'generic_land' status, renders nothing (exempt from taxonomy display).
 */
export function CardSlotBadge({ status, heldBy, variant = 'badge', className }: CardSlotBadgeProps) {
  // Generic land: no badge rendered
  if (status === 'generic_land') return null

  const config = STATUS_CONFIG[status]

  // Border variant: no-op as a component (borders applied via getSlotTileBorderStyle)
  if (variant === 'border') return null

  return (
    <span className={`inline-flex flex-col items-end gap-0.5 ${className ?? ''}`}>
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium"
        style={{ color: config.color, backgroundColor: config.bg }}
        aria-label={`Status: ${config.label}`}
      >
        <StatusDot dotStyle={config.dotStyle} color={config.color} />
        {config.label}
      </span>
      {status === 'claimed' && heldBy && (
        <span className="max-w-[20ch] truncate text-[length:var(--fs-xs)] text-muted-foreground">
          Claimed by {heldBy.deckName}
        </span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Border Style (for Grid View tiles)
// ---------------------------------------------------------------------------

/**
 * Returns the CSS border style for a card tile in the grid view.
 * Same color system as the badge, expressed as border properties.
 */
export function getSlotTileBorderStyle(status: CardSlotStatus): React.CSSProperties {
  if (status === 'generic_land') {
    return { border: '1px solid var(--border-default)' }
  }

  const config = STATUS_CONFIG[status]

  switch (status) {
    case 'original':
      return { border: `2.5px solid ${config.color}` }
    case 'proxy':
      return { border: `2.5px dashed ${config.color}` }
    case 'open':
      return { border: `2.5px solid ${config.color}` }
    case 'claimed':
      return { border: `2.5px solid ${config.color}` }
    case 'unowned':
      return { border: `2.5px solid ${config.color}` }
    default:
      return { border: '1px solid var(--border-default)' }
  }
}
