'use client'

import type { CardSlotStatus } from '@/lib/card-status'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardSlotBadgeProps {
  status: CardSlotStatus
  /** For claimed: which deck holds the card */
  heldBy?: { deckName: string; deckStatus: string } | null
  /** Display style: 'badge' for list views, 'border' for tile/grid views, 'icon' for compact icon-only */
  variant?: 'badge' | 'border' | 'icon'
  /** Size for icon variant: 'sm' (18px default), 'md' (24px for grid view) */
  size?: 'sm' | 'md'
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
    icon: 'check',
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
    color: '#1D9E75',
    bg: '#223736',
    icon: 'circle',
    filled: false,
  },
  alternate: {
    label: 'Alternate',
    color: 'var(--text-secondary)',
    bg: '#223736',
    icon: 'swap_horiz',
    filled: false,
  },
  claimed: {
    label: 'In decks',
    color: '#F5880B',
    bg: 'rgba(245, 136, 11, 0.08)',
    icon: 'deployed_code',
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

function StatusIcon({ icon, color }: { icon: string; color: string }) {
  return (
    <span
      className="material-symbols-outlined inline-flex items-center justify-center"
      style={{
        fontSize: '14px',
        width: '14px',
        height: '14px',
        color,
        fontVariationSettings: "'FILL' 0, 'wght' 400, 'opsz' 20",
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
 * Variants:
 * - 'badge': Full pill with icon and label text
 * - 'icon': Compact 22px circular icon only
 * - 'border': No-op (borders applied via getSlotTileBorderStyle)
 *
 * For 'claimed' status with 'badge' variant, shows a "In [deck]" subtext line.
 * For 'generic_land' status, renders nothing (exempt from taxonomy display).
 */
export function CardSlotBadge({ status, heldBy, variant = 'badge', size = 'sm', className }: CardSlotBadgeProps) {
  // Generic land: no badge rendered
  if (status === 'generic_land') return null

  const config = STATUS_CONFIG[status]

  // Border variant: no-op as a component (borders applied via getSlotTileBorderStyle)
  if (variant === 'border') return null

  // Icon-only variant: circular badge with 0.5px border
  if (variant === 'icon') {
    const isOriginal = status === 'original'
    const isProxy = status === 'proxy'
    const isAvailable = status === 'available'
    
    // Badge size and icon sizing based on size prop
    const badgeSize = size === 'md' ? 24 : 18
    const iconSize = size === 'md' ? 16 : 12
    const innerCircleSize = size === 'md' ? 14 : 10
    const borderWidth = 0.5
    
    // Common hover classes for all icon badges
    const hoverClasses = 'transition-all duration-150 cursor-pointer hover:brightness-125 hover:scale-110'
    
    // Common base classes for centering
    const baseClasses = `grid place-items-center rounded-full shrink-0 ${hoverClasses}`
    
    // Icon style shared by all icon variants — uses 24 optical size for crisp rendering
    const iconStyle: React.CSSProperties = {
      fontSize: iconSize,
      width: iconSize,
      height: iconSize,
      lineHeight: `${iconSize}px`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontVariationSettings: "'FILL' 0, 'wght' 400, 'opsz' 24",
    }
    
    // Original: filled green background with 0.5px green border
    if (isOriginal) {
      return (
        <span
          className={`${baseClasses} ${className ?? ''}`}
          style={{
            width: badgeSize,
            height: badgeSize,
            backgroundColor: config.color,
            border: `${borderWidth}px solid ${config.color}`,
          }}
          title={config.label}
          aria-label={`Status: ${config.label}`}
        >
          <span
            className="material-symbols-outlined"
            style={{
              ...iconStyle,
              color: '#1a1a1a',
              fontVariationSettings: "'FILL' 0, 'wght' 500, 'opsz' 24",
            }}
            aria-hidden="true"
          >
            {config.icon}
          </span>
        </span>
      )
    }
    
    // Proxy: filled blue background with 0.5px blue border
    if (isProxy) {
      return (
        <span
          className={`${baseClasses} ${className ?? ''}`}
          style={{
            width: badgeSize,
            height: badgeSize,
            backgroundColor: config.color,
            border: `${borderWidth}px solid ${config.color}`,
          }}
          title={config.label}
          aria-label={`Status: ${config.label}`}
        >
          <span
            className="material-symbols-outlined"
            style={{
              ...iconStyle,
              color: '#1a1a1a',
              fontVariationSettings: "'FILL' 0, 'wght' 500, 'opsz' 24",
            }}
            aria-hidden="true"
          >
            {config.icon}
          </span>
        </span>
      )
    }
    
    // Available: dark fill + 0.5px teal border + inner teal circle
    if (isAvailable) {
      return (
        <span
          className={`${baseClasses} ${className ?? ''}`}
          style={{
            width: badgeSize,
            height: badgeSize,
            border: `${borderWidth}px solid ${config.color}`,
            backgroundColor: '#1a1a1a',
          }}
          title={config.label}
          aria-label={`Status: ${config.label}`}
        >
          <span
            style={{
              width: innerCircleSize,
              height: innerCircleSize,
              borderRadius: '50%',
              border: `1.5px solid ${config.color}`,
              backgroundColor: 'transparent',
            }}
          />
        </span>
      )
    }
    
    // Claimed & Unowned: dark tinted fill + 0.5px colored border + colored icon
    const fillColor = status === 'claimed' ? '#3d2a15' 
                    : status === 'unowned' ? '#3d1830'
                    : '#1a1a1a'
    
    return (
      <span
        className={`${baseClasses} ${className ?? ''}`}
        style={{
          width: badgeSize,
          height: badgeSize,
          border: `${borderWidth}px solid ${config.color}`,
          backgroundColor: fillColor,
        }}
        title={config.label}
        aria-label={`Status: ${config.label}`}
      >
        <span
          className="material-symbols-outlined"
          style={{
            ...iconStyle,
            color: config.color,
          }}
          aria-hidden="true"
        >
          {config.icon}
        </span>
      </span>
    )
  }

  return (
    <span className={`inline-flex flex-col items-start gap-0.5 ${className ?? ''}`}>
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium transition-all duration-150 cursor-pointer hover:brightness-125 hover:scale-105"
        style={{ color: config.color, backgroundColor: config.bg }}
        aria-label={`Status: ${config.label}`}
      >
        <StatusIcon icon={config.icon} color={config.color} />
        {config.label}
      </span>
      {status === 'claimed' && heldBy && (
        <span className="max-w-[20ch] truncate text-[length:var(--fs-xs)] text-muted-foreground">
          In {heldBy.deckName}
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
    case 'alternate':
      return { border: `2.5px dashed ${config.color}` }
    case 'claimed':
      return { border: `2.5px solid ${config.color}` }
    case 'unowned':
      return { border: `2.5px solid ${config.color}` }
    default:
      return { border: '1px solid var(--border-default)' }
  }
}
