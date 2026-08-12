'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionType = 'exploration' | 'deck' | 'collection' | 'general'
export type SessionStatus = 'active' | 'exploring' | 'building' | 'complete'

export interface OracleContext {
  type: 'collection' | 'deck' | 'deck-list' | 'forge' | 'workbench' | 'general' | 'exploration'
  deckId?: number
  deckName?: string
  commanderName?: string
}

export interface OracleSession {
  id: string
  sessionName: string | null
  sessionType: SessionType
  status: SessionStatus
  contextDeckId: number | null
  commanderName: string | null
  lastMessageAt: string
  messageCount: number
  startedAt: string
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
  activeSession: OracleSession | null
  isStreaming: boolean
  isLoadingHistory: boolean
  isHistoryPanelOpen: boolean
}

interface OracleContextValue extends OracleState {
  // Sidebar controls
  toggle: () => void
  open: () => void
  close: () => void
  setWidth: (width: number) => void
  
  // History panel
  openHistoryPanel: () => void
  closeHistoryPanel: () => void
  
  // Context management
  setContext: (context: OracleContext) => void
  
  // Session management
  loadSession: (sessionId: string) => Promise<void>
  startNewSession: (sessionType: SessionType, deckId?: number) => Promise<OracleSession | null>
  
  // Chat
  sendMessage: (text: string) => Promise<void>
  clearMessages: () => void
  
  // For pages to trigger data refresh after Oracle actions
  invalidateQueries: (keys: string[]) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WIDTH = 380
const MIN_WIDTH = 320
const MAX_WIDTH = 600
const STORAGE_KEY_OPEN = 'oracle-sidebar-open'
const STORAGE_KEY_WIDTH = 'oracle-sidebar-width'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map page context type to session type */
function contextToSessionType(contextType: OracleContext['type']): SessionType {
  switch (contextType) {
    case 'deck':
    case 'workbench':
      return 'deck'
    case 'collection':
      return 'collection'
    case 'exploration':
      return 'exploration'
    case 'forge':
    case 'deck-list':
    case 'general':
    default:
      return 'general'
  }
}

/** Transform API session to OracleSession */
function transformSession(apiSession: Record<string, unknown>): OracleSession {
  return {
    id: apiSession.id as string,
    sessionName: apiSession.session_name as string | null,
    sessionType: apiSession.session_type as SessionType,
    status: apiSession.status as SessionStatus,
    contextDeckId: apiSession.context_deck_id as number | null,
    commanderName: apiSession.commander_name as string | null,
    lastMessageAt: apiSession.last_message_at as string,
    messageCount: apiSession.message_count as number,
    startedAt: apiSession.started_at as string,
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const OracleCtx = createContext<OracleContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function OracleProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  
  // Core state
  const [isOpen, setIsOpen] = useState(false)
  const [width, setWidthState] = useState(DEFAULT_WIDTH)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeContext, setActiveContext] = useState<OracleContext>({ type: 'general' })
  const [activeSession, setActiveSession] = useState<OracleSession | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  
  // Track context changes to trigger session loading
  const lastContextKey = useRef<string | null>(null)
  
  // Track if we've generated a name for the current session
  const hasGeneratedName = useRef(false)

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

  // Keyboard shortcut: Cmd+Shift+O to toggle Oracle (changed from Cmd+O to avoid browser conflict)
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'o') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
      // Esc to close sidebar
      if (e.key === 'Escape' && isOpen) {
        if (isHistoryPanelOpen) {
          setIsHistoryPanelOpen(false)
        } else {
          setIsOpen(false)
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isHistoryPanelOpen])

  // ---------------------------------------------------------------------------
  // Session Management
  // ---------------------------------------------------------------------------

  /** Build context key for comparison */
  const getContextKey = useCallback((ctx: OracleContext): string => {
    const sessionType = contextToSessionType(ctx.type)
    if (sessionType === 'deck' && ctx.deckId) {
      return `deck-${ctx.deckId}`
    }
    return sessionType
  }, [])

