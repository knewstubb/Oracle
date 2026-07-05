'use client'

import { useState, useCallback, useRef } from 'react'
import { useSSEChat } from './useSSEChat'
import type {
  BrewPhase,
  StrategyBrief,
  DeckSkeleton,
  RefinementAction,
  SaveOptions,
  SaveResult,
} from '@/types/brew'
import type { ChatMessage } from '@/lib/debrief-types'
import type { Commander } from '@/components/CommanderSearch'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface BrewState {
  phase: BrewPhase
  sessionId: number | null
  pathType: 'commander' | 'concept' | null
  commander: Commander | null
  messages: ChatMessage[]
  brief: StrategyBrief | null
  skeleton: DeckSkeleton | null
  error: string | null
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseBrewSessionReturn {
  state: BrewState
  startSession: (pathType: 'commander' | 'concept') => Promise<void>
  resumeSession: (sessionId: number) => Promise<void>
  confirmCommander: (commander: Commander) => Promise<void>
  submitConcept: (description: string) => Promise<void>
  sendMessage: (text: string, modelId?: string) => void
  confirmBrief: () => Promise<void>
  editBrief: (correction: string) => void
  refine: (action: RefinementAction) => Promise<void>
  saveDeck: (options: SaveOptions) => Promise<SaveResult>
  abandonSession: () => Promise<void>
  isStreaming: boolean
  streamingText: string
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: BrewState = {
  phase: 'idle',
  sessionId: null,
  pathType: null,
  commander: null,
  messages: [],
  brief: null,
  skeleton: null,
  error: null,
}

// ---------------------------------------------------------------------------
// Helper: create a message object
// ---------------------------------------------------------------------------

function createMessage(
  role: 'user' | 'assistant' | 'system',
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

export function useBrewSession(): UseBrewSessionReturn {
  const [state, setState] = useState<BrewState>(initialState)
  const sessionIdRef = useRef<number | null>(null)
  const isRefiningRef = useRef(false)

  // SSE chat hook for investigation streaming
  const { sendMessage: sseSend, streamingText, isStreaming } = useSSEChat({
    endpoint: '/api/ai/brew/investigate',
    onComplete: (fullText) => {
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, createMessage('assistant', fullText)],
      }))
    },
    onEvent: (event) => {
      // Handle brief_ready event — transition to confirming
      if (event.type === 'brief_ready' && event.brief) {
        const brief = event.brief as StrategyBrief
        setState((prev) => ({
          ...prev,
          phase: 'confirming',
          brief,
        }))
      }
    },
    onError: (error) => {
      setState((prev) => ({
        ...prev,
        error: error.message,
      }))
    },
  })

  // ---------------------------------------------------------------------------
  // startSession — begin a new brew session
  // ---------------------------------------------------------------------------

  const startSession = useCallback(async (pathType: 'commander' | 'concept') => {
    setState((prev) => ({
      ...prev,
      phase: 'selecting',
      pathType,
      error: null,
    }))

    if (pathType === 'concept') {
      // Concept path needs the user to submit their description before we call the API
      setState((prev) => ({
        ...prev,
        phase: 'selecting',
        pathType,
      }))
    }
    // Commander path stays in 'selecting' until confirmCommander is called
  }, [])

  // ---------------------------------------------------------------------------
  // resumeSession — restore an existing session
  // ---------------------------------------------------------------------------

  const resumeSession = useCallback(async (sessionId: number) => {
    try {
      setState((prev) => ({ ...prev, error: null }))

      const res = await fetch(`/api/ai/brew/session?id=${sessionId}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const responseData = await res.json()
      const session = responseData.session ?? responseData
      sessionIdRef.current = session.id

      // Restore state from session data — parse JSON fields
      const rawConversation = session.conversation_json
        ? (typeof session.conversation_json === 'string' ? JSON.parse(session.conversation_json) : session.conversation_json)
        : []
      const messages: ChatMessage[] = rawConversation.map((m: { role: string; content: string }, i: number) => ({
        id: `${m.role}-restored-${i}`,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: Date.now() - (rawConversation.length - i) * 1000,
      }))

      const rawBrief = session.brief_json
        ? (typeof session.brief_json === 'string' ? JSON.parse(session.brief_json) : session.brief_json)
        : null
      const brief: StrategyBrief | null = rawBrief

      const rawSkeleton = session.skeleton_json
        ? (typeof session.skeleton_json === 'string' ? JSON.parse(session.skeleton_json) : session.skeleton_json)
        : null
      const skeleton: DeckSkeleton | null = rawSkeleton

      // Determine phase from session status
      let phase: BrewPhase = 'investigating'
      if (session.status === 'confirming') phase = 'confirming'
      else if (session.status === 'generating') phase = 'generating'
      else if (session.status === 'refining') phase = 'refining'
      else if (session.status === 'complete') phase = 'complete'

      setState((prev) => ({
        ...prev,
        phase,
        sessionId: session.id,
        pathType: session.path_type ?? session.pathType ?? null,
        commander: (session.commander_name ?? session.commanderName)
          ? {
              name: session.commander_name ?? session.commanderName,
              manaCost: '',
              typeLine: '',
              colorIdentity: (session.colour_identity ?? session.colourIdentity ?? '').split(',').filter(Boolean),
              oracleText: '',
              owned: false,
            }
          : null,
        messages,
        brief,
        skeleton,
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resume session'
      setState((prev) => ({
        ...prev,
        phase: 'idle',
        error: message,
      }))
    }
  }, [])

  // ---------------------------------------------------------------------------
  // confirmCommander — Path A: confirm the chosen commander
  // ---------------------------------------------------------------------------

  const confirmCommander = useCallback(async (commander: Commander) => {
    try {
      setState((prev) => ({ ...prev, commander, error: null }))

      const res = await fetch('/api/ai/brew/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pathType: 'commander',
          commanderName: commander.name,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const { sessionId, firstMessage } = (await res.json()) as {
        sessionId: number
        firstMessage: string
      }

      sessionIdRef.current = sessionId

      setState((prev) => ({
        ...prev,
        phase: 'investigating',
        sessionId,
        messages: [createMessage('assistant', firstMessage)],
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start session'
      setState((prev) => ({
        ...prev,
        phase: 'selecting',
        error: message,
      }))
    }
  }, [])

  // ---------------------------------------------------------------------------
  // submitConcept — Path B: submit a concept description
  // ---------------------------------------------------------------------------

  const submitConcept = useCallback(async (description: string) => {
    try {
      setState((prev) => ({ ...prev, error: null }))

      const res = await fetch('/api/ai/brew/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pathType: 'concept',
          conceptDescription: description,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const { sessionId, firstMessage } = (await res.json()) as {
        sessionId: number
        firstMessage: string
      }

      sessionIdRef.current = sessionId

      setState((prev) => ({
        ...prev,
        phase: 'investigating',
        sessionId,
        messages: [createMessage('assistant', firstMessage)],
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start session'
      setState((prev) => ({
        ...prev,
        phase: 'selecting',
        error: message,
      }))
    }
  }, [])

  // ---------------------------------------------------------------------------
  // sendMessage — send a user message during investigation
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    (text: string, modelId?: string) => {
      if (!sessionIdRef.current) return

      // Add user message immediately
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, createMessage('user', text)],
      }))

      // Stream the response via SSE
      sseSend({
        sessionId: sessionIdRef.current,
        userMessage: text,
        modelId,
      })
    },
    [sseSend]
  )

  // ---------------------------------------------------------------------------
  // confirmBrief — confirm the strategy brief and trigger generation
  // ---------------------------------------------------------------------------

  const confirmBrief = useCallback(async () => {
    if (!sessionIdRef.current) return

    try {
      setState((prev) => ({ ...prev, error: null }))

      // Step 1: Confirm the brief
      const confirmRes = await fetch('/api/ai/brew/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      })

      if (!confirmRes.ok) {
        const data = await confirmRes.json()
        throw new Error(data.error || `HTTP ${confirmRes.status}`)
      }

      // Step 2: Transition to generating and call generate endpoint
      setState((prev) => ({ ...prev, phase: 'generating' }))

      const genRes = await fetch('/api/ai/brew/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      })

      if (!genRes.ok) {
        const data = await genRes.json()
        throw new Error(data.error || `HTTP ${genRes.status}`)
      }

      const { skeleton } = (await genRes.json()) as { skeleton: DeckSkeleton }

      setState((prev) => ({
        ...prev,
        phase: 'refining',
        skeleton,
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed'
      setState((prev) => ({
        ...prev,
        phase: 'confirming',
        error: message,
      }))
    }
  }, [])

  // ---------------------------------------------------------------------------
  // editBrief — reject the brief and send correction
  // ---------------------------------------------------------------------------

  const editBrief = useCallback(
    (correction: string) => {
      if (!sessionIdRef.current) return

      // Transition back to investigating, clear brief
      setState((prev) => ({
        ...prev,
        phase: 'investigating',
        brief: null,
        messages: [...prev.messages, createMessage('user', correction)],
      }))

      // Send correction as a message to continue investigating
      sseSend({
        sessionId: sessionIdRef.current,
        userMessage: correction,
      })
    },
    [sseSend]
  )

  // ---------------------------------------------------------------------------
  // refine — apply a refinement action to the skeleton
  // ---------------------------------------------------------------------------

  const refine = useCallback(async (action: RefinementAction) => {
    if (!sessionIdRef.current || isRefiningRef.current) return

    isRefiningRef.current = true

    try {
      setState((prev) => ({ ...prev, error: null }))

      const res = await fetch('/api/ai/brew/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          action,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const { skeleton } = (await res.json()) as { skeleton: DeckSkeleton }

      setState((prev) => ({
        ...prev,
        skeleton,
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Refinement failed'
      setState((prev) => ({
        ...prev,
        error: message,
      }))
    } finally {
      isRefiningRef.current = false
    }
  }, [])

  // ---------------------------------------------------------------------------
  // saveDeck — save the completed deck
  // ---------------------------------------------------------------------------

  const saveDeck = useCallback(async (options: SaveOptions): Promise<SaveResult> => {
    if (!sessionIdRef.current) {
      return { success: false, error: 'No active session' }
    }

    try {
      setState((prev) => ({ ...prev, phase: 'saving', error: null }))

      const res = await fetch('/api/ai/brew/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          ...options,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const result = (await res.json()) as SaveResult

      setState((prev) => ({
        ...prev,
        phase: 'complete',
      }))

      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed'
      setState((prev) => ({
        ...prev,
        phase: 'refining',
        error: message,
      }))
      return { success: false, error: message }
    }
  }, [])

  // ---------------------------------------------------------------------------
  // abandonSession — abandon the current session
  // ---------------------------------------------------------------------------

  const abandonSession = useCallback(async () => {
    if (sessionIdRef.current) {
      // Fire-and-forget — don't block UI on this
      fetch('/api/ai/brew/session', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      }).catch(() => {
        // Silently ignore — local state reset is sufficient
      })
    }

    sessionIdRef.current = null
    setState(initialState)
  }, [])

  return {
    state,
    startSession,
    resumeSession,
    confirmCommander,
    submitConcept,
    sendMessage,
    confirmBrief,
    editBrief,
    refine,
    saveDeck,
    abandonSession,
    isStreaming,
    streamingText,
  }
}
