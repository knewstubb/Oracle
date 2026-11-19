'use client'
// Autosave for a window of fields: saves a moment after the owner pauses, on blur and on close, one save at a time,
// and sends only the fields that changed. Nothing the owner typed is ever cleared by a failed save or by a refresh.
import { useCallback, useEffect, useRef, useState } from 'react'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline'
export type SaveResult = { ok: true; notSaved?: string[] } | { ok: false; error: string }

export const AUTOSAVE_PAUSE_MS = 1500
export const AUTOSAVE_RETRY_MS = 5000
const DROPPED = "Couldn't save. Your text is still here."

export interface AutosaveOptions<V extends object> {
  /** The saved values to start from. */
  initial: V
  /** Saves only the fields that changed. */
  save: (changed: Partial<V>) => Promise<SaveResult>
  /** False while the browser has no connection: nothing is sent, and the save goes out when it is back. */
  online: boolean
  /** Whether two values of one field count as the same (for example when the server tidies spaces). */
  same?: (key: keyof V, a: V[keyof V], b: V[keyof V]) => boolean
  pauseMs?: number
  retryMs?: number
}

export interface IncomingResult<V extends object> {
  /** Fields that took the fresh value. */
  replaced: (keyof V)[]
  /** Fields where the fresh value differs but the owner's own version was kept. */
  conflicts: (keyof V)[]
}

interface Snap<V extends object> {
  draft: V
  saved: V
  timer: boolean
  running: boolean
  inflight: string[]
  failed: boolean
  error: string | null
  lastSavedAt: Date | null
  notSaved: string[]
}