  /** Load or create session when context changes */
  useEffect(() => {
    if (!isHydrated) return
    
    const contextKey = getContextKey(activeContext)
    
    // Skip if context hasn't changed
    if (contextKey === lastContextKey.current) return
    lastContextKey.current = contextKey
    
    const loadOrCreateSession = async () => {
      setIsLoadingHistory(true)
      hasGeneratedName.current = false
      
      try {
        const sessionType = contextToSessionType(activeContext.type)
        const deckId = activeContext.type === 'deck' ? activeContext.deckId : undefined
        
        // Try to get active session within 4-hour window
        const params = new URLSearchParams({ type: sessionType })
        if (deckId) params.set('deckId', String(deckId))
        
        const res = await fetch(`/api/oracle/sessions/active?${params.toString()}`)
        
        if (!res.ok) {
          console.error('[Oracle] Failed to fetch active session')
          setMessages([])
          setActiveSession(null)
          return
        }
        
        const data = await res.json()
        
        if (data.session && !data.shouldCreateNew) {
          // Use existing session
          setActiveSession(transformSession(data.session))
          setMessages(data.messages ?? [])
          hasGeneratedName.current = !!data.session.session_name
        } else {
          // Create new session
          const createRes = await fetch('/api/oracle/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionType,
              contextDeckId: deckId,
            }),
          })
          
          if (createRes.ok) {
            const createData = await createRes.json()
            setActiveSession(transformSession(createData.session))
            setMessages([])
          } else {
            console.error('[Oracle] Failed to create session')
            setActiveSession(null)
            setMessages([])
          }
        }
      } catch (err) {
        console.error('[Oracle] Session load error:', err)
        setActiveSession(null)
        setMessages([])
      } finally {
        setIsLoadingHistory(false)
      }
    }
    
    loadOrCreateSession()
  }, [isHydrated, activeContext, getContextKey])

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

  const openHistoryPanel = useCallback(() => setIsHistoryPanelOpen(true), [])
  const closeHistoryPanel = useCallback(() => setIsHistoryPanelOpen(false), [])

  // ---------------------------------------------------------------------------
  // Context management
  // ---------------------------------------------------------------------------

  const setContext = useCallback((context: OracleContext) => {
    setActiveContext(prev => {
      // Only update if actually changed
      if (
        prev.type === context.type &&
        prev.deckId === context.deckId &&
        prev.deckName === context.deckName &&
        prev.commanderName === context.commanderName
      ) {
        return prev
      }
      return context
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Session management (public API)
  // ---------------------------------------------------------------------------

  const loadSession = useCallback(async (sessionId: string) => {
    setIsLoadingHistory(true)
    hasGeneratedName.current = false
    
    try {
      const res = await fetch(`/api/oracle/sessions/${sessionId}`)
      if (!res.ok) {
        console.error('[Oracle] Failed to load session')
        return
      }
      
      const data = await res.json()
      setActiveSession(transformSession(data.session))
      setMessages(data.messages ?? [])
      hasGeneratedName.current = !!data.session.session_name
      
      // Update context to match session
      if (data.session.session_type === 'exploration') {
        setActiveContext({ type: 'exploration' })
      } else if (data.session.session_type === 'deck' && data.session.context_deck_id) {
        setActiveContext({
          type: 'deck',
          deckId: data.session.context_deck_id,
        })
      } else if (data.session.session_type === 'collection') {
        setActiveContext({ type: 'collection' })
      } else {
        setActiveContext({ type: 'general' })
      }
      
      // Close history panel after selecting
      setIsHistoryPanelOpen(false)
    } catch (err) {
      console.error('[Oracle] Load session error:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [])

  const startNewSession = useCallback(async (sessionType: SessionType, deckId?: number): Promise<OracleSession | null> => {
    try {
      const res = await fetch('/api/oracle/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionType,
          contextDeckId: deckId,
        }),
      })
      
      if (!res.ok) {
        console.error('[Oracle] Failed to create session')
        return null
      }
      
      const data = await res.json()
      const session = transformSession(data.session)
      
      setActiveSession(session)
      setMessages([])
      hasGeneratedName.current = false
      
      // Update lastContextKey so the effect doesn't reload
      const newContextKey = sessionType === 'deck' && deckId ? `deck-${deckId}` : sessionType
      lastContextKey.current = newContextKey
      
      return session
    } catch (err) {
      console.error('[Oracle] Create session error:', err)
      return null
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return
    if (!activeSession) {
      console.error('[Oracle] No active session')
      return
    }

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

    let fullResponseText = ''

    try {
      const res = await fetch('/api/oracle/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          context: activeContext,
          history: messages.slice(-20),
          sessionId: activeSession.id,
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
                fullResponseText += parsed.content
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: msg.content + parsed.content }
                      : msg
                  )
                )
              } else if (parsed.type === 'action') {
                if (parsed.invalidate) {
                  for (const key of parsed.invalidate) {
                    queryClient.invalidateQueries({ queryKey: [key] })
                  }
                }
              } else if (parsed.type === 'add_cards' && parsed.cards && activeContext.deckId) {
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
                queryClient.invalidateQueries({ queryKey: ['decks', activeContext.deckId] })
                queryClient.invalidateQueries({ queryKey: ['decks', activeContext.deckId, 'card-statuses'] })
              } else if (parsed.type === 'remove_cards' && parsed.cards && activeContext.deckId) {
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
                queryClient.invalidateQueries({ queryKey: ['decks', activeContext.deckId] })
                queryClient.invalidateQueries({ queryKey: ['decks', activeContext.deckId, 'card-statuses'] })
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      // After streaming completes, generate session name if this is the first AI response
      if (!hasGeneratedName.current && fullResponseText && activeSession) {
        hasGeneratedName.current = true
        // Fire and forget — don't block on name generation
        fetch(`/api/oracle/sessions/${activeSession.id}/generate-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responseContent: fullResponseText }),
        })
          .then(async (nameRes) => {
            if (nameRes.ok) {
              const nameData = await nameRes.json()
              if (nameData.sessionName && !nameData.skipped) {
                setActiveSession(prev =>
                  prev ? { ...prev, sessionName: nameData.sessionName } : prev
                )
              }
            }
          })
          .catch(err => console.error('[Oracle] Name generation failed:', err))
      }

      // Update session's message count locally
      setActiveSession(prev =>
        prev ? { ...prev, messageCount: prev.messageCount + 2, lastMessageAt: new Date().toISOString() } : prev
      )
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
  }, [messages, activeContext, activeSession, isStreaming, queryClient])

  const clearMessages = useCallback(async () => {
    setMessages([])
    if (!activeSession) return
    
    // Clear from DB — delete the session and create a new one
    try {
      await fetch(`/api/oracle/sessions/${activeSession.id}`, { method: 'DELETE' })
      
      // Create a fresh session for the same context
      const sessionType = contextToSessionType(activeContext.type)
      const deckId = activeContext.type === 'deck' ? activeContext.deckId : undefined
      
      const createRes = await fetch('/api/oracle/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionType, contextDeckId: deckId }),
      })
      
      if (createRes.ok) {
        const createData = await createRes.json()
        setActiveSession(transformSession(createData.session))
        hasGeneratedName.current = false
      }
    } catch (err) {
      console.error('[Oracle] Failed to clear session:', err)
    }
  }, [activeContext, activeSession])

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
    activeSession,
    isStreaming,
    isLoadingHistory,
    isHistoryPanelOpen,
    toggle,
    open,
    close,
    setWidth,
    openHistoryPanel,
    closeHistoryPanel,
    setContext,
    loadSession,
    startNewSession,
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
