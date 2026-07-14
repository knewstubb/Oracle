'use client'

import { useState, useCallback, useRef } from 'react'
import { useSSEChat } from './useSSEChat'
import type {
  DebriefPhase,
  DebriefBrief,
  Recommendation,
  DebriefAction,
  DebriefSummary,
  ChatMessage,
} from '@/lib/debrief-types'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface DebriefState {
  phase: DebriefPhase
  sessionId: number | null
  messages: ChatMessage[]
  brief: DebriefBrief | null
  recommendations: Recommendation[]
  currentRecIndex: number
  actions: DebriefAction[]
  summary: DebriefSummary | null
  error: string | null
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseDebriefSessionReturn {
  state: DebriefState
  /** Start a new debrief session for the given deck */
  startSession: (deckId: number) => Promise<void>
  /** Send a user message during investigation */
  sendInvestigationMessage: (text: string) => void
  /** Confirm the extracted brief */
  confirmBrief: () => Promise<void>
  /** Request brief re-extraction after edit */
  editBrief: (correction: string) => void
  /** Take action on current recommendation */
  actOnRecommendation: (actionType: 'applied' | 'skipped' | 'disagreed') => Promise<void>
  /** Complete the session and get summary */
  completeSession: () => Promise<void>
  /** Streaming state from useSSEChat */
  isStreaming: boolean
  streamingText: string
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: DebriefState = {
  phase: 'idle',
  sessionId: null,
  messages: [],
  brief: null,
  recommendations: [],
  currentRecIndex: 0,
  actions: [],
  summary: null,
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

export function useDebriefSession(): UseDebriefSessionReturn {
  const [state, setState] = useState<DebriefState>(initialState)
  const sessionIdRef = useRef<number | null>(null)

  // SSE chat hook for investigation streaming
  const { sendMessage, streamingText, isStreaming } = useSSEChat({
    endpoint: '/api/ai/debrief/investigate',
    onComplete: (fullText) => {
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, createMessage('assistant', fullText)],
      }))
    },
    onEvent: (event) => {
      // Handle structured events like brief_ready
      if (event.type === 'brief_ready' && event.brief) {
        const brief = event.brief as DebriefBrief
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
  // startSession
  // ---------------------------------------------------------------------------

  const startSession = useCallback(async (deckId: number) => {
    try {
      setState((prev) => ({ ...prev, phase: 'investigating', error: null }))

      const res = await fetch('/api/ai/debrief/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId }),
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
        sessionId,
        messages: [createMessage('assistant', firstMessage)],
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start session'
      setState((prev) => ({
        ...prev,
        phase: 'idle',
        error: message,
      }))
    }
  }, [])

  // ---------------------------------------------------------------------------
  // sendInvestigationMessage
  // ---------------------------------------------------------------------------

  const sendInvestigationMessage = useCallback(
    (text: string) => {
      if (!sessionIdRef.current) return

      // Add user message immediately
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, createMessage('user', text)],
      }))

      // Stream the response via SSE
      sendMessage({
        sessionId: sessionIdRef.current,
        userMessage: text,
      })
    },
    [sendMessage]
  )

  // ---------------------------------------------------------------------------
  // confirmBrief
  // ---------------------------------------------------------------------------

  const confirmBrief = useCallback(async () => {
    if (!sessionIdRef.current) return

    try {
      setState((prev) => ({ ...prev, phase: 'analysing', error: null }))

      const res = await fetch('/api/ai/debrief/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const { recommendations } = (await res.json()) as {
        recommendations: Recommendation[]
      }

      setState((prev) => ({
        ...prev,
        phase: 'recommending',
        recommendations,
        currentRecIndex: 0,
        messages: [
          ...prev.messages,
          createMessage(
            'assistant',
            `I've analyzed your deck and have ${recommendations.length} recommendation${recommendations.length === 1 ? '' : 's'} for you. Let's go through them one at a time.`
          ),
        ],
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed'
      setState((prev) => ({
        ...prev,
        phase: 'confirming',
        error: message,
      }))
    }
  }, [])

  // ---------------------------------------------------------------------------
  // editBrief
  // ---------------------------------------------------------------------------

  const editBrief = useCallback(
    (correction: string) => {
      if (!sessionIdRef.current) return

      // Transition back to investigating
      setState((prev) => ({ ...prev, phase: 'investigating', brief: null }))

      // Send correction as a user message to the investigation stream
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, createMessage('user', correction)],
      }))

      sendMessage({
        sessionId: sessionIdRef.current,
        userMessage: correction,
      })
    },
    [sendMessage]
  )

  // ---------------------------------------------------------------------------
  // actOnRecommendation
  // ---------------------------------------------------------------------------

  const actOnRecommendation = useCallback(
    async (actionType: 'applied' | 'skipped' | 'disagreed') => {
      if (!sessionIdRef.current) return

      try {
        const res = await fetch('/api/ai/debrief/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            recommendationIndex: state.currentRecIndex,
            actionType,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || `HTTP ${res.status}`)
        }

        const nextIndex = state.currentRecIndex + 1

        // Add contextual message
        const rec = state.recommendations[state.currentRecIndex]
        let actionMessage: string
        if (actionType === 'applied') {
          actionMessage = `Done! Swapped out ${rec.cutCard} for ${rec.addCard}.`
        } else if (actionType === 'skipped') {
          actionMessage = `Skipped — keeping ${rec.cutCard} for now.`
        } else {
          actionMessage = `Noted — you disagree with cutting ${rec.cutCard}. We'll keep it.`
        }

        setState((prev) => ({
          ...prev,
          currentRecIndex: nextIndex,
          actions: [
            ...prev.actions,
            {
              id: Date.now(),
              sessionId: prev.sessionId!,
              actionType,
              cutCard: rec.cutCard,
              addCard: rec.addCard,
              reason: rec.reason,
              actionApplied: actionType === 'applied',
              createdAt: new Date().toISOString(),
            },
          ],
          messages: [...prev.messages, createMessage('assistant', actionMessage)],
        }))

        // If all recommendations have been actioned, auto-complete
        if (nextIndex >= state.recommendations.length) {
          // Trigger session completion
          const completeRes = await fetch('/api/ai/debrief/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionIdRef.current }),
          })

          if (completeRes.ok) {
            const { summary } = (await completeRes.json()) as {
              summary: DebriefSummary
            }

            setState((prev) => ({
              ...prev,
              phase: 'complete',
              summary,
              messages: [
                ...prev.messages,
                createMessage(
                  'assistant',
                  `All done! ${summary.totalApplied} change${summary.totalApplied === 1 ? '' : 's'} applied, ${summary.totalSkipped} skipped, ${summary.totalDisagreed} disagreed.`
                ),
              ],
            }))
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Action failed'
        setState((prev) => ({
          ...prev,
          error: message,
        }))
      }
    },
    [state.currentRecIndex, state.recommendations]
  )

  // ---------------------------------------------------------------------------
  // completeSession
  // ---------------------------------------------------------------------------

  const completeSession = useCallback(async () => {
    if (!sessionIdRef.current) return

    try {
      const res = await fetch('/api/ai/debrief/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const { summary } = (await res.json()) as { summary: DebriefSummary }

      setState((prev) => ({
        ...prev,
        phase: 'complete',
        summary,
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Completion failed'
      setState((prev) => ({
        ...prev,
        error: message,
      }))
    }
  }, [])

  return {
    state,
    startSession,
    sendInvestigationMessage,
    confirmBrief,
    editBrief,
    actOnRecommendation,
    completeSession,
    isStreaming,
    streamingText,
  }
}
