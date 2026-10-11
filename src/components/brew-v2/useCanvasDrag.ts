'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseCanvasDragOptions {
  /** Callback fired when a drag completes with the card id and final delta position */
  onDragEnd: (id: string, position: { x: number; y: number }) => void
  /** Callback fired when a group drag completes — moves all selected cards by delta */
  onGroupDragEnd?: (ids: string[], delta: { x: number; y: number }) => void
  /** Currently selected card IDs (for group drag) */
  selectedIds?: Set<string>
  /** Callback to clear selection when dragging an unselected card */
  onClearSelection?: () => void
  /** Current zoom level (1 = 100%). Drag deltas are divided by this so dragging feels consistent at any zoom. */
  zoomLevel: number
}

export interface UseCanvasDragReturn {
  /** The id of the card currently being dragged (null if idle) */
  draggingId: string | null
  /** The drag offset (delta from card's starting position) while dragging (null if idle) */
  dragOffset: { x: number; y: number } | null
  /** Map of card id → z-index (incrementing, most recently touched is highest) */
  zIndexMap: Map<string, number>
  /** Factory that returns pointer event props for a given card id */
  getPointerProps: (id: string) => {
    onPointerDown: (e: React.PointerEvent) => void
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Pointer-based spatial drag hook for the brew canvas.
 *
 * Uses `pointerdown`/`pointermove`/`pointerup` with `setPointerCapture`
 * for smooth, library-free drag on all card types. Drag deltas are adjusted
 * by the current zoom level so movement feels natural at any scale.
 *
 * While dragging, the parent renders:
 * - The original card at opacity 0.4 (ghost)
 * - The real card offset by `dragOffset` at full opacity
 */
export function useCanvasDrag({
  onDragEnd,
  onGroupDragEnd,
  selectedIds,
  onClearSelection,
  zoomLevel,
}: UseCanvasDragOptions): UseCanvasDragReturn {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const [zIndexMap, setZIndexMap] = useState<Map<string, number>>(new Map())
  const zCounterRef = useRef(1)

  // Refs to track drag state without causing re-renders on every pointermove
  const startPointerRef = useRef<{ x: number; y: number } | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const capturedElementRef = useRef<HTMLElement | null>(null)

  // Latest pointer handlers, used to detach listeners without creating a
  // circular reference between the handlers themselves.
  const pointerHandlersRef = useRef<{
    move: (e: PointerEvent) => void
    up: (e: PointerEvent) => void
    cancel: (e: PointerEvent) => void
  } | null>(null)

  // Keep a ref to the latest zoom level so pointermove uses the current value
  const zoomRef = useRef(zoomLevel)
  useEffect(() => {
    zoomRef.current = zoomLevel
  }, [zoomLevel])

  // Keep a ref to the latest onDragEnd callback
  const onDragEndRef = useRef(onDragEnd)
  useEffect(() => {
    onDragEndRef.current = onDragEnd
  }, [onDragEnd])

  // Keep refs for group drag
  const onGroupDragEndRef = useRef(onGroupDragEnd)
  useEffect(() => {
    onGroupDragEndRef.current = onGroupDragEnd
  }, [onGroupDragEnd])
  const selectedIdsRef = useRef(selectedIds)
  useEffect(() => {
    selectedIdsRef.current = selectedIds
  }, [selectedIds])
  const isGroupDragRef = useRef(false)

  // ---- Pointer Move Handler (bound to the captured element) ----
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!startPointerRef.current || !activeIdRef.current) return

    const zoom = zoomRef.current
    const dx = (e.clientX - startPointerRef.current.x) / zoom
    const dy = (e.clientY - startPointerRef.current.y) / zoom

    setDragOffset({ x: dx, y: dy })
  }, [])

  // ---- Detach all active pointer listeners ----
  const removePointerListeners = useCallback((element: HTMLElement) => {
    const handlers = pointerHandlersRef.current
    if (!handlers) return
    element.removeEventListener('pointermove', handlers.move)
    element.removeEventListener('pointerup', handlers.up)
    element.removeEventListener('pointercancel', handlers.cancel)
  }, [])

  // ---- Pointer Up Handler ----
  const handlePointerUp = useCallback((e: PointerEvent) => {
    const element = capturedElementRef.current
    if (element) {
      element.releasePointerCapture(e.pointerId)
      removePointerListeners(element)
    }

    // Compute final position delta
    if (startPointerRef.current && activeIdRef.current) {
      const zoom = zoomRef.current
      const finalX = (e.clientX - startPointerRef.current.x) / zoom
      const finalY = (e.clientY - startPointerRef.current.y) / zoom
      const delta = { x: finalX, y: finalY }

      if (isGroupDragRef.current && selectedIdsRef.current && selectedIdsRef.current.size > 0 && onGroupDragEndRef.current) {
        // Group drag — move all selected cards by the same delta
        onGroupDragEndRef.current([...selectedIdsRef.current], delta)
      } else {
        // Single card drag
        onDragEndRef.current(activeIdRef.current, delta)
      }
    }

    // Reset state
    isGroupDragRef.current = false
    setDraggingId(null)
    setDragOffset(null)
    startPointerRef.current = null
    activeIdRef.current = null
    capturedElementRef.current = null
  }, [removePointerListeners])

  // ---- Pointer Cancel Handler (drag cancellation) ----
  const handlePointerCancel = useCallback((e: PointerEvent) => {
    const element = capturedElementRef.current
    if (element) {
      element.releasePointerCapture(e.pointerId)
      removePointerListeners(element)
    }

    // Cancel: reset without calling onDragEnd
    setDraggingId(null)
    setDragOffset(null)
    startPointerRef.current = null
    activeIdRef.current = null
    capturedElementRef.current = null
  }, [removePointerListeners])

  // Keep the detached-listener ref in sync with the latest handlers
  useEffect(() => {
    pointerHandlersRef.current = {
      move: handlePointerMove,
      up: handlePointerUp,
      cancel: handlePointerCancel,
    }
  }, [handlePointerMove, handlePointerUp, handlePointerCancel])

  // ---- Pointer Down Factory ----
  const getPointerProps = useCallback(
    (id: string) => ({
      onPointerDown: (e: React.PointerEvent) => {
        // Only handle primary button (left click / touch)
        if (e.button !== 0) return

        // Don't initiate drag if the event originated from an interactive element
        // (buttons, links, inputs) — let their click handlers fire normally
        const target = e.target as HTMLElement
        if (target.closest('button, a, input, [role="button"]')) return

        e.preventDefault()
        e.stopPropagation()

        const element = e.currentTarget as HTMLElement
        element.setPointerCapture(e.pointerId)

        // Store starting pointer position and card id
        startPointerRef.current = { x: e.clientX, y: e.clientY }
        activeIdRef.current = id
        capturedElementRef.current = element

        // Determine if this is a group drag (card is in the selection)
        const currentSelection = selectedIdsRef.current
        if (currentSelection && currentSelection.has(id) && currentSelection.size > 1) {
          isGroupDragRef.current = true
        } else {
          isGroupDragRef.current = false
          // If dragging an unselected card, clear the selection
          if (currentSelection && currentSelection.size > 0 && !currentSelection.has(id)) {
            onClearSelection?.()
          }
        }

        // Set drag active state
        setDraggingId(id)
        setDragOffset({ x: 0, y: 0 })
        // Increment z-index counter and assign to this card
        zCounterRef.current += 1
        setZIndexMap(prev => new Map(prev).set(id, zCounterRef.current))

        // Attach move/up/cancel listeners to the captured element
        element.addEventListener('pointermove', handlePointerMove)
        element.addEventListener('pointerup', handlePointerUp)
        element.addEventListener('pointercancel', handlePointerCancel)
      },
    }),
    [handlePointerMove, handlePointerUp, handlePointerCancel]
  )

  // Cleanup: remove listeners if component unmounts mid-drag
  useEffect(() => {
    return () => {
      const element = capturedElementRef.current
      if (element) {
        element.removeEventListener('pointermove', handlePointerMove)
        element.removeEventListener('pointerup', handlePointerUp)
        element.removeEventListener('pointercancel', handlePointerCancel)
      }
    }
  }, [handlePointerMove, handlePointerUp, handlePointerCancel])

  return {
    draggingId,
    dragOffset,
    zIndexMap,
    getPointerProps,
  }
}
