'use client'

// ---------------------------------------------------------------------------
// useBrewAutosave — Unified client-side autosave hook for brew sessions
// ---------------------------------------------------------------------------
// Watches all state slices via useRef comparisons, debounces changes (2000ms
// trailing-edge), and flushes dirty fields via PATCH /api/brew/session/[id].
//
// On beforeunload and Next.js route change: flushes pending writes via
// navigator.sendBeacon (fallback: fetch with keepalive: true).
//
// Retry strategy: single retry on 5xx/network failure after 5000ms using
// latest state at retry time. No retry on 4xx.
//
// Validates: Requirements 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 6.2, 6.3, 6.4,
//            8.1, 8.2, 8.3, 8.4, 8.5
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

import type { ChatMessage } from '@/lib/debrief-types'
import type {
  DecisionLog,
  DeckState,
  BrewPhaseV2,
  CommittedCommander,
} from '@/lib/brew-v2-types'

import {
  serializeMessages,
  serializeDecisionLog,
  serializeDeckState,
} from '@/lib/brew-autosave-serializers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DirtyField =
  | 'conversation_json'
  | 'decision_log_json'
  | 'skeleton_json'
  | 'phase_commander'

export interface UseBrewAutosaveOptions {
  sessionId: number | null
  messages: ChatMessage[]
  decisionLog: DecisionLog
  deckState: DeckState
  phase: BrewPhaseV2
  commander: CommittedCommander | null
}

