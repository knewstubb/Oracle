'use client'
// DV-02: the Strategy window. One dialog: target bracket, one-line summary, Strategy text, playgroup.
// Spec: docs/oracle/specs/deck-rail-strategy-tags.md section 3. Nothing here blocks, filters or refuses a suggestion
// because of bracket; the warning only informs.
import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, Check, WifiOff, X, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { BRACKETS } from '@/lib/deck-bracket'
import { PLAYGROUP_MAX, STRATEGY_MAX, SUMMARY_MAX, bracketWarning, shortDateText, type StrategyWindowData } from '@/lib/deck-strategy-window'
import { FOCUS_RING } from './focus'
export interface WindowValues {
  bracket: number | null
  summary: string
  strategy: string
  playgroup: string
}
export type SaveResult = { ok: true; notSaved?: string[] } | { ok: false; error: string }
export interface StrategyWindowProps {
  open: boolean
  deckName: string
  /** Undefined while loading. */
  data: StrategyWindowData | undefined
  online: boolean
  onClose: () => void
  onSave: (values: WindowValues) => Promise<SaveResult>
  /** Called after the window has closed; opens wherever History opens today. */
  onSeeHistory: () => void
  finalFocusRef?: React.RefObject<HTMLElement | null>
}
const NOT_SAVED_YET = 'Not saved yet. Nothing in History.'
function fromData(d: StrategyWindowData | undefined): WindowValues {
  return { bracket: d?.bracket ?? null, summary: d?.summary ?? '', strategy: d?.strategy ?? '', playgroup: d?.playgroup ?? '' }
}
const same = (a: WindowValues, b: WindowValues) => a.bracket === b.bracket && a.summary === b.summary && a.strategy === b.strategy && a.playgroup === b.playgroup
const BTN = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-4 text-[length:var(--fs-md)] font-medium'
const FIELD = 'w-full rounded-md border border-[#8A8A93] bg-transparent px-3 py-2 text-[length:var(--fs-md)] text-foreground placeholder:text-muted-foreground'
export function StrategyWindow(props: StrategyWindowProps) {
  const { open, deckName, data, online, onClose, onSave, onSeeHistory, finalFocusRef } = props
  const uid = useId()
  const [draft, setDraft] = useState<WindowValues>(() => fromData(data))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState<null | 'close' | 'history'>(null)
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([])
  const keepEditingRef = useRef<HTMLButtonElement | null>(null)
  const loading = data === undefined
  const saved = fromData(data)
  const dirty = !loading && !same(draft, saved)
  // Start from the saved values each time the window opens (adjusting state during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft(fromData(data))
      setSaveError(null)
      setNotice(null)
      setConfirmDiscard(null)
      setSaving(false)
    }
  }
  // The data can arrive after the window opens (it was loading): take it once, as long as nothing was typed.
  const [seeded, setSeeded] = useState(!loading)
  if (!seeded && !loading) {
    setSeeded(true)
    setDraft(fromData(data))
  }
  useEffect(() => {
    if (confirmDiscard) keepEditingRef.current?.focus()
  }, [confirmDiscard])
  const warning = bracketWarning(draft.bracket, data?.implied ?? null)
  const canSave = !loading && online && !saving
  const saveReason = loading ? 'Save is off while the strategy loads.' : !online ? "Save is off because you're offline." : ''
  const requestClose = (after: 'close' | 'history') => {
    if (dirty) {
      setConfirmDiscard(after)
      return
    }
    onClose()
    if (after === 'history') onSeeHistory()
  }
  const doSave = async () => {
    if (!canSave) return
    setSaving(true)
    setSaveError(null)
    setNotice(null)
    let r: SaveResult
    try {
      r = await onSave(draft)
    } catch {
      r = { ok: false, error: "Couldn't save. Your changes are still here and nothing was lost. Check your connection and select Save to try again." }
    }
    setSaving(false)
    if (!r.ok) {
      setSaveError(r.error)
      return
    }
    if (r.notSaved && r.notSaved.length > 0) {
      setNotice("Your bracket, Strategy and playgroup were saved. The one-line summary was not: Oracle can't store it yet. It will save after the stored-data update.")
      return
    }
    onClose()
  }
  const moveBracket = (from: number, delta: number) => {
    const next = (from + delta + BRACKETS.length) % BRACKETS.length
    setDraft((d) => ({ ...d, bracket: BRACKETS[next].number }))
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
  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(next) => {
        if (!next) requestClose('close')
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
        aria-busy={loading || undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle id={titleId} className="text-xl font-semibold leading-tight">Strategy</DialogTitle>
            <DialogDescription id={descId} className="mt-1 text-[length:var(--fs-md)] text-muted-foreground">
              {deckName}. Claude reads this when it advises you.
            </DialogDescription>
          </div>
          <button type="button" aria-label="Close" onClick={() => requestClose('close')} className={cn(BTN, 'shrink-0 border border-[#8A8A93] px-0', FOCUS_RING)}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        {saveError && (
          <div role="alert" className="flex gap-2 rounded-md border border-red-400 p-3 text-[length:var(--fs-md)] text-red-300">
            <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span>{saveError}</span>
          </div>
        )}
        {notice && (
          <div role="status" className="flex gap-2 rounded-md border border-amber-400 p-3 text-[length:var(--fs-md)] text-amber-300">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}
        {!online && (
          <div className="flex gap-2 rounded-md border border-amber-400 p-3 text-[length:var(--fs-md)] text-amber-300">
            <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span>You&apos;re offline. You can keep typing. Save is off until you&apos;re back online. Your text stays in this window.</span>
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
                      onClick={() => setDraft((d) => ({ ...d, bracket: b.number }))}
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
                <button type="button" onClick={() => setDraft((d) => ({ ...d, bracket: null }))} className={cn(BTN, 'px-2 text-[length:var(--fs-sm)] underline', FOCUS_RING)}>
                  Clear target
                </button>
              </div>
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
                onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value.replace(/[\r\n]+/g, ' ') }))}
                aria-describedby={`${uid}-summary-help`}
                className={cn(FIELD, 'min-h-11', FOCUS_RING)}
              />
              <div id={`${uid}-summary-help`} className="flex justify-between gap-2 text-[length:var(--fs-sm)] text-muted-foreground">
                <span>Shown on the deck page.</span>
                <span data-testid="summary-counter">{summaryCount >= SUMMARY_MAX ? `${SUMMARY_MAX} / ${SUMMARY_MAX} · limit reached` : `${summaryCount} / ${SUMMARY_MAX}`}</span>
              </div>
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
                onChange={(e) => setDraft((d) => ({ ...d, strategy: e.target.value }))}
                placeholder="How the deck wins, what your commander does for it, and any cards Claude should never suggest cutting. Plain sentences are fine."
                className={cn(FIELD, 'min-h-32 resize-y', FOCUS_RING)}
              />
              {draft.strategy.length >= STRATEGY_MAX - 500 && (
                <p className="text-right text-[length:var(--fs-sm)] text-muted-foreground">{draft.strategy.length} / {STRATEGY_MAX}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-playgroup`} className="text-[length:var(--fs-md)] font-medium">Playgroup (optional)</label>
              <input
                id={`${uid}-playgroup`}
                type="text"
                value={draft.playgroup}
                maxLength={PLAYGROUP_MAX}
                onChange={(e) => setDraft((d) => ({ ...d, playgroup: e.target.value.replace(/[\r\n]+/g, ' ') }))}
                placeholder="Who you usually play against"
                className={cn(FIELD, 'min-h-11', FOCUS_RING)}
              />
            </div>
          </>
        )}
        {confirmDiscard && (
          <div role="alertdialog" aria-label="Discard your changes?" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400 p-3">
            <p className="mr-auto text-[length:var(--fs-md)]">Discard your changes?</p>
            <button ref={keepEditingRef} type="button" onClick={() => setConfirmDiscard(null)} className={cn(BTN, 'border border-[#8A8A93]', FOCUS_RING)}>
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => {
                const after = confirmDiscard
                setConfirmDiscard(null)
                onClose()
                if (after === 'history') onSeeHistory()
              }}
              className={cn(BTN, 'border border-red-400 text-red-300', FOCUS_RING)}
            >
              Discard
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-[length:var(--fs-sm)] text-muted-foreground" data-testid="strategy-footer">
            {lastChanged ? (
              <>
                {lastChanged} ·{' '}
                <button type="button" onClick={() => requestClose('history')} className={cn('inline-flex min-h-11 items-center underline', FOCUS_RING)}>
                  See in History
                </button>
              </>
            ) : (
              NOT_SAVED_YET
            )}
          </p>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => requestClose('close')} className={cn(BTN, 'border border-[#8A8A93]', FOCUS_RING)}>
              Cancel
            </button>
            <button
              type="button"
              aria-disabled={!canSave}
              aria-describedby={saveReason ? `${uid}-save-reason` : undefined}
              onClick={doSave}
              className={cn(BTN, 'bg-[#1D9E75] font-semibold text-[#0B0B0D]', !canSave && 'opacity-60', FOCUS_RING)}
            >
              {saving ? 'Saving…' : saveError ? 'Try again' : 'Save'}
            </button>
            {saveReason && (
              <span id={`${uid}-save-reason`} className="sr-only">
                {saveReason}
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
