'use client'

import { useState, useCallback, useRef } from 'react'
import { useSSEChat } from './useSSEChat'
import type { ChatMessage } from '@/lib/debrief-types'
import type { ProposalGroup } from '@/components/ChatProposalCards'

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

  // Suggestions arrive as a page-only event during the stream; they are attached to the reply when it ends.
  const proposalsRef = useRef<ProposalGroup | null>(null)

  const { sendMessage: sendSSE, streamingText, isStreaming } = useSSEChat({
    endpoint: `/api/decks/${deckId}/chat`,
    onEvent: (event) => {
      if (event.type === 'add_proposals' && Array.isArray(event.proposals) && typeof event.deckId === 'number') {
        const more = event.proposals as ProposalGroup['proposals']
        const cur = proposalsRef.current
        proposalsRef.current = cur
          ? { ...cur, proposals: [...cur.proposals, ...more] }
          : { deckId: event.deckId, deckName: String(event.deckName ?? 'this deck'), proposals: more }
      }
    },
    onComplete: (fullText) => {
      // Add assistant message to state
      const proposals = proposalsRef.current ?? undefined
      proposalsRef.current = null
      const reply = createMessage('assistant', fullText)
      setMessages((prev) => [...prev, proposals ? { ...reply, proposals } : reply])
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