export interface UseBrewAutosaveReturn {
  /** Whether a save is currently in-flight */
  isSaving: boolean
  /** Timestamp of last successful save (null if never saved) */
  lastSavedAt: number | null
  /** Force an immediate flush (e.g. before intentional navigation) */
  flush: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 2000
const RETRY_DELAY_MS = 5000

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBrewAutosave(
  options: UseBrewAutosaveOptions
): UseBrewAutosaveReturn {
  const { sessionId, messages, decisionLog, deckState, phase, commander } =
    options

  // --- Return state ---
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  // --- Previous refs for dirty detection ---
  const prevMessagesRef = useRef<ChatMessage[]>(messages)
  const prevDecisionLogRef = useRef<DecisionLog>(decisionLog)
  const prevDeckStateRef = useRef<DeckState>(deckState)
  const prevPhaseRef = useRef<BrewPhaseV2>(phase)
  const prevCommanderRef = useRef<CommittedCommander | null>(commander)

  // --- Dirty field accumulator ---
  const dirtyFieldsRef = useRef<Set<DirtyField>>(new Set())

  // --- Debounce timer ---
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- Retry timer ---
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- Latest state refs (for retry with latest state) ---
  const latestOptionsRef = useRef(options)
  const sessionIdRef = useRef(sessionId)

  // --- Ref to hold performSave for self-referencing in retry ---
  const performSaveRef = useRef<
    (dirtyFields: Set<DirtyField>, isRetry?: boolean) => Promise<void>
  >(async () => {})

  // --- Pathname tracking for route-change flush ---
  const pathname = usePathname()
  const prevPathnameRef = useRef(pathname)

  // --- Keep refs synchronized via effect (not during render) ---
  useEffect(() => {
    latestOptionsRef.current = options
    sessionIdRef.current = sessionId
  })

  // ---------------------------------------------------------------------------
  // buildPayload — serialize only dirty fields into a PATCH body
  // ---------------------------------------------------------------------------

  const buildPayload = useCallback(
    (
      dirtyFields: Set<DirtyField>,
      opts: UseBrewAutosaveOptions
    ): Record<string, unknown> => {
      const body: Record<string, unknown> = {}

      if (dirtyFields.has('conversation_json')) {
        body.conversation_json = serializeMessages(opts.messages)
      }

      if (dirtyFields.has('decision_log_json')) {
        body.decision_log_json = serializeDecisionLog(opts.decisionLog)
      }

      if (dirtyFields.has('skeleton_json')) {
        body.skeleton_json = serializeDeckState(opts.deckState)
      }

      if (dirtyFields.has('phase_commander')) {
        body.status = opts.phase
        body.commander_name = opts.commander?.name ?? null
        body.colour_identity = opts.commander?.colourIdentity?.join(',') ?? null
        body.path_type = opts.commander?.archetype ?? null
      }

      return body
    },
    []
  )

  // ---------------------------------------------------------------------------
  // performSave — execute PATCH call with retry logic
  // ---------------------------------------------------------------------------

  const performSave = useCallback(
    async (dirtyFields: Set<DirtyField>, isRetry = false): Promise<void> => {
      const currentSessionId = sessionIdRef.current
      if (!currentSessionId || dirtyFields.size === 0) return

      // Use latest state at call time
      const opts = latestOptionsRef.current
      const body = buildPayload(dirtyFields, opts)

      if (Object.keys(body).length === 0) return

      setIsSaving(true)

      try {
        const res = await fetch(`/api/brew/session/${currentSessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (res.ok) {
          const data = await res.json()
          setLastSavedAt(
            data.updated_at ? new Date(data.updated_at).getTime() : Date.now()
          )
        } else if (res.status >= 500) {
          // 5xx — schedule single retry if this isn't already a retry
          if (!isRetry) {
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null
              // Retry with latest state and the same dirty fields
              performSaveRef.current(dirtyFields, true)
            }, RETRY_DELAY_MS)
          } else {
            console.warn(
              `[useBrewAutosave] Save failed after retry (${res.status})`
            )
          }
        } else {
          // 4xx — no retry, log and continue
          console.warn(
            `[useBrewAutosave] Save rejected (${res.status}) — skipping`
          )
        }
      } catch {
        // Network failure — schedule single retry if not already a retry
        if (!isRetry) {
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null
            performSaveRef.current(dirtyFields, true)
          }, RETRY_DELAY_MS)
        } else {
          console.warn(
            '[useBrewAutosave] Save failed after retry (network error)'
          )
        }
      } finally {
        setIsSaving(false)
      }
    },
    [buildPayload]
  )

  // Keep the ref updated so retry closures always use the latest performSave
  useEffect(() => {
    performSaveRef.current = performSave
  }, [performSave])

  // ---------------------------------------------------------------------------
  // flushSync — synchronous flush via sendBeacon (for unload)
  // ---------------------------------------------------------------------------

  const flushSync = useCallback(() => {
    const currentSessionId = sessionIdRef.current
    const dirtyFields = dirtyFieldsRef.current

    if (!currentSessionId || dirtyFields.size === 0) return

    // Clear the debounce timer — we're flushing now
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const opts = latestOptionsRef.current
    const body = buildPayload(dirtyFields, opts)

    if (Object.keys(body).length === 0) return

    const url = `/api/brew/session/${currentSessionId}`
    const blob = new Blob([JSON.stringify(body)], {
      type: 'application/json',
    })

    // Try sendBeacon first — survives page unload
    const sent =
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(url, blob)

    if (!sent) {
      // Fallback: fetch with keepalive
      try {
        fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true,
        })
      } catch {
        // Best-effort — nothing more we can do on unload
      }
    }

    // Clear dirty fields since we've flushed
    dirtyFieldsRef.current = new Set()
  }, [buildPayload])

  // ---------------------------------------------------------------------------
  // flush — async flush (for programmatic use, e.g. before navigation)
  // ---------------------------------------------------------------------------

  const flush = useCallback(async (): Promise<void> => {
    const dirtyFields = dirtyFieldsRef.current

    if (dirtyFields.size === 0) return

    // Clear the debounce timer
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    // Capture and clear dirty fields
    const fieldsToSave = new Set(dirtyFields)
    dirtyFieldsRef.current = new Set()

    await performSave(fieldsToSave)
  }, [performSave])

  // ---------------------------------------------------------------------------
  // scheduleSave — reset debounce timer
  // ---------------------------------------------------------------------------

  const scheduleSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null

      // Capture and clear dirty fields
      const fieldsToSave = new Set(dirtyFieldsRef.current)
      dirtyFieldsRef.current = new Set()

      performSave(fieldsToSave)
    }, DEBOUNCE_MS)
  }, [performSave])

  // ---------------------------------------------------------------------------
  // Dirty-field detection — compare by referential inequality
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Skip if no session
    if (!sessionId) return

    let anyDirty = false

    if (messages !== prevMessagesRef.current) {
      dirtyFieldsRef.current.add('conversation_json')
      prevMessagesRef.current = messages
      anyDirty = true
    }

    if (decisionLog !== prevDecisionLogRef.current) {
      dirtyFieldsRef.current.add('decision_log_json')
      prevDecisionLogRef.current = decisionLog
      anyDirty = true
    }

    if (deckState !== prevDeckStateRef.current) {
      dirtyFieldsRef.current.add('skeleton_json')
      prevDeckStateRef.current = deckState
      anyDirty = true
    }

    if (
      phase !== prevPhaseRef.current ||
      commander !== prevCommanderRef.current
    ) {
      dirtyFieldsRef.current.add('phase_commander')
      prevPhaseRef.current = phase
      prevCommanderRef.current = commander
      anyDirty = true
    }

    if (anyDirty) {
      scheduleSave()
    }
  }, [sessionId, messages, decisionLog, deckState, phase, commander, scheduleSave])

  // ---------------------------------------------------------------------------
  // Route change flush (App Router — detect pathname changes)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = pathname
      flushSync()
    }
  }, [pathname, flushSync])

  // ---------------------------------------------------------------------------
  // beforeunload listener
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handleBeforeUnload = () => {
      flushSync()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [flushSync])

  // ---------------------------------------------------------------------------
  // Cleanup timers on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [])

  return { isSaving, lastSavedAt, flush }
}
