import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSSEChat } from './useSSEChat'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function encodeSSE(events: string[]): Uint8Array {
  const encoder = new TextEncoder()
  const sseText = events.map((e) => `data: ${e}\n\n`).join('')
  return encoder.encode(sseText)
}

function mockFetchWithSSE(events: string[], status = 200) {
  const encoded = encodeSSE(events)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded)
      controller.close()
    },
  })

  return vi.mocked(fetch).mockResolvedValue(
    new Response(stream, {
      status,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  )
}

/**
 * Flush microtasks and allow React state updates to propagate.
 */
async function flushAsync() {
  await new Promise((r) => setTimeout(r, 0))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSSEChat', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accumulates tokens and calls onComplete on [DONE]', async () => {
    const onComplete = vi.fn()
    mockFetchWithSSE(['Hello', ', world', '!', '[DONE]'])

    const { result } = renderHook(() =>
      useSSEChat({ endpoint: '/api/test', onComplete })
    )

    await act(async () => {
      result.current.sendMessage({ message: 'hi' })
      await flushAsync()
    })

    expect(onComplete).toHaveBeenCalledWith('Hello, world!')
    expect(result.current.streamingText).toBe('Hello, world!')
    expect(result.current.isStreaming).toBe(false)
  })

  it('resets streamingText before starting a new stream', async () => {
    const onComplete = vi.fn()
    mockFetchWithSSE(['First', '[DONE]'])

    const { result } = renderHook(() =>
      useSSEChat({ endpoint: '/api/test', onComplete })
    )

    await act(async () => {
      result.current.sendMessage({ message: 'first' })
      await flushAsync()
    })

    expect(onComplete).toHaveBeenCalledWith('First')

    // Start a second stream
    mockFetchWithSSE(['Second', '[DONE]'])

    await act(async () => {
      result.current.sendMessage({ message: 'second' })
      await flushAsync()
    })

    expect(onComplete).toHaveBeenCalledWith('Second')
    expect(result.current.streamingText).toBe('Second')
  })

  it('sets isStreaming to true while receiving tokens', async () => {
    let resolveStream: () => void
    const streamPromise = new Promise<void>((resolve) => {
      resolveStream = resolve
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode('data: token\n\n'))
        await streamPromise
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    vi.mocked(fetch).mockResolvedValue(
      new Response(stream, { status: 200 })
    )

    const { result } = renderHook(() =>
      useSSEChat({ endpoint: '/api/test' })
    )

    act(() => {
      result.current.sendMessage({ message: 'hi' })
    })

    await waitFor(() => {
      expect(result.current.streamingText).toBe('token')
    })

    expect(result.current.isStreaming).toBe(true)

    await act(async () => {
      resolveStream!()
      await flushAsync()
    })

    expect(result.current.isStreaming).toBe(false)
  })

  it('calls onError when fetch response is not ok', async () => {
    const onError = vi.fn()

    // Use a mock that explicitly returns !ok
    vi.mocked(fetch).mockResolvedValue(
      new Response('Session not found', { status: 404 })
    )

    const { result } = renderHook(() =>
      useSSEChat({ endpoint: '/api/test', onError })
    )

    await act(async () => {
      result.current.sendMessage({ message: 'hi' })
      await flushAsync()
    })

    expect(onError).toHaveBeenCalled()
    expect(result.current.isStreaming).toBe(false)
  })

  it('handles error events in the SSE stream', async () => {
    const onError = vi.fn()
    const onComplete = vi.fn()
    mockFetchWithSSE(['{"type":"error","message":"Model overloaded"}'])

    const { result } = renderHook(() =>
      useSSEChat({ endpoint: '/api/test', onError, onComplete })
    )

    await act(async () => {
      result.current.sendMessage({ message: 'hi' })
      await flushAsync()
    })

    expect(onError).toHaveBeenCalled()
    expect(onError.mock.calls[0][0].message).toBe('Model overloaded')
    expect(result.current.isStreaming).toBe(false)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('handles brief_ready events by completing with accumulated text', async () => {
    const onComplete = vi.fn()
    mockFetchWithSSE([
      'Based on what you told me, ',
      'here is your brief.',
      '{"type":"brief_ready","brief":{"gameOutcome":"loss"}}',
    ])

    const { result } = renderHook(() =>
      useSSEChat({ endpoint: '/api/test', onComplete })
    )

    await act(async () => {
      result.current.sendMessage({ sessionId: 1, userMessage: 'test' })
      await flushAsync()
    })

    expect(onComplete).toHaveBeenCalledWith(
      'Based on what you told me, here is your brief.'
    )
    expect(result.current.isStreaming).toBe(false)
  })

  it('handles chunked SSE data split across multiple reads', async () => {
    const onComplete = vi.fn()
    const encoder = new TextEncoder()

    // Simulate data split across chunk boundaries
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: Hel'))
        controller.enqueue(encoder.encode('lo\n\ndata: World\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    vi.mocked(fetch).mockResolvedValue(
      new Response(stream, { status: 200 })
    )

    const { result } = renderHook(() =>
      useSSEChat({ endpoint: '/api/test', onComplete })
    )

    await act(async () => {
      result.current.sendMessage({ message: 'hi' })
      await flushAsync()
    })

    expect(onComplete).toHaveBeenCalledWith('HelloWorld')
  })

  it('abort cancels the stream without calling onError', async () => {
    const onError = vi.fn()
    const onComplete = vi.fn()

    let resolveStream: () => void
    const streamPromise = new Promise<void>((resolve) => {
      resolveStream = resolve
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode('data: token\n\n'))
        await streamPromise
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    vi.mocked(fetch).mockResolvedValue(
      new Response(stream, { status: 200 })
    )

    const { result } = renderHook(() =>
      useSSEChat({ endpoint: '/api/test', onError, onComplete })
    )

    act(() => {
      result.current.sendMessage({ message: 'hi' })
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(true)
    })

    await act(async () => {
      result.current.abort()
      await flushAsync()
    })

    expect(result.current.isStreaming).toBe(false)
    expect(onError).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()

    // Clean up the pending promise
    resolveStream!()
  })

  it('sends POST request with correct headers and body', async () => {
    mockFetchWithSSE(['ok', '[DONE]'])

    const { result } = renderHook(() =>
      useSSEChat({ endpoint: '/api/ai/debrief/investigate' })
    )

    await act(async () => {
      result.current.sendMessage({ sessionId: 42, userMessage: 'I lost badly' })
      await flushAsync()
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/ai/debrief/investigate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 42, userMessage: 'I lost badly' }),
      })
    )
  })
})
