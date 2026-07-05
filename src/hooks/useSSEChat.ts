'use client'

import { useState, useRef, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseSSEChatOptions {
  /** API endpoint to POST to for SSE responses */
  endpoint: string
  /** Called when stream completes with the full accumulated message */
  onComplete?: (fullText: string) => void
  /** Called on stream error */
  onError?: (error: Error) => void
  /** Called when a structured event is received (JSON with a `type` field) */
  onEvent?: (event: Record<string, unknown>) => void
}

export interface UseSSEChatReturn {
  /** Send a message and begin streaming the response */
  sendMessage: (body: Record<string, unknown>) => void
  /** Current streaming text (accumulated tokens) */
  streamingText: string
  /** Whether currently receiving tokens */
  isStreaming: boolean
  /** Abort the current stream */
  abort: () => void
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

export function useSSEChat(options: UseSSEChatOptions): UseSSEChatReturn {
  const { endpoint, onComplete, onError, onEvent } = options

  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsStreaming(false)
  }, [])

  const sendMessage = useCallback(
    (body: Record<string, unknown>) => {
      // Abort any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      // Reset state for new stream
      setStreamingText('')
      setIsStreaming(true)

      let accumulated = ''

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorText = await response.text().catch(() => '')
            throw new Error(
              `SSE request failed: ${response.status}${errorText ? ` — ${errorText}` : ''}`
            )
          }

          const reader = response.body?.getReader()
          if (!reader) {
            throw new Error('Response body is null — SSE streaming not supported')
          }

          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            // Process complete SSE lines from the buffer
            const lines = buffer.split('\n')
            // Keep the last (possibly incomplete) line in the buffer
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue

              const data = line.slice(6) // Remove 'data: ' prefix

              // Stream completion signal
              if (data === '[DONE]') {
                setIsStreaming(false)
                abortControllerRef.current = null
                onComplete?.(accumulated)
                return
              }

              // Try to parse structured JSON events
              if (data.startsWith('{')) {
                try {
                  const parsed = JSON.parse(data) as Record<string, unknown>

                  // Error event — call onError and stop
                  if (parsed.type === 'error') {
                    const msg = (parsed.message as string) || 'Stream error'
                    setIsStreaming(false)
                    abortControllerRef.current = null
                    onError?.(new Error(msg))
                    return
                  }

                  // brief_ready event — notify via onEvent and complete the stream
                  if (parsed.type === 'brief_ready') {
                    onEvent?.(parsed)
                    setIsStreaming(false)
                    abortControllerRef.current = null
                    onComplete?.(accumulated)
                    return
                  }

                  // Other structured events — forward to onEvent callback
                  onEvent?.(parsed)
                  continue
                } catch {
                  // Not valid JSON — fall through to treat as token text
                }
              }

              // Regular token text — accumulate
              // Check if it's a JSON-encoded string (from validated full responses)
              if (data.startsWith('"') && data.endsWith('"')) {
                try {
                  const decoded = JSON.parse(data) as string
                  accumulated += decoded
                  setStreamingText(accumulated)
                  continue
                } catch {
                  // Not valid JSON string — fall through
                }
              }
              accumulated += data
              setStreamingText(accumulated)
            }
          }

          // Stream ended without [DONE] — finalise with what we have
          if (accumulated) {
            setIsStreaming(false)
            abortControllerRef.current = null
            onComplete?.(accumulated)
          } else {
            setIsStreaming(false)
            abortControllerRef.current = null
          }
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') {
            // User-initiated abort — don't treat as error
            setIsStreaming(false)
            return
          }
          setIsStreaming(false)
          abortControllerRef.current = null
          const error = err instanceof Error ? err : new Error(String(err))
          onError?.(error)
        })
    },
    [endpoint, onComplete, onError, onEvent]
  )

  return { sendMessage, streamingText, isStreaming, abort }
}
