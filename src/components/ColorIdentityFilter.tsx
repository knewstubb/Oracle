'use client'

import { useCallback } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Color definitions with Scryfall SVG URLs
// ---------------------------------------------------------------------------

const COLORS = [
  { id: 'C', label: 'Colorless', ring: '#9CA3AF', svg: 'https://svgs.scryfall.io/card-symbols/C.svg' },
  { id: 'W', label: 'White', ring: '#D4D4D8', svg: 'https://svgs.scryfall.io/card-symbols/W.svg' },
  { id: 'U', label: 'Blue', ring: '#3B82F6', svg: 'https://svgs.scryfall.io/card-symbols/U.svg' },
  { id: 'B', label: 'Black', ring: '#52525B', svg: 'https://svgs.scryfall.io/card-symbols/B.svg' },
  { id: 'R', label: 'Red', ring: '#EF4444', svg: 'https://svgs.scryfall.io/card-symbols/R.svg' },
  { id: 'G', label: 'Green', ring: '#22C55E', svg: 'https://svgs.scryfall.io/card-symbols/G.svg' },
] as const

type ColorId = typeof COLORS[number]['id']

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ColorIdentityFilterProps {
  /** Currently selected colors (e.g., "WUB" or ["W", "U", "B"]) */
  value: string | string[]
  /** Callback when selection changes */
  onChange: (colors: string) => void
  /** Size of the color buttons */
  size?: 'sm' | 'md' | 'lg'
  /** Whether to show labels */
  showLabels?: boolean
}

// ---------------------------------------------------------------------------
// ColorIdentityFilter
// ---------------------------------------------------------------------------

/**
 * Horizontal row of W/U/B/R/G mana symbol toggle buttons.
 * Click to toggle colors on/off. Selected colors filter commanders
 * to those within the selected color identity.
 */
export function ColorIdentityFilter({
  value,
  onChange,
  size = 'md',
  showLabels = false,
}: ColorIdentityFilterProps) {
  // Normalize value to Set for easy lookup
  const selectedColors = new Set(
    typeof value === 'string' ? value.split('') : value
  )
  
  const handleToggle = useCallback((colorId: ColorId) => {
    const newSelected = new Set(selectedColors)
    if (newSelected.has(colorId)) {
      newSelected.delete(colorId)
    } else {
      newSelected.add(colorId)
    }
    // Return in WUBRG order
    const ordered = COLORS
      .map(c => c.id)
      .filter(id => newSelected.has(id))
      .join('')
    onChange(ordered)
  }, [selectedColors, onChange])
  
  const handleClear = useCallback(() => {
    onChange('')
  }, [onChange])
  
  // Size classes
  const sizeClasses = {
    sm: { button: 'w-6 h-6', iconSize: 20, text: 'text-[10px]' },
    md: { button: 'w-8 h-8', iconSize: 28, text: 'text-xs' },
    lg: { button: 'w-10 h-10', iconSize: 36, text: 'text-sm' },
  }[size]
  
  return (
    <div className="flex items-center gap-1">
      {COLORS.map(color => {
        const isSelected = selectedColors.has(color.id)
        
        return (
          <button
            key={color.id}
            onClick={() => handleToggle(color.id)}
            aria-pressed={isSelected}
            aria-label={`${isSelected ? 'Remove' : 'Add'} ${color.label}`}
            title={color.label}
            className={cn(
              'flex items-center justify-center rounded-full transition-all',
              sizeClasses.button,
              isSelected
                ? 'ring-2 ring-offset-1 ring-offset-zinc-900'
                : 'opacity-40 hover:opacity-70',
            )}
            style={{
              ringColor: isSelected ? color.ring : undefined,
            }}
          >
            <Image
              src={color.svg}
              alt={color.label}
              width={sizeClasses.iconSize}
              height={sizeClasses.iconSize}
              className="rounded-full"
              unoptimized
            />
          </button>
        )
      })}
      
      {/* Clear button - only show if colors are selected */}
      {selectedColors.size > 0 && (
        <button
          onClick={handleClear}
          className={cn(
            'ml-1 px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200',
            'hover:bg-zinc-700/50 transition-colors',
            sizeClasses.text
          )}
          aria-label="Clear color filter"
        >
          Clear
        </button>
      )}
      
      {/* Labels */}
      {showLabels && selectedColors.size > 0 && (
        <span className={cn('ml-2 text-zinc-500', sizeClasses.text)}>
          {Array.from(selectedColors).join('')}
        </span>
      )}
    </div>
  )
}
