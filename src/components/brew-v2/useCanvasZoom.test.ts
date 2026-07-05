import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCanvasZoom, clampZoom, autoViewForZoom } from './useCanvasZoom'

// ---------------------------------------------------------------------------
// Unit tests for helper functions
// ---------------------------------------------------------------------------

describe('clampZoom', () => {
  it('rounds to nearest 10', () => {
    expect(clampZoom(67)).toBe(70)
    expect(clampZoom(73)).toBe(70)
    expect(clampZoom(75)).toBe(80)
  })

  it('clamps below minimum to 40', () => {
    expect(clampZoom(10)).toBe(40)
    expect(clampZoom(0)).toBe(40)
    expect(clampZoom(-50)).toBe(40)
  })

  it('clamps above maximum to 150', () => {
    expect(clampZoom(200)).toBe(150)
    expect(clampZoom(160)).toBe(150)
  })

  it('returns exact multiples of 10 unchanged within range', () => {
    expect(clampZoom(40)).toBe(40)
    expect(clampZoom(100)).toBe(100)
    expect(clampZoom(150)).toBe(150)
  })
})

describe('autoViewForZoom', () => {
  it('returns name for zoom <= 70', () => {
    expect(autoViewForZoom(40)).toBe('name')
    expect(autoViewForZoom(50)).toBe('name')
    expect(autoViewForZoom(70)).toBe('name')
  })

  it('returns card for zoom > 70', () => {
    expect(autoViewForZoom(80)).toBe('card')
    expect(autoViewForZoom(100)).toBe('card')
    expect(autoViewForZoom(150)).toBe('card')
  })
})

// ---------------------------------------------------------------------------
// Unit tests for useCanvasZoom hook
// ---------------------------------------------------------------------------

describe('useCanvasZoom', () => {
  it('initializes with default zoom of 100 and card view', () => {
    const { result } = renderHook(() => useCanvasZoom())
    expect(result.current.zoomLevel).toBe(100)
    expect(result.current.effectiveView).toBe('card')
    expect(result.current.isAutoSwitched).toBe(true)
  })

  it('accepts a custom initial zoom and clamps it', () => {
    const { result } = renderHook(() => useCanvasZoom(63))
    expect(result.current.zoomLevel).toBe(60)
    expect(result.current.effectiveView).toBe('name')
  })

  it('zooms in by 10% step', () => {
    const { result } = renderHook(() => useCanvasZoom(100))
    act(() => result.current.zoomIn())
    expect(result.current.zoomLevel).toBe(110)
  })

  it('zooms out by 10% step', () => {
    const { result } = renderHook(() => useCanvasZoom(100))
    act(() => result.current.zoomOut())
    expect(result.current.zoomLevel).toBe(90)
  })

  it('does not zoom in beyond 150', () => {
    const { result } = renderHook(() => useCanvasZoom(150))
    act(() => result.current.zoomIn())
    expect(result.current.zoomLevel).toBe(150)
  })

  it('does not zoom out below 40', () => {
    const { result } = renderHook(() => useCanvasZoom(40))
    act(() => result.current.zoomOut())
    expect(result.current.zoomLevel).toBe(40)
  })

  it('auto-switches to name view when zoom drops to 70 or below', () => {
    const { result } = renderHook(() => useCanvasZoom(80))
    expect(result.current.effectiveView).toBe('card')
    act(() => result.current.zoomOut()) // 80 → 70
    expect(result.current.zoomLevel).toBe(70)
    expect(result.current.effectiveView).toBe('name')
  })

  it('auto-switches to card view when zoom rises above 70', () => {
    const { result } = renderHook(() => useCanvasZoom(70))
    expect(result.current.effectiveView).toBe('name')
    act(() => result.current.zoomIn()) // 70 → 80
    expect(result.current.zoomLevel).toBe(80)
    expect(result.current.effectiveView).toBe('card')
  })

  it('manual view override persists across zoom changes', () => {
    const { result } = renderHook(() => useCanvasZoom(100))
    act(() => result.current.setManualView('name'))
    expect(result.current.effectiveView).toBe('name')
    expect(result.current.isAutoSwitched).toBe(false)

    // Zoom changes should not affect the manual override
    act(() => result.current.zoomIn())
    expect(result.current.effectiveView).toBe('name')
    act(() => result.current.zoomOut())
    act(() => result.current.zoomOut())
    expect(result.current.effectiveView).toBe('name')
  })

  it('clearOverride re-enables auto-switch', () => {
    const { result } = renderHook(() => useCanvasZoom(60))
    // Set manual card view override
    act(() => result.current.setManualView('card'))
    expect(result.current.effectiveView).toBe('card')
    expect(result.current.isAutoSwitched).toBe(false)

    // Clear override — should revert to auto (zoom 60 → name)
    act(() => result.current.clearOverride())
    expect(result.current.isAutoSwitched).toBe(true)
    expect(result.current.effectiveView).toBe('name')
  })

  it('handleWheel zooms out on positive deltaY with ctrl held', () => {
    const { result } = renderHook(() => useCanvasZoom(100))
    const event = new WheelEvent('wheel', { deltaY: 100, ctrlKey: true })
    Object.defineProperty(event, 'preventDefault', { value: () => {} })

    act(() => result.current.handleWheel(event))
    expect(result.current.zoomLevel).toBe(90)
  })

  it('handleWheel zooms in on negative deltaY with ctrl held', () => {
    const { result } = renderHook(() => useCanvasZoom(100))
    const event = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true })
    Object.defineProperty(event, 'preventDefault', { value: () => {} })

    act(() => result.current.handleWheel(event))
    expect(result.current.zoomLevel).toBe(110)
  })

  it('handleWheel zooms with metaKey (Cmd on Mac)', () => {
    const { result } = renderHook(() => useCanvasZoom(100))
    const event = new WheelEvent('wheel', { deltaY: -100, metaKey: true })
    Object.defineProperty(event, 'preventDefault', { value: () => {} })

    act(() => result.current.handleWheel(event))
    expect(result.current.zoomLevel).toBe(110)
  })

  it('handleWheel does nothing without ctrl or meta key', () => {
    const { result } = renderHook(() => useCanvasZoom(100))
    const event = new WheelEvent('wheel', { deltaY: -100 })
    Object.defineProperty(event, 'preventDefault', { value: () => {} })

    act(() => result.current.handleWheel(event))
    expect(result.current.zoomLevel).toBe(100)
  })
})
