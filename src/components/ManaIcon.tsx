'use client'

/**
 * ManaIcon — Inline SVG mana symbols matching official MTG iconography.
 * W=sun, U=water drop, B=skull, R=flame, G=tree, C=diamond (colorless).
 * 
 * Used for displaying color identity on commander cards, filters, etc.
 */

interface ManaIconProps {
  /** Color code: W, U, B, R, G, or C */
  color: string
  /** Size in pixels */
  size?: number
  /** Fill color (defaults to official MTG colors) */
  fill?: string
  className?: string
}

// Official MTG mana colors
const MANA_COLORS: Record<string, string> = {
  W: '#F9FAF4',
  U: '#0E68AB',
  B: '#150B00',
  R: '#D3202A',
  G: '#00733E',
  C: '#A0A0A0',
}

export function ManaIcon({ color, size = 14, fill, className }: ManaIconProps) {
  const fillColor = fill ?? MANA_COLORS[color] ?? '#888'
  
  // All icons use a circular background with the symbol inside
  const bgColor = fillColor
  const iconColor = color === 'W' ? '#1a1a1a' : color === 'B' ? '#666' : '#fff'
  
  switch (color) {
    case 'W': // Sun
      return (
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 20 20" 
          fill="none" 
          className={className}
          aria-label="White mana"
        >
          <circle cx="10" cy="10" r="10" fill={bgColor} />
          <circle cx="10" cy="10" r="3" fill={iconColor} />
          <path 
            d="M10 3v2M10 15v2M3 10h2M15 10h2M5.05 5.05l1.4 1.4M13.55 13.55l1.4 1.4M5.05 14.95l1.4-1.4M13.55 6.45l1.4-1.4" 
            stroke={iconColor} 
            strokeWidth="1.5" 
            strokeLinecap="round" 
          />
        </svg>
      )
    case 'U': // Water drop
      return (
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 20 20" 
          fill="none" 
          className={className}
          aria-label="Blue mana"
        >
          <circle cx="10" cy="10" r="10" fill={bgColor} />
          <path 
            d="M10 4C10 4 6 8.5 6 11.5a4 4 0 0 0 8 0C14 8.5 10 4 10 4Z" 
            fill={iconColor} 
          />
        </svg>
      )
    case 'B': // Skull
      return (
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 20 20" 
          fill="none" 
          className={className}
          aria-label="Black mana"
        >
          <circle cx="10" cy="10" r="10" fill={bgColor} />
          <path 
            d="M10 4C7.2 4 5 6.2 5 9c0 2 1 3.5 2.5 4.2V15h1v-1h3v1h1v-1.8C14 13.5 15 11.8 15 9c0-2.8-2.2-5-5-5Z" 
            fill={iconColor} 
          />
          <circle cx="8" cy="9" r="1" fill={bgColor} />
          <circle cx="12" cy="9" r="1" fill={bgColor} />
        </svg>
      )
    case 'R': // Flame
      return (
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 20 20" 
          fill="none" 
          className={className}
          aria-label="Red mana"
        >
          <circle cx="10" cy="10" r="10" fill={bgColor} />
          <path 
            d="M10 3c0 2.5-2.5 3.5-2.5 6 0 1.2.6 2.4 1.8 3-.9.5-1.5 1.5-1.5 2.8 0 1.8 1.8 3 2.2 3s2.2-1.2 2.2-3c0-1.3-.6-2.3-1.5-2.8 1.2-.6 1.8-1.8 1.8-3 0-2.5-2.5-3.5-2.5-6Z" 
            fill={iconColor} 
          />
        </svg>
      )
    case 'G': // Tree
      return (
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 20 20" 
          fill="none" 
          className={className}
          aria-label="Green mana"
        >
          <circle cx="10" cy="10" r="10" fill={bgColor} />
          <path 
            d="M10 3L5.5 9.5h2.5L5.5 14h3.5v3h2v-3h3.5L12 9.5h2.5L10 3Z" 
            fill={iconColor} 
          />
        </svg>
      )
    case 'C': // Diamond (colorless)
      return (
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 20 20" 
          fill="none" 
          className={className}
          aria-label="Colorless mana"
        >
          <circle cx="10" cy="10" r="10" fill={bgColor} />
          <path 
            d="M10 4L15 10L10 16L5 10L10 4Z" 
            fill="#1a1a1a" 
          />
        </svg>
      )
    default:
      return null
  }
}
