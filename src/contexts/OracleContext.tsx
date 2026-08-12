'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OracleContext {
  type: 'collection' | 'deck' | 'deck-list' | 'forge' | 'workbench' | 'general'
  deckId?: number
  sessionId?: string
  deckName?: string
  commanderName?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

interface OracleState {
  isOpen: boolean
  width: number
  messages: ChatMessage[]
  activeContext: OracleContext
  isStreaming: boolean
  isLoadingHistory: boolean
}

interface OracleContextValue extends OracleState {
  // Sidebar controls
  toggle: () => void
  open: () => void
  close: () => void
  setWidth: (width: number) => void
  
  // Context management
  setContext: (context: OracleContext) => void
  
  // Chat
  sendMessage: (text: string) => Promise<void>
  clearMessages: () => void
  
  // For pages to trigger data refresh after Oracle actions
  invalidateQueries: (keys: string[]) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WIDTH = 420
const MIN_WIDTH = 320
const MAX_WIDTH = 600
const STORAGE_KEY_OPEN = 'oracle-sidebar-open'
const STORAGE_KEY_WIDTH = 'oracle-sidebar-width'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const OracleCtx = createContext<OracleContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function OracleProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  
  // Initialize from localStorage (client-side only)
  const [isOpen, setIsOpen] = useState(false)
  const [width, setWidthState] = useState(DEFAULT_WIDTH)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeContext, setActiveContext] = useState<OracleContext>({ type: 'general' })
  const [isStreaming, setIsStreaming] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [isHydrated, setIsHydrated] = useState(false)
  
  // Track last loaded context to avoid redundant fetches
  const [lastLoadedContext, setLastLoadedContext] = useState<string | null>(null)

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const storedOpen = localStorage.getItem(STORAGE_KEY_OPEN)
    const storedWidth = localStorage.getItem(STORAGE_KEY_WIDTH)
    
    if (storedOpen !== null) {
      setIsOpen(storedOpen === 'true')
    }
    if (storedWidth !== null) {
      const parsed = parseInt(storedWidth, 10)
      if (!isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
        setWidthState(parsed)
      }
    }
    
    setIsHydrated(true)
  }, [])

  // Keyboard shortcut: Cmd+O to toggle Oracle
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Helper to build context key for comparison
  const getContextKey = useCallback((ctx: OracleContext) => {
    if (ctx.type === 'deck' && ctx.deckId) {
      return `deck-${ctx.deckId}`
    }
    return ctx.type
  }, [])

  // Load message history for current context
  useEffect(() => {
    if (!isHydrated) return
    
    const contextKey = getContextKey(activeContext)
    
    // Skip if we already loaded this context
    if (contextKey === lastLoadedContext) return
    
    const loadHistory = async () => {
      setIsLoadingHistory(true)
      try {
        // Build query params based on context
        const params = new URLSearchParams()
        params.set('contextType', activeContext.type)
        if (activeContext.type === 'deck' && activeContext.deckId) {
          params.set('deckId', String(activeContext.deckId))
        }
        
        const res = await fetch(`/api/oracle/history?${params.toString()}`)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages ?? [])
          setLastLoadedContext(contextKey)
        }
      } catch (err) {
        console.error('[Oracle] Failed to load history:', err)
      } finally {
        setIsLoadingHistory(false)
      }
    }
    
    loadHistory()
  }, [isHydrated, activeContext, lastLoadedContext, getContextKey])

  // Persist open state to localStorage
  useEffect(() => {
    if (!isHydrated) return
    localStorage.setItem(STORAGE_KEY_OPEN, String(isOpen))
  }, [isOpen, isHydrated])

  // Persist width to localStorage
  useEffect(() => {
    if (!isHydrated) return
    localStorage.setItem(STORAGE_KEY_WIDTH, String(width))
  }, [width, isHydrated])

  // ---------------------------------------------------------------------------
  // Sidebar controls
  // ---------------------------------------------------------------------------

  const toggle = useCallback(() => setIsOpen(prev => !prev), [])
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  
  const setWidth = useCallback((newWidth: number) => {
    setWidthState(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth)))
  }, [])

  // ---------------------------------------------------------------------------
  // Context management
  // ---------------------------------------------------------------------------

  const setContext = useCallback((context: OracleContext) => {
    setActiveContext(prev => {
      // Only update if actually changed (avoid unnecessary rerenders)
      if (
        prev.type === context.type &&
        prev.deckId === context.deckId &&
        prev.deckName === context.deckName &&
        prev.commanderName === context.commanderName
      ) {
        return prev
      }
      // Context changed — clear lastLoadedContext to trigger history reload
      setLastLoadedContext(null)
      return context
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    }

    setMessages(prev => [...prev, userMsg])
    setIsStreaming(true)

    // Create placeholder for assistant response
    const assistantMsgId = `msg-${Date.now() + 1}`
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, assistantMsg])

    try {
      const res = await fetch('/api/oracle/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          context: activeContext,
          history: messages.slice(-20), // Last 20 messages for context
        }),
      })

      if (!res.ok) {
        throw new Error('Chat request failed')
      }

      // Handle SSE streaming
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              
              if (parsed.type === 'text') {
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: msg.content + parsed.content }
                      : msg
                  )
                )
              } else if (parsed.type === 'action') {
                // Oracle performed an action — invalidate relevant queries
                if (parsed.invalidate) {
                  for (const key of parsed.invalidate) {
                    queryClient.invalidateQueries({ queryKey: [key] })
                  }
                }
              } else if (parsed.type === 'add_cards' && parsed.cards && activeContext.deckId) {
                // AI called add_cards_to_deck tool — add cards to the deck
                const cards = parsed.cards as Array<{ name: string; category: string }>
                for (const card of cards) {
                  try {
                    await fetch(`/api/decks/${activeContext.deckId}/cards`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        cardName: card.name,
                        quantity: 1,
                        category: card.category,
                      }),
                    })
                  } catch (cardErr) {
                    console.error(`[Oracle] Failed to add card ${card.name}:`, cardErr)
                  }
                }
                // Invalidate deck queries to refresh UI (use normalized keys)
                queryClient.invalidateQueries({ queryKey: ['decks', activeContext.deckId] })
                queryClient.invalidateQueries({ queryKey: ['decks', activeContext.deckId, 'card-statuses'] })
              } else if (parsed.type === 'remove_cards' && parsed.cards && activeContext.deckId) {
                // AI called remove_cards_from_deck tool — remove cards from the deck
                const cards = parsed.cards as Array<{ name: string }>
                for (const card of cards) {
                  try {
                    await fetch(`/api/decks/${activeContext.deckId}/cards`, {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ cardName: card.name }),
                    })
                  } catch (cardErr) {
                    console.error(`[Oracle] Failed to remove card ${card.name}:`, cardErr)
                  }
                }
                // Invalidate deck queries to refresh UI
                queryClient.invalidateQueries({ queryKey: ['decks', activeContext.deckId] })
                queryClient.invalidateQueries({ queryKey: ['decks', activeContext.deckId, 'card-statuses'] })
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (err) {
      console.error('[Oracle] Chat error:', err)
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMsgId
            ? { ...msg, content: 'Sorry, something went wrong. Please try again.' }
            : msg
        )
      )
    } finally {
      setIsStreaming(false)
    }
  }, [messages, activeContext, isStreaming, queryClient])

  const clearMessages = useCallback(async () => {
    setMessages([])
    // Clear from DB for current context only
    try {
      const params = new URLSearchParams()
      params.set('contextType', activeContext.type)
      if (activeContext.type === 'deck' && activeContext.deckId) {
        params.set('deckId', String(activeContext.deckId))
      }
      await fetch(`/api/oracle/history?${params.toString()}`, { method: 'DELETE' })
    } catch (err) {
      console.error('[Oracle] Failed to clear history:', err)
    }
  }, [activeContext])

  // ---------------------------------------------------------------------------
  // Query invalidation helper
  // ---------------------------------------------------------------------------

  const invalidateQueries = useCallback((keys: string[]) => {
    for (const key of keys) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
  }, [queryClient])

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------

  const value: OracleContextValue = {
    isOpen,
    width,
    messages,
    activeContext,
    isStreaming,
    isLoadingHistory,
    toggle,
    open,
    close,
    setWidth,
    setContext,
    sendMessage,
    clearMessages,
    invalidateQueries,
  }

  return <OracleCtx.Provider value={value}>{children}</OracleCtx.Provider>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOracle() {
  const ctx = useContext(OracleCtx)
  if (!ctx) {
    throw new Error('useOracle must be used within OracleProvider')
  }
  return ctx
}

/**
 * Hook for pages to set their Oracle context on mount.
 * Automatically cleans up to 'general' on unmount.
 */
export function useOracleContext(context: OracleContext) {
  const { setContext } = useOracle()
  
  useEffect(() => {
    setContext(context)
    
    return () => {
      setContext({ type: 'general' })
    }
  }, [context.type, context.deckId, context.deckName, context.commanderName, setContext])
}
