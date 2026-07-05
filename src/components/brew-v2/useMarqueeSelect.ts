'use client'

import { useState, useCallback, useRef } from 'react'
import type { CanvasCardPosition } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarqueeRect {
  x: number
  y: number
  width: number
  height: number
}

export interface UseMarqueeSelectOptions {
  /** All card positions on the canvas (keyed by card id) */
  canvasPositions: Record<string, CanvasCardPosition>
  /** Current zoom level (0-1 scale factor) */
  zoomLevel: number
  /** Current pan offset */
  panOffset: { x: number; y: number }
  /** Whether panning is active (space held) — disables marquee */
  isPanning: boolean
  /** Card dimensions for intersection testing */
  cardWidth: number
  cardHeight: number
}

export interface UseMarqueeSelectReturn {
  /** Currently selected card IDs */
  selectedIds: Set<string>
  /** Whether a marquee drag is in progress */
  isSelecting: boolean
  /** The current marquee rectangle (viewport pixels) */
  marqueeRect: MarqueeRect | null
  /** Pointer down on empty canvas — starts marquee */
  handleMarqueePointerDown: (e: React.PointerEvent) => void
  /** Pointer move — extends marquee */
  handleMarqueePointerMove: (e: React.PointerEvent) => void
  /** Pointer up — finalizes selection */
  handleMarqueePointerUp: (e: React.PointerEvent) => void
  /** Clear selection */
  clearSelection: () => void
  /** Toggle a single card in/out of selection (for Cmd+click) */
  toggleSelection: (id: string) => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMarqueeSelect({
  canvasPositions,
  zoomLevel,
  panOffset,
  isPanning,
  cardWidth,
  cardHeight,
}: UseMarqueeSelectOptions): UseMarqueeSelectReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSelecting, setIsSelecting] = useState(false)
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null)

  const startPointRef = useRef<{ x: number; y: number } | null>(null)
  const containerRectRef = useRef<DOMRect | null>(null)

  const handleMarqueePointerDown = useCallback((e: React.PointerEvent) => {
    // Don't start marquee if panning or if a card was clicked
    if (isPanning) return

    // Only start on primary button
    if (e.button !== 0) return

    // Store the start point relative to the viewport container
    const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    containerRectRef.current = containerRect

    startPointRef.current = {
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
    }

    // Don't clear selection on pointer down — wait for movement to distinguish from click
    setIsSelecting(false)
    setMarqueeRect(null)
  }, [isPanning])

  const handleMarqueePointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPointRef.current || !containerRectRef.current) return
    if (isPanning) return

    const containerRect = containerRectRef.current
    const currentX = e.clientX - containerRect.left
    const currentY = e.clientY - containerRect.top

    const dx = currentX - startPointRef.current.x
    const dy = currentY - startPointRef.current.y

    // Only start marquee if moved more than 5px (prevents accidental micro-drags)
    if (!isSelecting && Math.abs(dx) < 5 && Math.abs(dy) < 5) return

    if (!isSelecting) {
      setIsSelecting(true)
      // Clear previous selection unless Shift is held
      if (!e.shiftKey) {
        setSelectedIds(new Set())
      }
    }

    // Calculate rectangle (handle negative width/height from dragging up/left)
    const rect: MarqueeRect = {
      x: Math.min(startPointRef.current.x, currentX),
      y: Math.min(startPointRef.current.y, currentY),
      width: Math.abs(dx),
      height: Math.abs(dy),
    }

    setMarqueeRect(rect)

    // Find cards that intersect the marquee rectangle (in canvas space)
    const selected = new Set<string>()
    const scale = zoomLevel

    for (const [id, pos] of Object.entries(canvasPositions)) {
      // Convert card position from canvas space to viewport space
      const cardLeft = pos.x * scale + panOffset.x
      const cardTop = pos.y * scale + panOffset.y
      const cardRight = cardLeft + cardWidth * scale
      const cardBottom = cardTop + cardHeight * scale

      // Check intersection with marquee rect
      if (
        cardRight > rect.x &&
        cardLeft < rect.x + rect.width &&
        cardBottom > rect.y &&
        cardTop < rect.y + rect.height
      ) {
        selected.add(id)
      }
    }

    setSelectedIds(prev => {
      if (e.shiftKey) {
        // Add to existing selection
        const merged = new Set(prev)
        for (const id of selected) merged.add(id)
        return merged
      }
      return selected
    })
  }, [isPanning, isSelecting, canvasPositions, zoomLevel, panOffset, cardWidth, cardHeight])

  const handleMarqueePointerUp = useCallback(() => {
    // If we didn't start a marquee drag (just a click on empty canvas), clear selection
    if (!isSelecting && startPointRef.current) {
      setSelectedIds(new Set())
    }
    startPointRef.current = null
    setIsSelecting(false)
    setMarqueeRect(null)
  }, [isSelecting])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  return {
    selectedIds,
    isSelecting,
    marqueeRect,
    handleMarqueePointerDown,
    handleMarqueePointerMove,
    handleMarqueePointerUp,
    clearSelection,
    toggleSelection,
  }
}
