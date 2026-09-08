'use client'

import { cn } from '@/lib/utils'

/**
 * ManaIcon — Official Scryfall mana symbol SVGs.
 * W, U, B, R, G, C color identity icons with optional active/inactive states.
 * 
 * Used for displaying color identity on commander cards, filters, etc.
 */

interface ManaIconProps {
  /** Color code: W, U, B, R, G, or C */
  color: string
  /** Size in pixels */
  size?: number
  /** Whether the icon is in active/selected state (defaults to true) */
  active?: boolean
  /** Additional CSS classes */
  className?: string
}

// Ring colors for selected state
const RING_COLORS: Record<string, string> = {
  W: '#D4D4D8',
  U: '#3B82F6',
  B: '#52525B',
  R: '#EF4444',
  G: '#22C55E',
  C: '#9CA3AF',
}

export function ManaIcon({ color, size = 20, active = true, className }: ManaIconProps) {
  const svgUrl = `https://svgs.scryfall.io/card-symbols/${color}.svg`
  
  return (
    <img
      src={svgUrl}
      alt={`${color} mana`}
      width={size}
      height={size}
      className={cn(
        'rounded-full transition-all',
        active ? 'opacity-100' : 'opacity-40 grayscale',
        className
      )}
      style={{ 
        filter: active ? 'none' : 'grayscale(100%) brightness(0.7)',
      }}
    />
  )
}

// Re-export ring colors for components that need them
export { RING_COLORS as MANA_RING_COLORS }
