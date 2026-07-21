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
// Status Configuration — Material Symbol icons
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  Exclude<CardSlotStatus, 'generic_land'>,
  { label: string; color: string; bg: string; icon: string; filled: boolean }
> = {
  original: {
    label: 'Original',
    color: 'var(--signal-success)',
    bg: 'rgba(29, 158, 117, 0.12)',
    icon: 'circle',
    filled: true,
  },
  proxy: {
    label: 'Proxy',
    color: '#489ADE',
    bg: '#1C252B',
    icon: 'comedy_mask',
    filled: true,
  },
  available: {
    label: 'Available',
    color: 'var(--text-secondary)',
    bg: 'rgba(255, 255, 255, 0.06)',
    icon: 'circle',
    filled: false,
  },
  claimed: {
    label: 'Claimed',
    color: '#F5880B',
    bg: 'rgba(245, 136, 11, 0.08)',
    icon: 'lock',
    filled: false,
  },
  unowned: {
    label: 'Unowned',
    color: '#EF44BF',
    bg: 'rgba(239, 68, 191, 0.08)',
    icon: 'do_not_disturb_on',
    filled: false,
  },
}

// ---------------------------------------------------------------------------
// Status Icon — Material Symbol
// ---------------------------------------------------------------------------

function StatusIcon({ icon, filled, color }: { icon: string; filled: boolean; color: string }) {
  return (
    <span
      className="material-symbols-outlined inline-flex items-center justify-center"
      style={{
        fontSize: '14px',
        color,
        fontVariationSettings: filled ? "'FILL' 1, 'wght' 400, 'opsz' 20" : "'FILL' 0, 'wght' 300, 'opsz' 20",
      }}
      aria-hidden="true"
    >
      {icon}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Badge Component
// ---------------------------------------------------------------------------

/**
 * Unified badge component for the five-state card slot taxonomy.
 * Uses Material Symbol icons for status indication.
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
    <span className={`inline-flex flex-col items-start gap-0.5 ${className ?? ''}`}>
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium transition-all duration-150 cursor-pointer hover:brightness-125 hover:scale-105"
        style={{ color: config.color, backgroundColor: config.bg }}
        aria-label={`Status: ${config.label}`}
      >
        <StatusIcon icon={config.icon} filled={config.filled} color={config.color} />
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
    case 'available':
      return { border: `2.5px solid ${config.color}` }
    case 'claimed':
      return { border: `2.5px solid ${config.color}` }
    case 'unowned':
      return { border: `2.5px solid ${config.color}` }
    default:
      return { border: '1px solid var(--border-default)' }
  }
}
