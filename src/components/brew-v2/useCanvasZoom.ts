'use client'

import { useState, useCallback, useRef } from 'react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_ZOOM = 30
const MAX_ZOOM = 200
const ZOOM_STEP = 10
const WHEEL_SENSITIVITY = 0.5
const AUTO_SWITCH_THRESHOLD = 70

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseCanvasZoomReturn {
  zoomLevel: number
  zoomIn: () => void
  zoomOut: () => void
  handleWheel: (e: WheelEvent) => void
  /** The currently effective view density (accounting for auto-switch) */
  effectiveView: 'card' | 'name'
  /** Whether auto-switch is active (no manual override) */
  isAutoSwitched: boolean
  /** Manually override the view density */
  setManualView: (view: 'card' | 'name') => void
  /** Clear the manual override */
  clearOverride: () => void
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Clamp and round to the nearest 10% step within [40, 150]. */
export function clampZoom(value: number): number {
  const rounded = Math.round(value / ZOOM_STEP) * ZOOM_STEP
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rounded))
}

/** Determine the auto-selected view based on zoom level. */
export function autoViewForZoom(zoom: number): 'card' | 'name' {
  return zoom <= AUTO_SWITCH_THRESHOLD ? 'name' : 'card'
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCanvasZoom(
  initialZoom: number = 100,
  panOffsetRef?: React.RefObject<{ x: number; y: number }>,
  setPanOffset?: (offset: { x: number; y: number }) => void
): UseCanvasZoomReturn {
  const [zoomLevel, setZoomLevel] = useState<number>(() => clampZoom(initialZoom))
  const [manualView, setManualViewState] = useState<'card' | 'name' | null>(null)
  const zoomRef = useRef(zoomLevel)

  const densityIsAuto = manualView === null

  const effectiveView: 'card' | 'name' = densityIsAuto
    ? autoViewForZoom(zoomLevel)
    : manualView

  const isAutoSwitched = densityIsAuto

  const zoomIn = useCallback(() => {
    setZoomLevel((prev) => {
      const next = clampZoom(prev + ZOOM_STEP)
      zoomRef.current = next
      return next
    })
  }, [])

  const zoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const next = clampZoom(prev - ZOOM_STEP)
      zoomRef.current = next
      return next
    })
  }, [])

  const handleWheel = useCallback((e: WheelEvent) => {
    // Zoom on: Ctrl+scroll (Windows/Linux), Cmd+scroll (Mac), or trackpad pinch (ctrlKey synthesized)
    // Also zoom on plain scroll within the canvas (no modifier needed — canvas has no scroll content)
    e.preventDefault()

    // Smooth continuous zoom — use actual deltaY magnitude
    // Trackpad pinch gives small deltas (~1-4), mouse wheel gives large (~100)
    const rawDelta = -e.deltaY
    const zoomDelta = Math.abs(rawDelta) > 50
      ? (rawDelta > 0 ? ZOOM_STEP : -ZOOM_STEP) // Mouse wheel: use fixed step
      : rawDelta * WHEEL_SENSITIVITY // Trackpad: smooth proportional

    setZoomLevel((prev) => {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + zoomDelta))
      if (Math.abs(next - prev) < 0.1) return prev

      // Zoom-to-cursor: adjust pan so the point under the cursor stays fixed
      if (panOffsetRef?.current && setPanOffset) {
        const oldScale = prev / 100
        const newScale = next / 100

        // Cursor position relative to the viewport element
        const rect = (e.currentTarget as HTMLElement)?.getBoundingClientRect?.()
        const cursorX = rect ? e.clientX - rect.left : e.clientX
        const cursorY = rect ? e.clientY - rect.top : e.clientY

        // The point in canvas-space under the cursor before zoom:
        const pan = panOffsetRef.current
        const canvasX = (cursorX - pan.x) / oldScale
        const canvasY = (cursorY - pan.y) / oldScale

        // After zoom, keep the same canvas point under the cursor:
        const newPanX = cursorX - canvasX * newScale
        const newPanY = cursorY - canvasY * newScale

        setPanOffset({ x: newPanX, y: newPanY })
      }

      zoomRef.current = next
      return next
    })
  }, [panOffsetRef, setPanOffset])

  const setManualView = useCallback((view: 'card' | 'name') => {
    setManualViewState(view)
  }, [])

  const clearOverride = useCallback(() => {
    setManualViewState(null)
  }, [])

  return {
    zoomLevel,
    zoomIn,
    zoomOut,
    handleWheel,
    effectiveView,
    isAutoSwitched,
    setManualView,
    clearOverride,
  }
}
