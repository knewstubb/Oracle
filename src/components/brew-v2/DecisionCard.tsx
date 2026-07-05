'use client'

import type { DecisionEntry } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DecisionCardProps {
  decision: DecisionEntry
  position: { x: number; y: number }
  pointerProps: { onPointerDown: (e: React.PointerEvent) => void }
  isDragging: boolean
  dragOffset: { x: number; y: number } | null
}

// ---------------------------------------------------------------------------
// DecisionCard — Phase 1 decision entry rendered on the spatial canvas
// ---------------------------------------------------------------------------

/**
 * A 152px-wide card displaying a KEY/Value decision pair.
 * Positioned absolutely via CSS `transform: translate3d(x, y, 0)` from canvasPositions.
 * Uses a dashed border to distinguish from candidate cards (no art, smaller footprint).
 */
export function DecisionCard({
  decision,
  position,
  pointerProps,
  isDragging,
  dragOffset,
}: DecisionCardProps) {
  // Compute final position: base + drag offset when actively being dragged
  const x = position.x + (dragOffset?.x ?? 0)
  const y = position.y + (dragOffset?.y ?? 0)

  return (
    <div
      className="absolute touch-none select-none"
      style={{
        width: 152,
        transform: `translate3d(${x}px, ${y}px, 0)`,
        opacity: isDragging ? 0.4 : 1,
      }}
      data-testid="decision-card"
      {...pointerProps}
    >
      <div className="rounded border border-dashed border-[rgba(255,255,255,0.25)] bg-[rgba(255,255,255,0.04)] px-2 py-1.5">
        {/* KEY — 8px uppercase, muted colour */}
        <p className="text-[8px] font-medium uppercase leading-tight tracking-wide text-[rgba(255,255,255,0.5)]">
          {decision.key}
        </p>
        {/* Value — 10px, normal weight */}
        <p className="mt-0.5 text-[10px] leading-snug text-[rgba(255,255,255,0.85)]">
          {decision.value}
        </p>
      </div>
    </div>
  )
}
