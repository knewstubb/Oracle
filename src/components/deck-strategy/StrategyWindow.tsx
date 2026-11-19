'use client'
// DV-02: the Strategy window. One dialog: target bracket, one-line summary, Strategy text, playgroup.
// Spec: docs/oracle/specs/deck-rail-strategy-tags.md section 3. Nothing here blocks, filters or refuses a suggestion
// because of bracket; the warning only informs.
// There is no Save button: changes save by themselves (a pause after typing, leaving a field, picking a bracket, closing).
import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, Check, Sparkles, WifiOff, X, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { SaveStatus } from '@/components/SaveStatus'
import { cn } from '@/lib/utils'
import { BRACKETS } from '@/lib/deck-bracket'
import { STRATEGY_BUSY, useLiveRefreshBusy } from '@/lib/live-refresh-holds'
import { useAutosave, type SaveResult } from '@/hooks/useAutosave'
import { PLAYGROUP_MAX, STRATEGY_MAX, SUMMARY_MAX, bracketWarning, shortDateText, type StrategyWindowData } from '@/lib/deck-strategy-window'
import { FOCUS_RING } from './focus'
export type { SaveResult }
export interface WindowValues {
  bracket: number | null
  summary: string
  strategy: string
  playgroup: string
}
export interface StrategyWindowProps {
  open: boolean
  deckName: string
  /** Undefined while loading. Fresh data arriving while the window is open is merged in; typed text is never replaced. */
  data: StrategyWindowData | undefined
  online: boolean
  onClose: () => void
  /** Saves only the fields that changed. */
  onSave: (changed: Partial<WindowValues>) => Promise<SaveResult>
  /** Called after the window has closed; opens wherever History opens today. */
  onSeeHistory: () => void
  finalFocusRef?: React.RefObject<HTMLElement | null>
}
const NOT_SAVED_YET = 'Not saved yet. Nothing in History.'
function fromData(d: StrategyWindowData | undefined): WindowValues {
  return { bracket: d?.bracket ?? null, summary: d?.summary ?? '', strategy: d?.strategy ?? '', playgroup: d?.playgroup ?? '' }
}
/** The server tidies the one-line fields (spaces, line breaks), so those compare after the same tidying. */
const tidy = (v: unknown) => (typeof v === 'string' ? v.replace(/\s*[\r\n]+\s*/g, ' ').trim() : v)
const sameValue = (key: keyof WindowValues, a: unknown, b: unknown) => (key === 'summary' || key === 'playgroup' ? tidy(a) === tidy(b) : a === b)
const BTN = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-4 text-[length:var(--fs-md)] font-medium'
const FIELD = 'w-full rounded-md border border-[#8A8A93] bg-transparent px-3 py-2 text-[length:var(--fs-md)] text-foreground placeholder:text-muted-foreground'
const UPDATED_BY_CLAUDE = (
  <span className="flex items-center gap-1.5 text-[length:var(--fs-sm)] text-muted-foreground" data-testid="updated-by-claude">
    <Sparkles className="size-4 shrink-0" aria-hidden="true" />
    Updated by Claude
  </span>
)

