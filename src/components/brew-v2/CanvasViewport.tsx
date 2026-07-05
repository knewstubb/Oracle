'use client'

import { useEffect, useRef } from 'react'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CanvasViewportProps {
  /** Zoom level: 40–150, used as scale factor (divided by 100) */
  zoomLevel: number
  /** Pan offset in viewport pixels */
  panOffset: { x: number; y: number }
  /** Wheel handler connected to useCanvasZoom.handleWheel */
  onWheel: (e: WheelEvent) => void
  /** Canvas content (cards, columns, etc.) */
  children: React.ReactNode
}

// ---------------------------------------------------------------------------
// CanvasViewport — zoom/pan container that wraps all canvas content
// ---------------------------------------------------------------------------

export function CanvasViewport({
  zoomLevel,
  panOffset,
  onWheel,
  children,
}: CanvasViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null)

  // Attach wheel handler with { passive: false } to allow preventDefault()
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
    }
  }, [onWheel])

  const scale = zoomLevel / 100

  return (
    <div
      ref={viewportRef}
      className="relative h-full w-full overflow-hidden"
      data-testid="canvas-viewport"
    >
      <div
        className="origin-top-left"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}
        data-testid="canvas-content-layer"
      >
        {children}
      </div>
    </div>
  )
}