export function useAutosave<V extends object>(opts: AutosaveOptions<V>) {
  const { pauseMs = AUTOSAVE_PAUSE_MS, retryMs = AUTOSAVE_RETRY_MS } = opts
  const draftRef = useRef<V>(opts.initial)
  const savedRef = useRef<V>(opts.initial)
  const inflightRef = useRef<Partial<V> | null>(null)
  const failedRef = useRef(false)
  const errorRef = useRef<string | null>(null)
  const unstorableRef = useRef(new Set<keyof V>())
  const heldRef = useRef(new Set<keyof V>())
  const lastSavedAtRef = useRef<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const retryUsedRef = useRef(false)
  const seqRef = useRef(0)
  const chainRef = useRef<Promise<boolean>>(Promise.resolve(true))
  const optsRef = useRef(opts)
  const saveNowRef = useRef<(fields?: (keyof V)[]) => Promise<boolean>>(async () => true)
  const [snap, setSnap] = useState<Snap<V>>(() => ({
    draft: opts.initial,
    saved: opts.initial,
    timer: false,
    running: false,
    inflight: [],
    failed: false,
    error: null,
    lastSavedAt: null,
    notSaved: [],
  }))

  const commit = useCallback(() => {
    setSnap({
      draft: draftRef.current,
      saved: savedRef.current,
      timer: timerRef.current !== undefined,
      running: inflightRef.current !== null,
      inflight: inflightRef.current ? Object.keys(inflightRef.current) : [],
      failed: failedRef.current,
      error: errorRef.current,
      lastSavedAt: lastSavedAtRef.current,
      notSaved: [...unstorableRef.current].map(String),
    })
  }, [])

  const isSame = useCallback((k: keyof V, a: V[keyof V], b: V[keyof V]) => (optsRef.current.same ? optsRef.current.same(k, a, b) : a === b), [])

  /** The fields whose draft differs from what is saved (fields the server said it cannot store are left out). */
  const diff = useCallback((only?: (keyof V)[], withHeld = false): Partial<V> | null => {
    const changed: Partial<V> = {}
    let any = false
    for (const k of Object.keys(draftRef.current) as (keyof V)[]) {
      if (only && !only.includes(k)) continue
      if (unstorableRef.current.has(k)) continue
      if (!withHeld && heldRef.current.has(k)) continue
      if (draftRef.current[k] !== savedRef.current[k]) {
        changed[k] = draftRef.current[k]
        any = true
      }
    }
    return any ? changed : null
  }, [])

  const clearTimer = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = undefined
  }, [])

  const runSave = useCallback(
    async (only?: (keyof V)[]): Promise<boolean> => {
      for (;;) {
        const changed = diff(only)
        if (!changed) return !failedRef.current
        if (!optsRef.current.online) {
          commit()
          return false
        }
        const seq = ++seqRef.current
        inflightRef.current = changed
        commit()
        let r: SaveResult
        try {
          r = await optsRef.current.save(changed)
        } catch {
          r = { ok: false, error: DROPPED }
        }
        // A reset (discard) while this was out: whatever came back is not for the current values.
        if (seq !== seqRef.current) return false
        inflightRef.current = null
        if (!r.ok) {
          failedRef.current = true
          errorRef.current = r.error
          commit()
          if (!retryUsedRef.current) {
            retryUsedRef.current = true
            clearTimeout(retryTimerRef.current)
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = undefined
              void saveNowRef.current()
            }, retryMs)
          }
          return false
        }
        const dropped = new Set((r.notSaved ?? []) as string[])
        const next = { ...savedRef.current }
        for (const k of Object.keys(changed) as (keyof V)[]) {
          if (dropped.has(String(k))) unstorableRef.current.add(k)
          else next[k] = changed[k] as V[keyof V]
        }
        savedRef.current = next
        failedRef.current = false
        errorRef.current = null
        retryUsedRef.current = false
        lastSavedAtRef.current = new Date()
        commit()
      }
    },
    [commit, diff, retryMs],
  )

  const saveNow = useCallback(
    (fields?: (keyof V)[]): Promise<boolean> => {
      if (!fields) clearTimer()
      chainRef.current = chainRef.current.then(() => runSave(fields))
      commit()
      return chainRef.current
    },
    [clearTimer, commit, runSave],
  )
  useEffect(() => {
    optsRef.current = opts
    saveNowRef.current = saveNow
  })

  // Back online: send what was waiting.
  const { online } = opts
  useEffect(() => {
    if (online && diff()) void saveNowRef.current()
  }, [online, diff])

  useEffect(
    () => () => {
      clearTimeout(timerRef.current)
      clearTimeout(retryTimerRef.current)
    },
    [],
  )

  const setField = useCallback(
    <K extends keyof V>(name: K, value: V[K]) => {
      draftRef.current = { ...draftRef.current, [name]: value }
      unstorableRef.current.delete(name)
      retryUsedRef.current = false
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined
        void saveNowRef.current()
      }, pauseMs)
      commit()
    },
    [commit, pauseMs],
  )

  /** Sends everything unsaved now and resolves true when nothing is left unsaved. */
  const flush = useCallback(async () => {
    const ok = await saveNow()
    return ok && diff(undefined, true) === null && !failedRef.current
  }, [diff, saveNow])

  /** Keeps a field from saving until `takeIncoming` or `keepMine` is called for it (the owner is choosing between two versions). */
  const hold = useCallback((name: keyof V) => {
    heldRef.current.add(name)
  }, [])

  /** Throws away what was not saved and goes back to the saved values ("Close anyway"). */
  const discard = useCallback(() => {
    clearTimer()
    clearTimeout(retryTimerRef.current)
    seqRef.current++
    inflightRef.current = null
    failedRef.current = false
    errorRef.current = null
    unstorableRef.current.clear()
    heldRef.current.clear()
    draftRef.current = savedRef.current
    chainRef.current = Promise.resolve(true)
    commit()
  }, [clearTimer, commit])

  const busy = useCallback((k: keyof V) => (inflightRef.current !== null && k in inflightRef.current) || draftRef.current[k] !== savedRef.current[k], [])

  /** Takes fresh values from the server. A field the owner is working on (typed, waiting, being saved, or failed) is never replaced. */
  const applyIncoming = useCallback(
    (fresh: V): IncomingResult<V> => {
      const replaced: (keyof V)[] = []
      const conflicts: (keyof V)[] = []
      const nextDraft = { ...draftRef.current }
      const nextSaved = { ...savedRef.current }
      for (const k of Object.keys(fresh) as (keyof V)[]) {
        const incoming = fresh[k]
        const sent = inflightRef.current && k in inflightRef.current ? inflightRef.current[k] : undefined
        if (isSame(k, incoming, savedRef.current[k])) continue
        if (sent !== undefined && isSame(k, incoming, sent as V[keyof V])) continue
        if (busy(k) || unstorableRef.current.has(k)) {
          if (!isSame(k, incoming, draftRef.current[k])) conflicts.push(k)
          continue
        }
        nextDraft[k] = incoming
        nextSaved[k] = incoming
        replaced.push(k)
      }
      if (replaced.length > 0) {
        draftRef.current = nextDraft
        savedRef.current = nextSaved
        commit()
      }
      return { replaced, conflicts }
    },
    [busy, commit, isSame],
  )

  /** "Use Claude's": the field takes the fresh value and anything typed for it is dropped. */
  const takeIncoming = useCallback(
    <K extends keyof V>(name: K, value: V[K]) => {
      draftRef.current = { ...draftRef.current, [name]: value }
      savedRef.current = { ...savedRef.current, [name]: value }
      unstorableRef.current.delete(name)
      heldRef.current.delete(name)
      if (!diff() && failedRef.current) {
        failedRef.current = false
        errorRef.current = null
      }
      if (!diff()) clearTimer()
      commit()
    },
    [clearTimer, commit, diff],
  )

  /** "Keep mine": the owner's text stays, the server's version becomes the base, and the next save is a normal save of this field. */
  const keepMine = useCallback(
    <K extends keyof V>(name: K, incoming: V[K]) => {
      heldRef.current.delete(name)
      savedRef.current = { ...savedRef.current, [name]: incoming }
      commit()
      if (diff([name])) void saveNowRef.current([name])
    },
    [commit, diff],
  )

  const touched = (name: keyof V) => snap.draft[name] !== snap.saved[name] || snap.inflight.includes(String(name))

  const hasDiff = (() => {
    for (const k of Object.keys(snap.draft) as (keyof V)[]) if (!snap.notSaved.includes(String(k)) && snap.draft[k] !== snap.saved[k]) return true
    return false
  })()
  const hasPending = snap.timer || snap.running || snap.failed || hasDiff
  const status: AutosaveStatus = snap.running
    ? 'saving'
    : snap.failed
      ? 'error'
      : !opts.online && hasDiff
        ? 'offline'
        : snap.lastSavedAt && !hasDiff
          ? 'saved'
          : 'idle'

  return {
    draft: snap.draft,
    setField,
    saveNow,
    flush,
    discard,
    hold,
    status,
    error: snap.error,
    lastSavedAt: snap.lastSavedAt,
    hasPending,
    /** Fields the server said it cannot store yet. */
    notSaved: snap.notSaved,
    touched,
    applyIncoming,
    takeIncoming,
    keepMine,
  }
}