export function StrategyWindow(props: StrategyWindowProps) {
  const { open, deckName, data, online, onClose, onSave, onSeeHistory, finalFocusRef } = props
  const uid = useId()
  const auto = useAutosave<WindowValues>({
    initial: fromData(data),
    save: onSave,
    online,
    same: (k, a, b) => sameValue(k, a, b),
  })
  const { draft, status, lastSavedAt, error, notSaved, setField, saveNow, flush, discard, hold, applyIncoming, takeIncoming, keepMine } = auto
  // Fields Claude changed while the window was open (a small note shows until the next edit), and Claude's Strategy when it rewrote text being typed.
  const [claudeFields, setClaudeFields] = useState<(keyof WindowValues)[]>([])
  const [rewrite, setRewrite] = useState<string | null>(null)
  const [unsaved, setUnsaved] = useState<null | 'close' | 'history'>(null)
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([])
  const keepEditingRef = useRef<HTMLButtonElement | null>(null)
  const closingRef = useRef(false)
  const hadData = useRef(data !== undefined)
  const loading = data === undefined
  useLiveRefreshBusy(STRATEGY_BUSY, status === 'saving')
  // Each time the window opens, old notes go away (adjusting state during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setClaudeFields([])
      setRewrite(null)
      setUnsaved(null)
    }
  }
  // Fresh data from the server (Claude changed the deck, or this window's own save came back): untouched fields take it,
  // anything being typed, waiting to save or failing to save is kept.
  useEffect(() => {
    if (!data) return
    const first = !hadData.current
    hadData.current = true
    const r = applyIncoming(fromData(data))
    // Merging what the server sent into the window's notes is syncing with outside data, which is what an effect is for.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!first && r.replaced.length > 0 && data.updatedBy === 'claude') setClaudeFields((f) => [...new Set([...f, ...r.replaced])])
    if (r.conflicts.includes('strategy')) {
      hold('strategy') // nothing the owner typed is saved over Claude's version until they choose
      setRewrite(data.strategy)
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [data, applyIncoming, hold])
  useEffect(() => {
    if (unsaved) keepEditingRef.current?.focus()
  }, [unsaved])
  const edit = <K extends keyof WindowValues>(name: K, value: WindowValues[K]) => {
    setClaudeFields((f) => f.filter((x) => x !== name))
    setField(name, value)
  }
  const pickBracket = (value: number | null) => {
    edit('bracket', value)
    void saveNow(['bracket'])
  }

  const warning = bracketWarning(draft.bracket, data?.implied ?? null)
  const requestClose = async (after: 'close' | 'history') => {
    if (closingRef.current) return
    closingRef.current = true
    try {
      // Everything typed is sent first. If it cannot be saved, the owner decides.
      const ok = loading ? true : await flush()
      if (!ok) {
        setUnsaved(after)
        return
      }
      onClose()
      if (after === 'history') onSeeHistory()
    } finally {
      closingRef.current = false
    }
  }
  const moveBracket = (from: number, delta: number) => {
    const next = (from + delta + BRACKETS.length) % BRACKETS.length
    edit('bracket', BRACKETS[next].number)
    radioRefs.current[next]?.focus()
  }
  const tabbable = draft.bracket === null ? 0 : BRACKETS.findIndex((b) => b.number === draft.bracket)
  const lastChanged = (() => {
    if (!data?.updatedAt) return null
    const d = shortDateText(data.updatedAt)
    if (!d) return null
    const by = data.updatedBy === 'claude' ? ' by Claude' : data.updatedBy === 'owner' ? ' by you' : ''
    return `Last changed${by} · ${d}`
  })()
  const summaryCount = draft.summary.length
  const titleId = `${uid}-title`
  const descId = `${uid}-desc`
  const updated = (name: keyof WindowValues) => claudeFields.includes(name) && UPDATED_BY_CLAUDE
  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(next) => {
        if (!next) void requestClose('close')
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        initialFocus={() => radioRefs.current[tabbable] ?? true}
        finalFocus={finalFocusRef ?? true}
        className="max-h-[92vh] gap-4 overflow-y-auto p-5 sm:max-w-[560px] max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none"
        data-testid="strategy-window"
        data-live-refresh="allow"
        aria-busy={loading || undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle id={titleId} className="text-xl font-semibold leading-tight">Strategy</DialogTitle>
            <DialogDescription id={descId} className="mt-1 text-[length:var(--fs-md)] text-muted-foreground">
              {deckName}. Claude reads this when it advises you.
            </DialogDescription>
          </div>
          <button type="button" aria-label="Close" onClick={() => void requestClose('close')} className={cn(BTN, 'shrink-0 border border-[#8A8A93] px-0', FOCUS_RING)}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        {status === 'error' && error && (
          <div role="alert" className="flex gap-2 rounded-md border border-red-400 p-3 text-[length:var(--fs-md)] text-red-300">
            <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {notSaved.includes('summary') && (
          <div role="status" className="flex gap-2 rounded-md border border-amber-400 p-3 text-[length:var(--fs-md)] text-amber-300">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span>Your other changes were saved. The one-line summary was not: Oracle can&apos;t store it yet. It stays in this window until the stored-data update.</span>
          </div>
        )}
        {!online && (
          <div className="flex gap-2 rounded-md border border-amber-400 p-3 text-[length:var(--fs-md)] text-amber-300">
            <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span>You&apos;re offline. You can keep typing. Your changes will save when you&apos;re back online. Your text stays in this window.</span>
          </div>
        )}
        {loading ? (
          <div className="space-y-3" data-testid="strategy-window-loading">
            <p className="text-[length:var(--fs-md)] text-muted-foreground">Loading strategy…</p>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="text-[length:var(--fs-md)] font-medium">Target bracket</legend>
              <div role="radiogroup" aria-label="Target bracket" className="grid grid-cols-5 gap-2">
                {BRACKETS.map((b, i) => {
                  const selected = draft.bracket === b.number
                  return (
                    <button
                      key={b.number}
                      ref={(el) => {
                        radioRefs.current[i] = el
                      }}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      tabIndex={i === tabbable ? 0 : -1}
                      onClick={() => pickBracket(b.number)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                          e.preventDefault()
                          moveBracket(i, 1)
                        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                          e.preventDefault()
                          moveBracket(i, -1)
                        }
                      }}
                      className={cn(
                        'relative flex min-h-14 flex-col items-center justify-center rounded-md border px-1 py-1.5',
                        selected ? 'border-[3px] border-white bg-white/10' : 'border-[#8A8A93]',
                        FOCUS_RING,
                      )}
                    >
                      {selected && <Check className="absolute top-0.5 right-0.5 size-3.5" aria-hidden="true" />}
                      <span className="text-xl leading-none font-semibold">{b.number}</span>
                      <span className="mt-1 text-[11px] leading-tight">{b.name}</span>
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[length:var(--fs-sm)] text-muted-foreground">The bracket you are aiming for.</p>
                <button type="button" onClick={() => pickBracket(null)} className={cn(BTN, 'px-2 text-[length:var(--fs-sm)] underline', FOCUS_RING)}>
                  Clear target
                </button>
              </div>
              {updated('bracket')}
              {!online && <p className="text-[length:var(--fs-sm)] text-muted-foreground">The card check can&apos;t update while you&apos;re offline.</p>}
            </fieldset>
            <div role="status" aria-live="polite" data-testid="bracket-warning-region">
              {warning && (
                <div className="flex gap-2 rounded-md border border-amber-400 p-3 text-[length:var(--fs-md)] text-amber-300">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <div>
                    <p>{warning.text}</p>
                    <p className="mt-1 text-[length:var(--fs-sm)] text-muted-foreground">Based on: {warning.basedOn}.</p>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-summary`} className="text-[length:var(--fs-md)] font-medium">One-line summary</label>
              <input
                id={`${uid}-summary`}
                type="text"
                value={draft.summary}
                maxLength={SUMMARY_MAX}
                onChange={(e) => edit('summary', e.target.value.replace(/[\r\n]+/g, ' '))}
                onBlur={() => void saveNow()}
                aria-describedby={`${uid}-summary-help`}
                className={cn(FIELD, 'min-h-11', FOCUS_RING)}
              />
              <div id={`${uid}-summary-help`} className="flex justify-between gap-2 text-[length:var(--fs-sm)] text-muted-foreground">
                <span>Shown on the deck page.</span>
                <span data-testid="summary-counter">{summaryCount >= SUMMARY_MAX ? `${SUMMARY_MAX} / ${SUMMARY_MAX} · limit reached` : `${summaryCount} / ${SUMMARY_MAX}`}</span>
              </div>
              {updated('summary')}
              {data && !data.canStoreNewFields && (
                <p className="text-[length:var(--fs-sm)] text-amber-300" data-testid="summary-not-yet">
                  The summary can&apos;t be saved yet. Oracle&apos;s stored data needs an update first. Everything else in this window saves normally.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-strategy`} className="text-[length:var(--fs-md)] font-medium">Strategy</label>
              <textarea
                id={`${uid}-strategy`}
                value={draft.strategy}
                maxLength={STRATEGY_MAX}
                rows={7}
                onChange={(e) => edit('strategy', e.target.value)}
                onBlur={() => void saveNow()}
                placeholder="How the deck wins, what your commander does for it, and any cards Claude should never suggest cutting. Plain sentences are fine."
                className={cn(FIELD, 'min-h-32 resize-y', FOCUS_RING)}
              />
              {draft.strategy.length >= STRATEGY_MAX - 500 && (
                <p className="text-right text-[length:var(--fs-sm)] text-muted-foreground">{draft.strategy.length} / {STRATEGY_MAX}</p>
              )}
              {updated('strategy')}
              {rewrite !== null && (
                <div role="status" data-testid="strategy-claude-rewrote" className="space-y-2 rounded-md border border-amber-400 p-3 text-[length:var(--fs-md)]">
                  <p className="flex items-center gap-2 font-medium text-amber-300">
                    <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
                    Claude rewrote this
                  </p>
                  <p className="text-muted-foreground">Claude replaced the Strategy while you were typing. Your typing is still above. Neither version is lost until you choose.</p>
                  <p className="max-h-32 overflow-y-auto rounded-md border border-[#8A8A93] p-2 whitespace-pre-wrap" data-testid="claude-version" tabIndex={0}>
                    {rewrite || 'Claude cleared the Strategy.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        takeIncoming('strategy', rewrite)
                        setRewrite(null)
                        setClaudeFields((f) => [...new Set([...f, 'strategy' as const])])
                      }}
                      className={cn(BTN, 'border border-[#8A8A93]', FOCUS_RING)}
                    >
                      Use Claude&apos;s
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        keepMine('strategy', rewrite)
                        setRewrite(null)
                      }}
                      className={cn(BTN, 'border border-[#8A8A93]', FOCUS_RING)}
                    >
                      Keep mine
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-playgroup`} className="text-[length:var(--fs-md)] font-medium">Playgroup (optional)</label>
              <input
                id={`${uid}-playgroup`}
                type="text"
                value={draft.playgroup}
                maxLength={PLAYGROUP_MAX}
                onChange={(e) => edit('playgroup', e.target.value.replace(/[\r\n]+/g, ' '))}
                onBlur={() => void saveNow()}
                placeholder="Who you usually play against"
                className={cn(FIELD, 'min-h-11', FOCUS_RING)}
              />
              {updated('playgroup')}
            </div>
          </>
        )}
        {unsaved && (
          <div role="alertdialog" aria-label="This didn't save." data-live-refresh="allow" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400 p-3">
            <p className="mr-auto text-[length:var(--fs-md)]">This didn&apos;t save. Closing now loses what you typed since the last save.</p>
            <button ref={keepEditingRef} type="button" onClick={() => setUnsaved(null)} className={cn(BTN, 'border border-[#8A8A93]', FOCUS_RING)}>
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => {
                const after = unsaved
                setUnsaved(null)
                discard()
                onClose()
                if (after === 'history') onSeeHistory()
              }}
              className={cn(BTN, 'border border-red-400 text-red-300', FOCUS_RING)}
            >
              Close anyway
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-[length:var(--fs-sm)] text-muted-foreground" data-testid="strategy-footer">
            {lastChanged ? (
              <>
                {lastChanged} ·{' '}
                <button type="button" onClick={() => void requestClose('history')} className={cn('inline-flex min-h-11 items-center underline', FOCUS_RING)}>
                  See in History
                </button>
              </>
            ) : (
              NOT_SAVED_YET
            )}
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {!loading && <SaveStatus status={status} lastSavedAt={lastSavedAt} onRetry={() => void saveNow()} />}
            <button type="button" onClick={() => void requestClose('close')} className={cn(BTN, 'border border-[#8A8A93]', FOCUS_RING)}>
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
