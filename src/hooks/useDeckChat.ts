'use client'

import { useState, useCallback, useRef } from 'react'
import { useSSEChat } from './useSSEChat'
import type { ChatMessage } from '@/lib/debrief-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseDeckChatReturn {
  messages: ChatMessage[]
  sendMessage: (text: string) => void
  isStreaming: boolean
  streamingText: string
  clearMessages: () => void
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function createMessage(
  role: 'user' | 'assistant',
  content: string
): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDeckChat(deckId: number): UseDeckChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const historyRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([])

  const { sendMessage: sendSSE, streamingText, isStreaming } = useSSEChat({
    endpoint: `/api/decks/${deckId}/chat`,
    onComplete: (fullText) => {
      // Add assistant message to state
      setMessages((prev) => [...prev, createMessage('assistant', fullText)])
      // Update history ref for next request
      historyRef.current = [
        ...historyRef.current,
        { role: 'assistant', content: fullText },
      ]
    },
    onError: (error) => {
      console.error('[useDeckChat] Error:', error)
      setMessages((prev) => [
        ...prev,
        createMessage('assistant', `Sorry, something went wrong: ${error.message}`),
      ])
    },
  })

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return

      // Add user message to state
      const userMessage = createMessage('user', text)
      setMessages((prev) => [...prev, userMessage])

      // Update history ref
      historyRef.current = [...historyRef.current, { role: 'user', content: text }]

      // Send to API
      sendSSE({
        message: text,
        history: historyRef.current.slice(0, -1), // Exclude the message we just added
      })
    },
    [sendSSE]
  )

  const clearMessages = useCallback(() => {
    setMessages([])
    historyRef.current = []
  }, [])

  return {
    messages,
    sendMessage,
    isStreaming,
    streamingText,
    clearMessages,
  }
}
