'use client'

import { cn } from '@/lib/utils'

/**
 * ManaIcon — Official Scryfall mana symbol SVGs.
 * W, U, B, R, G, C color identity icons with optional active/inactive states.
 * 
 * - Active: fully visible (opacity-100)
 * - Inactive: 25% opacity
 */

interface ManaIconProps {
  /** Color code: W, U, B, R, G, or C */
  color: string
  /** Size in pixels (default 24) */
  size?: number
  /** Whether the icon is in active/selected state (defaults to true) */
  active?: boolean
  /** Additional CSS classes */
  className?: string
}

export function ManaIcon({ color, size = 24, active = true, className }: ManaIconProps) {
  const svgUrl = `https://svgs.scryfall.io/card-symbols/${color}.svg`
  
  return (
    <img
      src={svgUrl}
      alt={`${color} mana`}
      width={size}
      height={size}
      className={cn(
        'rounded-full transition-opacity',
        active ? 'opacity-100' : 'opacity-25',
        className
      )}
    />
  )
}
