'use client'

import { Minus, Plus } from 'lucide-react'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CanvasToolbarProps {
  // Zoom
  zoomLevel: number
  onZoomIn: () => void
  onZoomOut: () => void

  // Layout mode
  layoutMode: 'free-form' | 'piled' | 'curve'
  onLayoutModeChange: (mode: 'free-form' | 'piled' | 'curve') => void

  // View density
  viewDensity: 'card' | 'name'
  onViewDensityChange: (view: 'card' | 'name') => void
  isAutoSwitched: boolean // When true, "Auto" option is highlighted
  onClearViewOverride: () => void // Resets to auto view density mode
  disableViewDensity?: boolean // When true, density controls are visually disabled (e.g. Curve mode)

  // Group by category
  onGroupByCategory?: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_ZOOM = 40
const MAX_ZOOM = 150

// ---------------------------------------------------------------------------
// SegmentedControl — reusable pill toggle
// ---------------------------------------------------------------------------

interface SegmentOption<T extends string> {
  value: T
  label: string
  tag?: string
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex items-center rounded-md border border-border/50 bg-background/50 p-0.5">
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`
              relative rounded-[3px] px-2 py-0.5 text-[10px] font-medium transition-colors
              ${
                isActive
                  ? 'bg-[rgba(55,138,221,0.15)] text-[#378ADD] border border-[#378ADD]/30'
                  : 'text-muted-foreground hover:bg-accent/50 border border-transparent'
              }
            `}
          >
            {option.label}
            {option.tag && (
              <span className="ml-1 text-[9px] opacity-70">({option.tag})</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CanvasToolbar
// ---------------------------------------------------------------------------

export function CanvasToolbar({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  layoutMode,
  onLayoutModeChange,
  viewDensity,
  onViewDensityChange,
  isAutoSwitched,
  onClearViewOverride,
  disableViewDensity,
  onGroupByCategory,
}: CanvasToolbarProps) {
  const isAtMin = zoomLevel <= MIN_ZOOM
  const isAtMax = zoomLevel >= MAX_ZOOM

  const layoutOptions: SegmentOption<'free-form' | 'piled' | 'curve'>[] = [
    { value: 'free-form', label: 'Free-form' },
    { value: 'piled', label: 'Piled' },
    { value: 'curve', label: 'Curve' },
  ]

  const viewOptions: SegmentOption<'auto' | 'card' | 'name'>[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'card', label: 'Card' },
    { value: 'name', label: 'Name' },
  ]

  // Derive active value: when in auto mode, 'auto' is highlighted;
  // otherwise the manually selected density is highlighted
  const activeViewValue: 'auto' | 'card' | 'name' = isAutoSwitched ? 'auto' : viewDensity

  const handleViewChange = (value: 'auto' | 'card' | 'name') => {
    if (value === 'auto') {
      onClearViewOverride()
    } else {
      onViewDensityChange(value)
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border/50 bg-background/80 backdrop-blur-sm">
      {/* Layout mode segmented control */}
      <SegmentedControl
        options={layoutOptions}
        value={layoutMode}
        onChange={onLayoutModeChange}
      />

      {/* View density segmented control */}
      <div className={disableViewDensity ? 'opacity-50 pointer-events-none' : ''}>
        <SegmentedControl
          options={viewOptions}
          value={activeViewValue}
          onChange={handleViewChange}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Group by category button */}
      {onGroupByCategory && layoutMode === 'free-form' && (
        <button
          type="button"
          onClick={onGroupByCategory}
          className="rounded-[3px] px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-border/50 transition-colors"
        >
          Group by Category
        </button>
      )}

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={isAtMin}
          className={`
            flex h-5 w-5 items-center justify-center rounded text-[11px]
            ${
              isAtMin
                ? 'opacity-50 cursor-not-allowed text-muted-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors'
            }
          `}
          aria-label="Zoom out"
        >
          <Minus className="h-3 w-3" />
        </button>

        <span className="min-w-[32px] text-center text-[10px] font-medium text-muted-foreground tabular-nums">
          {zoomLevel}%
        </span>

        <button
          type="button"
          onClick={onZoomIn}
          disabled={isAtMax}
          className={`
            flex h-5 w-5 items-center justify-center rounded text-[11px]
            ${
              isAtMax
                ? 'opacity-50 cursor-not-allowed text-muted-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors'
            }
          `}
          aria-label="Zoom in"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
