'use client'

/**
 * GlareIndicator — Real-time glare feedback for foil card scanning.
 *
 * Shows a small indicator in the viewfinder that changes color based on
 * the percentage of oversaturated (glared) pixels in the artwork region:
 * - Green (< 5%): good — proceed with scan
 * - Yellow (5-15%): acceptable — scan may work, tilt slightly for better results
 * - Red (> 15%): too much glare — prompt user to tilt card
 *
 * Displayed as a small pill in the top-right of the camera view.
 */

interface GlareIndicatorProps {
  /** Glare percentage (0.0 to 1.0) */
  glarePercentage: number
  /** Whether to show the indicator (only when camera is active) */
  visible: boolean
}

export function GlareIndicator({ glarePercentage, visible }: GlareIndicatorProps) {
  if (!visible) return null

  const pct = Math.round(glarePercentage * 100)

  let color: string
  let bgColor: string
  let label: string

  if (pct < 5) {
    color = 'var(--signal-success)'
    bgColor = 'rgba(29,158,117,0.15)'
    label = 'Good'
  } else if (pct < 15) {
    color = '#F5880B'
    bgColor = 'rgba(245,136,11,0.15)'
    label = 'Tilt slightly'
  } else {
    color = 'rgba(226,75,74,0.9)'
    bgColor = 'rgba(226,75,74,0.15)'
    label = 'Too much glare'
  }

  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 backdrop-blur-sm"
      style={{ backgroundColor: bgColor }}
      role="status"
      aria-live="polite"
      aria-label={`Glare level: ${label}`}
    >
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="text-[length:var(--fs-xs)] font-medium" style={{ color }}>
        {pct < 5 ? '' : label}
      </span>
    </div>
  )
}
