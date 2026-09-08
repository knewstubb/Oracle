'use client'

import { cn } from '@/lib/utils'

/**
 * ManaIcon — Official Scryfall mana symbol SVGs.
 * W, U, B, R, G, C color identity icons with optional active/inactive states.
 * 
 * - Active: fully saturated
 * - Inactive: 50% desaturated (use with group-hover:saturate-100 on parent for hover effect)
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
        active ? 'saturate-100' : 'saturate-50',
        className
      )}
    />
  )
}
