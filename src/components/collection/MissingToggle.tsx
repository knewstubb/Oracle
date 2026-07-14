'use client'

import { cn } from '@/lib/utils'

interface MissingToggleProps {
  showMissing: boolean
  onToggle: (show: boolean) => void
  missingCount: number
}

/**
 * Toggle chip for showing/hiding Missing copies in the Collection view.
 * Default: off (Missing copies are hidden).
 * When on: Missing copies render with dimmed row treatment.
 */
export function MissingToggle({ showMissing, onToggle, missingCount }: MissingToggleProps) {
  if (missingCount === 0) return null

  return (
    <button
      type="button"
      onClick={() => onToggle(!showMissing)}
      className={cn(
        'shrink-0 rounded-full px-2.5 py-[4px] text-[11px] transition-colors',
        showMissing
          ? 'border-[rgba(228,75,74,0.4)] bg-[rgba(228,75,74,0.1)] text-[var(--signal-critical)]'
          : 'text-[rgba(255,255,255,0.35)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.5)]'
      )}
      style={{
        border: showMissing
          ? '0.5px solid rgba(228,75,74,0.4)'
          : '0.5px solid rgba(255,255,255,0.1)',
      }}
      aria-pressed={showMissing}
      aria-label={`Show missing copies (${missingCount} missing)`}
    >
      Missing ({missingCount})
    </button>
  )
}
