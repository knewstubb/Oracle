import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCanvasDrag } from './useCanvasDrag'

describe('useCanvasDrag', () => {
  const defaultOptions = {
    onDragEnd: vi.fn(),
    zoomLevel: 1,
  }

  it('initialises with null draggingId and dragOffset', () => {
    const { result } = renderHook(() => useCanvasDrag(defaultOptions))

    expect(result.current.draggingId).toBeNull()
    expect(result.current.dragOffset).toBeNull()
  })

  it('returns getPointerProps factory that produces onPointerDown', () => {
    const { result } = renderHook(() => useCanvasDrag(defaultOptions))

    const props = result.current.getPointerProps('card-1')
    expect(props).toHaveProperty('onPointerDown')
    expect(typeof props.onPointerDown).toBe('function')
  })

  it('sets draggingId and dragOffset on pointerdown', () => {
    const { result } = renderHook(() => useCanvasDrag(defaultOptions))

    const props = result.current.getPointerProps('card-1')

    // Simulate pointerdown
    const element = document.createElement('div')
    const event = {
      button: 0,
      clientX: 100,
      clientY: 200,
      pointerId: 1,
      currentTarget: element,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent

    // Mock setPointerCapture
    element.setPointerCapture = vi.fn()
    element.addEventListener = vi.fn()

    act(() => {
      props.onPointerDown(event)
    })

    expect(result.current.draggingId).toBe('card-1')
    expect(result.current.dragOffset).toEqual({ x: 0, y: 0 })
    expect(element.setPointerCapture).toHaveBeenCalledWith(1)
  })

  it('ignores non-primary button presses', () => {
    const { result } = renderHook(() => useCanvasDrag(defaultOptions))

    const props = result.current.getPointerProps('card-1')

    const element = document.createElement('div')
    const event = {
      button: 2, // right click
      clientX: 100,
      clientY: 200,
      pointerId: 1,
      currentTarget: element,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent

    act(() => {
      props.onPointerDown(event)
    })

    expect(result.current.draggingId).toBeNull()
    expect(result.current.dragOffset).toBeNull()
  })

  it('computes drag offset accounting for zoom level', () => {
    const onDragEnd = vi.fn()
    const { result } = renderHook(() =>
      useCanvasDrag({ onDragEnd, zoomLevel: 2 })
    )

    const props = result.current.getPointerProps('card-1')

    // Create element with captured event listeners
    const element = document.createElement('div')
    const listeners: Record<string, EventListener> = {}
    element.setPointerCapture = vi.fn()
    element.releasePointerCapture = vi.fn()
    element.addEventListener = vi.fn((type: string, handler: EventListener) => {
      listeners[type] = handler
    })
    element.removeEventListener = vi.fn()

    const downEvent = {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      currentTarget: element,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent

    act(() => {
      props.onPointerDown(downEvent)
    })

    // Simulate pointermove: move 50px right, 30px down at zoom=2
    // Expected offset: 25, 15 (divided by zoom)
    act(() => {
      listeners['pointermove']?.(
        new PointerEvent('pointermove', { clientX: 150, clientY: 130 })
      )
    })

    expect(result.current.dragOffset).toEqual({ x: 25, y: 15 })
  })

  it('calls onDragEnd with final position on pointerup', () => {
    const onDragEnd = vi.fn()
    const { result } = renderHook(() =>
      useCanvasDrag({ onDragEnd, zoomLevel: 1 })
    )

    const props = result.current.getPointerProps('card-1')

    const element = document.createElement('div')
    const listeners: Record<string, EventListener> = {}
    element.setPointerCapture = vi.fn()
    element.releasePointerCapture = vi.fn()
    element.addEventListener = vi.fn((type: string, handler: EventListener) => {
      listeners[type] = handler
    })
    element.removeEventListener = vi.fn()

    const downEvent = {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      currentTarget: element,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent

    act(() => {
      props.onPointerDown(downEvent)
    })

    // Simulate pointerup at (160, 140) — delta of (60, 40) at zoom=1
    act(() => {
      listeners['pointerup']?.(
        new PointerEvent('pointerup', { clientX: 160, clientY: 140 })
      )
    })

    expect(onDragEnd).toHaveBeenCalledWith('card-1', { x: 60, y: 40 })
    expect(result.current.draggingId).toBeNull()
    expect(result.current.dragOffset).toBeNull()
  })

  it('resets state on pointercancel without calling onDragEnd', () => {
    const onDragEnd = vi.fn()
    const { result } = renderHook(() =>
      useCanvasDrag({ onDragEnd, zoomLevel: 1 })
    )

    const props = result.current.getPointerProps('card-1')

    const element = document.createElement('div')
    const listeners: Record<string, EventListener> = {}
    element.setPointerCapture = vi.fn()
    element.releasePointerCapture = vi.fn()
    element.addEventListener = vi.fn((type: string, handler: EventListener) => {
      listeners[type] = handler
    })
    element.removeEventListener = vi.fn()

    const downEvent = {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      currentTarget: element,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent

    act(() => {
      props.onPointerDown(downEvent)
    })

    expect(result.current.draggingId).toBe('card-1')

    // Simulate pointercancel (drag leaves canvas bounds)
    act(() => {
      listeners['pointercancel']?.(
        new PointerEvent('pointercancel', { clientX: 200, clientY: 200 })
      )
    })

    expect(onDragEnd).not.toHaveBeenCalled()
    expect(result.current.draggingId).toBeNull()
    expect(result.current.dragOffset).toBeNull()
  })
})
