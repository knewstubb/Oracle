'use client'
// Deck settings > Deck health tab. Choose Default values or Custom categories, and set a target range for each row.
// Everything saves by itself (no Save button): the mode saves at once, numbers save after a pause, on leaving a field and on close.
// Confirm and Decline for a range Claude proposed live only here, never in the rail.
import { useEffect, useId, useMemo, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { SaveStatus } from '@/components/SaveStatus'
import { cn } from '@/lib/utils'
import { useAutosave, type SaveResult } from '@/hooks/useAutosave'
import { useDeckHealth } from '@/hooks/useDeckHealth'
import { useHealthSettings } from '@/hooks/useHealthSettings'
import { DEFAULT_RANGES, KIND_LABELS, RANGED_KINDS, type RangedKind } from '@/lib/deck-health'
import {
  CATEGORY_NAME_MAX,
  categoryKey,
  customRows,
  validateRange,
  type CustomRow,
  type HealthMode,
  type HealthSettings,
} from '@/lib/deck-health-settings'
import { referenceLine } from '@/lib/deck-rail-health-view'
import { FOCUS_RING } from './focus'

export interface HealthCardInput {
  categories?: string | null
  quantity?: number | null
}

export interface DeckHealthTabProps {
  deckId: number
  cards: HealthCardInput[]
  online: boolean
  /** The window calls this when closing, so numbers typed a moment ago are saved first. */
  flushRef: React.MutableRefObject<(() => Promise<boolean>) | null>
}

const BTN = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-4 text-[length:var(--fs-md)] font-medium'
const INPUT = 'min-h-11 w-16 rounded-md border border-[#8A8A93] bg-transparent px-2 text-center text-[length:var(--fs-md)] tabular-nums'
const OUTLINE = 'border border-[#8A8A93]'
const DEFAULT_ORDER: RangedKind[] = ['ramp', 'card_advantage', 'targeted_removal', 'board_wipes', 'lands']

/** Draft values are "min,max" text so one field can hold a half-typed range. */
type Draft = { mode: string; cats: string } & Record<RangedKind, string>
const pair = (min: number | null, max: number | null) => `${min ?? ''},${max ?? ''}`
const parsePair = (v: string): [string, string] => {
  const [a = '', b = ''] = v.split(',')
  return [a, b]
}
const toInt = (v: string) => (/^\d{1,3}$/.test(v.trim()) ? Number(v) : NaN)

function initialDraft(s: HealthSettings): Draft {
  const d = { mode: s.mode, cats: '{}' } as Draft
  for (const k of RANGED_KINDS) {
    const r = s.overrides[k] ?? DEFAULT_RANGES[k]
    d[k] = pair(r.min, r.max)
  }
  return d
}

export function DeckHealthTab({ deckId, cards, online, flushRef }: DeckHealthTabProps) {
  const { settings, isLoading } = useHealthSettings(deckId)
  const health = useDeckHealth(deckId)
  if (isLoading) return <p className="text-[length:var(--fs-md)] text-muted-foreground">Loading targets…</p>
  return <HealthForm deckId={deckId} cards={cards} online={online} flushRef={flushRef} settings={settings} reference={health.data?.reference ? referenceLine(health.data) : null} have={(k) => health.data?.rows?.find((r) => r.kind === k)?.have ?? null} />
}

function HealthForm({
  deckId,
  cards,
  online,
  flushRef,
  settings,
  reference,
  have,
}: DeckHealthTabProps & { settings: HealthSettings; reference: ReturnType<typeof referenceLine> | null; have: (k: string) => number | null }) {
  const uid = useId()
  const { act } = useHealthSettings(deckId)
  const [message, setMessage] = useState<string | null>(null)
  const readOnly = !settings.available
  const auto = useAutosave<Draft>({
    initial: initialDraft(settings),
    online,
    save: async (changed): Promise<SaveResult> => {
      const fail = (error: string): SaveResult => ({ ok: false, error })
      if (changed.mode !== undefined) {
        const r = await act({ action: 'set_mode', mode: changed.mode as HealthMode })
        if (!r.ok) return fail(r.error)
      }
      for (const k of RANGED_KINDS) {
        const v = changed[k]
        if (v === undefined) continue
        const [a, b] = parsePair(v)
        const range = validateRange(toInt(a), toInt(b))
        if (!range.ok) continue // half typed: waits for the rest
        const r = await act({ action: 'set_override', kind: k, ...range.range })
        if (!r.ok) return fail(r.error)
      }
      if (changed.cats !== undefined) {
        const typed = JSON.parse(changed.cats) as Record<string, [string, string]>
        for (const [id, [a, b]] of Object.entries(typed)) {
          const range = validateRange(toInt(a), toInt(b))
          if (!range.ok) continue
          const row = latest.current.find((c) => c.key === id)
          if (!row) continue
          const known = row.stored
          if (known && known.min === range.range.min && known.max === range.range.max) continue
          // A category that only exists on cards gets its stored row the first time it gets a target.
          const r = known ? await act({ action: 'set_range', id: known.id, ...range.range }) : await act({ action: 'add_category', name: row.name, ...range.range })
          if (!r.ok) return fail(r.error)
        }
      }
      return { ok: true }
    },
  })
  // The deck's own categories (from its cards) joined with the stored targets. Recomputed whenever the cards or the targets change.
  const rows = useMemo(() => customRows(cards, settings.categories), [cards, settings.categories])
  const { draft, setField, saveNow, flush, status, lastSavedAt } = auto
  // The newest stored settings, read by the save above (it runs outside render).
  const latest = useMemoRef(rows)
  useEffect(() => {
    flushRef.current = readOnly ? null : flush
    return () => {
      flushRef.current = null
    }
  }, [flush, flushRef, readOnly])

  const cats = useMemo(() => JSON.parse(draft.cats) as Record<string, [string, string]>, [draft.cats])
  const setCat = (key: string, which: 0 | 1, value: string) => {
    const s = rows.find((r) => r.key === key)?.stored
    const base: [string, string] = cats[key] ?? [String(s?.min ?? ''), String(s?.max ?? '')]
    const next: [string, string] = [...base]
    next[which] = value.replace(/\D/g, '').slice(0, 3)
    setField('cats', JSON.stringify({ ...cats, [key]: next }))
  }
  const dropTyped = (key: string) => setField('cats', JSON.stringify(Object.fromEntries(Object.entries(cats).filter(([k]) => k !== key))))
  const setDefault = (k: RangedKind, which: 0 | 1, value: string) => {
    const [a, b] = parsePair(draft[k])
    const v = value.replace(/\D/g, '').slice(0, 3)
    setField(k, which === 0 ? `${v},${b}` : `${a},${v}`)
  }
  const pickMode = (m: HealthMode) => {
    if (readOnly || draft.mode === m) return
    setField('mode', m)
    void saveNow(['mode'])
  }
  const run = async (fn: () => ReturnType<typeof act>) => {
    setMessage(null)
    const r = await fn()
    if (!r.ok) setMessage(r.error)
    return r.ok
  }

  const [newName, setNewName] = useState('')
  const addCategory = async () => {
    if (!newName.trim()) return
    if (rows.some((r) => r.key === categoryKey(newName))) {
      setMessage('This deck already has a category with that name.')
      return
    }
    if (await run(() => act({ action: 'add_category', name: newName }))) setNewName('')
  }

  const mode = draft.mode as HealthMode
  const rangeError = (a: string, b: string) => (a !== '' && b !== '' && !validateRange(toInt(a), toInt(b)).ok ? 'The minimum can’t be more than the maximum.' : null)
  const modeCard = (m: HealthMode, title: string, text: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === m}
      disabled={readOnly}
      onClick={() => pickMode(m)}
      className={cn('flex min-h-11 flex-1 items-start gap-2 rounded-lg border p-3 text-left', mode === m ? 'border-[var(--accent-primary)] bg-white/[0.06]' : 'border-[#8A8A93]', FOCUS_RING)}
    >
      <span aria-hidden="true" className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border', mode === m ? 'border-[var(--accent-primary)]' : 'border-[#8A8A93]')}>
        {mode === m && <span className="size-2 rounded-full bg-[var(--accent-primary)]" />}
      </span>
      <span>
        <span className="block text-[length:var(--fs-md)] font-medium">{title}</span>
        <span className="block text-[length:var(--fs-sm)] text-muted-foreground">{text}</span>
      </span>
    </button>
  )
  const rangeInputs = (label: string, a: string, b: string, onA: (v: string) => void, onB: (v: string) => void, id: string) => (
    <div className="flex items-center gap-2">
      <input id={`${id}-min`} inputMode="numeric" aria-label={`${label} minimum`} value={a} onChange={(e) => onA(e.target.value)} onBlur={() => void saveNow()} disabled={readOnly} className={cn(INPUT, FOCUS_RING)} />
      <span aria-hidden="true" className="text-muted-foreground">to</span>
      <input id={`${id}-max`} inputMode="numeric" aria-label={`${label} maximum`} value={b} onChange={(e) => onB(e.target.value)} onBlur={() => void saveNow()} disabled={readOnly} className={cn(INPUT, FOCUS_RING)} />
    </div>
  )
  const SECTION = 'text-[10px] font-medium uppercase tracking-[0.8px] text-[var(--text-secondary)]'

  return (
    <div className="space-y-4" data-testid="deck-health-tab">
      <section className="space-y-2">
        <h3 className={SECTION}>Health targets</h3>
        <div role="radiogroup" aria-label="Health targets" className="flex flex-col gap-2 sm:flex-row">
          {modeCard('default', 'Default values', 'The standard targets for a 100-card Commander deck.')}
          {modeCard('custom', 'Custom categories', 'Use your own categories and set a target for each.')}
        </div>
        {readOnly && (
          <p className="text-[length:var(--fs-sm)] text-muted-foreground" data-testid="health-unavailable">
            Saving targets isn&apos;t available yet.
          </p>
        )}
      </section>

      {mode === 'default' || readOnly ? (
        <section className="space-y-2" data-testid="health-default-pane">
          <h3 className={SECTION}>Targets for this deck</h3>
          <ul className="divide-y divide-[var(--border-default)]">
            {DEFAULT_ORDER.map((k) => {
              const label = KIND_LABELS[k].replace(' / Mass Disruption', '')
              const [a, b] = parsePair(draft[k])
              const err = rangeError(a, b)
              return (
                <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="min-w-0 flex-1 text-[length:var(--fs-md)]">{label}</span>
                  <span className="text-[length:var(--fs-sm)] text-muted-foreground tabular-nums">{have(k) ?? '–'} now</span>
                  {rangeInputs(label, a, b, (v) => setDefault(k, 0, v), (v) => setDefault(k, 1, v), `${uid}-${k}`)}
                  {err && <p role="alert" className="basis-full text-[length:var(--fs-sm)] text-amber-300">{err}</p>}
                </li>
              )
            })}
            <li className="flex flex-wrap items-center gap-x-3 py-2">
              <span className="min-w-0 flex-1 text-[length:var(--fs-md)]">Game Plan &amp; Win Conditions</span>
              <span className="text-[length:var(--fs-sm)] text-muted-foreground tabular-nums">{have('game_plan') ?? '–'} now</span>
              <span className="text-[length:var(--fs-sm)] text-muted-foreground">Total only, no target</span>
            </li>
          </ul>
          <p className="text-[length:var(--fs-sm)] text-muted-foreground">You can change a range for this deck. The other decks keep the defaults.</p>
        </section>
      ) : (
        <section className="space-y-2" data-testid="health-custom-pane">
          <h3 className={SECTION}>Categories</h3>
          {rows.length === 0 && <p className="text-[length:var(--fs-sm)] text-muted-foreground">No categories yet. Add one below.</p>}
          <ul className="divide-y divide-[var(--border-default)]">
            {rows.map((r) => (
              <CategoryRow
                key={r.key}
                r={r}
                typed={cats[r.key]}
                setCat={setCat}
                rangeInputs={rangeInputs}
                rangeError={rangeError}
                idPrefix={`${uid}-c-${r.key.replace(/\W+/g, '-')}`}
                onSetTarget={() => setField('cats', JSON.stringify({ ...cats, [r.key]: ['', ''] }))}
                onConfirm={async () => {
                  if (r.stored && (await run(() => act({ action: 'confirm_proposal', id: r.stored!.id })))) dropTyped(r.key)
                }}
                onDecline={() => r.stored && void run(() => act({ action: 'decline_proposal', id: r.stored!.id }))}
                onRemove={async () => {
                  if (r.stored && (await run(() => act({ action: 'remove_category', id: r.stored!.id })))) dropTyped(r.key)
                }}
              />
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              aria-label="New category name"
              value={newName}
              maxLength={CATEGORY_NAME_MAX}
              placeholder="Category name"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void addCategory()
                }
              }}
              className={cn('min-h-11 min-w-0 flex-1 rounded-md border border-[#8A8A93] bg-transparent px-3 text-[length:var(--fs-md)]', FOCUS_RING)}
            />
            <button type="button" onClick={() => void addCategory()} className={cn(BTN, OUTLINE, 'gap-1', FOCUS_RING)}>
              <Plus className="size-4" aria-hidden="true" />
              Add category
            </button>
          </div>
        </section>
      )}

      {message && (
        <p role="alert" className="text-[length:var(--fs-sm)] text-amber-300" data-testid="health-message">
          {message}
        </p>
      )}
      {!readOnly && <SaveStatus status={status} lastSavedAt={lastSavedAt} onRetry={() => void saveNow()} errorText="Couldn't save. Your numbers are still here. It will try again by itself." />}
      {reference && (
        <p className="text-[length:var(--fs-xs)] text-[var(--text-muted)]" data-testid="health-reference">
          {reference.text}
          {reference.smallSample && (
            <span className="ml-1" style={{ color: 'var(--warn-amber)' }} data-testid="health-small-sample">
              small sample, treat as rough
            </span>
          )}
        </p>
      )}
    </div>
  )
}

/** A ref that always holds the newest value, for code that runs outside render. */
function useMemoRef<T>(value: T) {
  const [ref] = useState<{ current: T }>(() => ({ current: value }))
  useEffect(() => {
    ref.current = value
  })
  return ref
}

function CategoryRow(props: {
  r: CustomRow
  typed: [string, string] | undefined
  setCat: (key: string, which: 0 | 1, value: string) => void
  rangeInputs: (label: string, a: string, b: string, onA: (v: string) => void, onB: (v: string) => void, id: string) => React.ReactNode
  rangeError: (a: string, b: string) => string | null
  idPrefix: string
  onSetTarget: () => void
  onConfirm: () => void
  onDecline: () => void
  onRemove: () => void
}) {
  const { r, typed, setCat, rangeInputs, rangeError, idPrefix } = props
  const c = r.stored
  const hasRange = !!c && c.min !== null && c.max !== null
  const [a, b] = typed ?? [String(c?.min ?? ''), String(c?.max ?? '')]
  const err = rangeError(a, b)
  // A category with cards can only lose its target (the cards keep it). One with no cards can be removed.
  const removeLabel = r.onCards ? `Clear target for ${r.name}` : `Remove ${r.name}`
  const canRemove = !!c && (!r.onCards || hasRange)
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-testid={`health-cat-${r.key}`}>
      <span className="min-w-0 flex-1 break-words text-[length:var(--fs-md)]">{r.name}</span>
      <span className="text-[length:var(--fs-sm)] text-muted-foreground tabular-nums">{r.count} now</span>
      {hasRange || typed ? (
        rangeInputs(r.name, a, b, (v) => setCat(r.key, 0, v), (v) => setCat(r.key, 1, v), idPrefix)
      ) : c?.proposed ? (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[length:var(--fs-sm)]">Claude proposes {c.proposed.min} to {c.proposed.max}</span>
          <button type="button" aria-label={`Confirm ${r.name} proposal`} onClick={props.onConfirm} className={cn(BTN, 'gap-1 bg-[var(--accent-primary)] text-white', FOCUS_RING)}>
            <Check className="size-4" aria-hidden="true" />
            Confirm
          </button>
          <button type="button" aria-label={`Decline ${r.name} proposal`} onClick={props.onDecline} className={cn(BTN, OUTLINE, FOCUS_RING)}>
            Decline
          </button>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="text-[length:var(--fs-sm)] text-muted-foreground">No target</span>
          <button type="button" aria-label={`Set target for ${r.name}`} onClick={props.onSetTarget} className={cn(BTN, 'px-2 text-[length:var(--fs-sm)]', FOCUS_RING)} style={{ color: 'var(--accent-primary-text)' }}>
            Set target
          </button>
        </span>
      )}
      {canRemove && (
        <button type="button" aria-label={removeLabel} onClick={props.onRemove} className={cn(BTN, 'px-0 text-muted-foreground', FOCUS_RING)}>
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
      {!r.onCards && <p className="basis-full text-[length:var(--fs-xs)] text-muted-foreground">No cards in this category right now.</p>}
      {err && <p role="alert" className="basis-full text-[length:var(--fs-sm)] text-amber-300">{err}</p>}
    </li>
  )
}
