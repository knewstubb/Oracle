'use client'

import { useCallback } from 'react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Color definitions
// ---------------------------------------------------------------------------

const COLORS = [
  { id: 'W', label: 'White', hex: '#F9FAF4', ring: '#D4D4D8' },
  { id: 'U', label: 'Blue', hex: '#0E68AB', ring: '#3B82F6' },
  { id: 'B', label: 'Black', hex: '#150B00', ring: '#52525B' },
  { id: 'R', label: 'Red', hex: '#D3202A', ring: '#EF4444' },
  { id: 'G', label: 'Green', hex: '#00733E', ring: '#22C55E' },
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
    sm: { button: 'w-6 h-6', pip: 'w-4 h-4', text: 'text-[10px]' },
    md: { button: 'w-8 h-8', pip: 'w-5 h-5', text: 'text-xs' },
    lg: { button: 'w-10 h-10', pip: 'w-6 h-6', text: 'text-sm' },
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
            <span
              className={cn(
                'rounded-full border border-white/20',
                sizeClasses.pip
              )}
              style={{ backgroundColor: color.hex }}
              aria-hidden="true"
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
