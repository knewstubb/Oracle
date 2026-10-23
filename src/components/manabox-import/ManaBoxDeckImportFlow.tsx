'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Info } from 'lucide-react'
import { ManaBoxFilePicker } from './ManaBoxFilePicker'
import { estimateFileCards } from './import-stream'
import { ImportFileChip } from './ImportFileChip'
import { DeckImportOptions } from './DeckImportOptions'
import { ImportNotices, ImportValueNoticeLines, useHiddenNotes, countHiddenNotes } from './ImportNoticeLine'
import { ImportDefaultsBar } from './ImportDefaultsBar'
import { ReviewCommanderSelect } from './ReviewCommanderSelect'
import { getFormatConfig } from '@/lib/format-config'
import { countFinishNotices } from '@/lib/import-copies'
import type { ImportCopyEdits, ImportDefaults } from '../../../docs/oracle/contracts/import-row-editing.types'
import { ImportCardList } from './ImportCardList'
import { ImportSummary } from './ImportSummary'
import { ImportWorking } from './ImportWorking'
import {
  EMPTY_FILE_MESSAGE,
  UNREADABLE_FILE_MESSAGE,
  processingDetail,
  INTENT_FILE_HELD,
  INTENT_SAVE_PENDING,
  INTENT_SAVE_PENDING_UNTICKED,
  OWNERSHIP_FAILED,
  OWNERSHIP_LOADING,
} from './import-copy'
import type { ImportIntent, IntentCopyEdits, OwnershipResponse, OwnershipRowFacts } from '../../../docs/oracle/contracts/import-intent.types'
import {
  applyIntentChange,
  hasUntickedAdd,
  intentCopyViews,
  isGenericImportRow,
  needsChoice,
  planImportDetailed,
  rowIntentTags,
  setIntentEdit,
  stripIntentFields,
  summariseImportPlan,
  summaryText,
  type IntentChange,
  type IntentTag,
} from '@/lib/import-intent'
import { ImportResult } from './ImportResult'
import { IMPORT_STAGE_CLASS } from './import-labels'
import type { ImportStep, RowFilter, ImportSource } from './types'
import { INITIAL_DEFAULTS, computeTotals, buildCommitDeck, isGenericRow } from './types'
import type { ManaBoxPreviewResponse } from '../../../docs/oracle/contracts/manabox-import.types'

export interface ManaBoxDeckImportFlowProps {
  onComplete?: (deckId: number, format: string, deckName: string, summary: {
    inserted: number
    skipped: number
    basics: number
    proxies: number
    unsleeved: number
    unmatched: ManaBoxPreviewResponse['unmatched']
    deckId: number
  }) => void
  onCancel?: () => void
  /** The owner pressed Close or Open deck on the result screen . */
  onFinish?: (deckId: number) => void
  /** Close on the result screen. Must not open the deck. */
  onClose?: () => void
  titleSlot?: React.ReactNode
  /** Fill a fixed-size modal: every stage uses the same space (used by the import dialog). */
  fill?: boolean
  /** Tells the window around the flow what it is doing, so it can guard closing. */
  onStateChange?: (state: DeckFlowState) => void
  /** A file to check straight away (used for pasted decklists), as if the owner had chosen it. */
  initialFile?: File | null
  /**
   * What the deck is (I bought it / I built it / I'm planning it), chosen on the first screen.
   * `null` = not chosen yet: a file is held until it is. `undefined` = no intent screen (plain purchase).
   */
  intent?: ImportIntent | null
  /** Commander to preselect on the review screen (a precon knows its commander). */
  initialCommanderName?: string | null
}

export interface DeckFlowState {
  /** Reading the file (nothing is written yet). */
  checking: boolean
  /** Creating the deck. Cannot be stopped. */
  saving: boolean
  /** The owner has changed something on the review list. */
  hasEdits: boolean
  /** The card review list is showing. */
  reviewing: boolean
  /** The result screen is showing. */
  done: boolean
}

export function ManaBoxDeckImportFlow({ onComplete, onCancel, onFinish, onClose, titleSlot, fill, onStateChange, initialFile, intent, initialCommanderName }: ManaBoxDeckImportFlowProps) {
  const [step, setStep] = useState<ImportStep>({ status: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const notes = useHiddenNotes()
  const { restoreAll: restoreNotes } = notes
  const inReview = step.status === 'review'
  useEffect(() => {
    // Hidden notes are for one review only.
    if (!inReview) restoreNotes()
  }, [inReview, restoreNotes])
  const queryClient = useQueryClient()
  const router = useRouter()
  const abortRef = useRef<AbortController | null>(null)
  const savingRef = useRef(false)
  // A file chosen before an intent: held, then read once the owner chooses.
  const [heldFile, setHeldFile] = useState<File | null>(null)
  const effectiveIntent: ImportIntent = intent ?? 'purchased'
  type OwnershipResult = { token: string; facts: OwnershipRowFacts[] | null }
  const [ownershipResult, setOwnershipResult] = useState<OwnershipResult | null>(null)
  const [ownershipTry, setOwnershipTry] = useState(0)

  const checking = step.status === 'checking'
  const saving = step.status === 'importing'
  const reviewing = step.status === 'review'
  const done = step.status === 'done'
  const hasEdits =
    step.status === 'review' &&
    (Object.keys(step.copyEdits).length > 0 ||
      JSON.stringify(step.defaults) !== JSON.stringify(INITIAL_DEFAULTS))
  useEffect(() => {
    onStateChange?.({ checking, saving, hasEdits, reviewing, done })
  }, [checking, saving, hasEdits, reviewing, done, onStateChange])

  const reset = useCallback(() => {
    setStep({ status: 'idle' })
    setError(null)
    setHeldFile(null)
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const detectSource = (file: File): ImportSource => {
    return file.name.toLowerCase().endsWith('.txt') ? 'text' : 'csv'
  }

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    if (intent === null) {
      setHeldFile(file)
      return
    }
    setHeldFile(null)
    setStep({ status: 'checking', file })
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const text = await file.text()
      const source = detectSource(file)
      setStep({ status: 'checking', file, cards: estimateFileCards(text) })
      const body =
        source === 'csv'
          ? { csvContent: text, fileName: file.name }
          : { textContent: text, fileName: file.name }

      const res = await fetch('/api/decks/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Preview failed')

      const preview: ManaBoxPreviewResponse = await res.json()
      if (controller.signal.aborted) return
      if (preview.totalLines === 0) {
        setError(EMPTY_FILE_MESSAGE)
        setStep({ status: 'idle' })
        return
      }
      setStep({
        status: 'review',
        file,
        source,
        preview: {
          ...preview,
          rows: preview.rows,
        },
        deckName: file.name.replace(/\.(csv|txt)$/i, ''),
        format: 'commander',
        commander: (() => {
          if (!initialCommanderName) return null
          const hit = preview.rows.find((r) => !r.isBasicLand && r.cardName === initialCommanderName)
          return hit ? { name: hit.cardName, scryfallId: hit.scryfallId } : null
        })(),
        defaults: INITIAL_DEFAULTS,
        copyEdits: {},
        openRowKeys: new Set(),
        filter: 'all',
        query: '',
        selectedIds: new Set(),
      })
    } catch {
      if (controller.signal.aborted) return
      setError(UNREADABLE_FILE_MESSAGE)
      setStep({ status: 'idle' })
    }
  }, [intent, initialCommanderName])

  // A file held for an intent is read as soon as one is chosen.
  useEffect(() => {
    if (intent == null || !heldFile) return
    // handleFile clears heldFile and starts the read; this is the one-shot release of a held file.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void handleFile(heldFile)
  }, [intent, heldFile, handleFile])

  // A pasted decklist arrives as a small text file and goes through the same check and review.
  const handledInitialFile = useRef<File | null>(null)
  useEffect(() => {
    if (!initialFile || handledInitialFile.current === initialFile) return
    handledInitialFile.current = initialFile
    void handleFile(initialFile)
  }, [initialFile, handleFile])

  const basicsQty =
    step.status === 'review'
      ? step.preview.rows
          .filter((r) => isGenericRow(r, 'deck'))
          .reduce((sum, r) => sum + r.qty, 0)
      : 0
  const specificBasicsQty =
    step.status === 'review'
      ? step.preview.rows
          .filter((r) => r.isBasicLand && !isGenericRow(r, 'deck'))
          .reduce((sum, r) => sum + r.qty, 0)
      : 0

  // Built and planned decks can't be saved yet (S4). Every deck with an intent checks ownership
  // (read-only) so the Add tick and the choices know what the owner has.
  const saveBlockedByIntent = intent === 'built' || intent === 'planned'
  const needsOwnership = !!intent
  const reviewRows = step.status === 'review' ? step.preview.rows : null
  const ownershipCards = useMemo(
    () =>
      reviewRows
        ? reviewRows
            .filter((r) => !isGenericImportRow(r) && r.oracleId)
            .map((r) => ({ rowKey: r.rowKey, oracleId: r.oracleId as string, printingId: r.scryfallId, qty: r.qty }))
        : [],
    [reviewRows]
  )
  const ownershipKey = needsOwnership && reviewRows ? ownershipCards.map((c) => c.rowKey).join('|') : ''

  const ownershipToken = ownershipKey ? `${ownershipKey}#${ownershipTry}` : ''

  // Read-only: asks which of these cards the owner already has. Never writes.
  useEffect(() => {
    if (!ownershipToken) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/decks/import/ownership', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cards: ownershipCards }),
        })
        if (!res.ok) throw new Error(String(res.status))
        const data: OwnershipResponse = await res.json()
        if (!Array.isArray(data.rows)) throw new Error('bad_response')
        if (!cancelled) setOwnershipResult({ token: ownershipToken, facts: data.rows })
      } catch {
        if (!cancelled) setOwnershipResult({ token: ownershipToken, facts: null })
      }
    })()
    return () => {
      cancelled = true
    }
    // ownershipCards is derived from ownershipKey's rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownershipToken])

  const ownership: { status: 'idle' | 'loading' | 'failed' } | { status: 'ready'; facts: OwnershipRowFacts[] } =
    !ownershipToken
      ? { status: 'idle' }
      : ownershipResult?.token !== ownershipToken
        ? { status: 'loading' }
        : ownershipResult.facts
          ? { status: 'ready', facts: ownershipResult.facts }
          : { status: 'failed' }

  // What each copy shows and does. Before the ownership check finishes nothing is known to be owned,
  // so the controls wait (`busy`) and tags stay hidden.
  const intentView = useMemo(() => {
    if (!needsOwnership || !reviewRows || step.status !== 'review') return null
    const ready = ownership.status === 'ready'
    const { plans, allocation } = planImportDetailed({
      rows: reviewRows,
      facts: ready ? ownership.facts : [],
      edits: step.copyEdits,
      intent: effectiveIntent,
      defaults: step.defaults,
    })
    const views = intentCopyViews(reviewRows, plans, allocation, step.copyEdits, effectiveIntent, step.defaults)
    const byRow: Record<string, typeof plans> = {}
    for (const p of plans) (byRow[p.rowKey] ??= []).push(p)
    const tags: Record<string, IntentTag[]> = {}
    if (ready) for (const [k, v] of Object.entries(byRow)) tags[k] = rowIntentTags(v)
    return {
      views,
      tags: ready ? tags : undefined,
      busy: !ready,
      untickedAdd: hasUntickedAdd(views),
      summary: ready ? summaryText(summariseImportPlan(plans)) : null,
      choices: ready ? needsChoice(plans).length : 0,
    }
  }, [needsOwnership, reviewRows, step, ownership, effectiveIntent])

  const changeIntentCopy = useCallback(
    (row: { rowKey: string; cardName: string }, index: number, change: IntentChange): string | undefined => {
      const view = intentView?.views[row.rowKey]?.find((v) => v.index === index)
      if (!view || step.status !== 'review') return undefined
      const result = applyIntentChange(step.copyEdits as IntentCopyEdits, row.rowKey, row.cardName, view, change)
      setStep((prev) => (prev.status === 'review' ? { ...prev, copyEdits: result.edits } : prev))
      return result.message
    },
    [intentView, step]
  )

  /** The collapsed row's tick: all of a card's copies at once. */
  const changeIntentAdd = useCallback(
    (row: { rowKey: string; cardName: string }, add: boolean) => {
      const views = intentView?.views[row.rowKey]
      if (!views || step.status !== 'review') return
      let edits = step.copyEdits as IntentCopyEdits
      for (const view of views) {
        if (view.generic) continue
        edits = applyIntentChange(edits, row.rowKey, row.cardName, { ...view, add: !add }, { add }).edits
      }
      setStep((prev) => (prev.status === 'review' ? { ...prev, copyEdits: edits } : prev))
    },
    [intentView, step]
  )

  const handleImport = useCallback(async () => {
    if (step.status !== 'review' || savingRef.current) return
    const rows = step.preview.rows
    if (rows.length === 0 || !step.deckName.trim()) return

    savingRef.current = true
    setStep({ ...step, status: 'importing', cancellable: false, processed: 0, total: rows.length })

    try {
      const deck = buildCommitDeck(rows)
      deck.name = step.deckName

      const res = await fetch('/api/decks/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deck,
          name: step.deckName,
          format: step.format,
          defaults: step.defaults,
          copyEdits: stripIntentFields(step.copyEdits as IntentCopyEdits),
          genericArt: step.genericArt ?? {},
          unmatched: step.preview.unmatched,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Import failed' }))
        throw new Error(body.error ?? 'Import failed')
      }

      const summary: {
        deckId: number
        genericNotes?: string[]
        allocationSummary: {
          assigned: number
          shortfall: number
          errors: string[]
          unmatched: ManaBoxPreviewResponse['unmatched']
        }
      } = await res.json()

      const totals = computeTotals(rows, 'deck', step.defaults, step.copyEdits)
      const doneSummary = {
        inserted: totals.tracked,
        skipped: step.preview.skippedTokens.length,
        basics: totals.basics,
        proxies: totals.proxies,
        unsleeved: totals.unsleeved,
        foils: totals.foil,
        unrecognisedValues:
          (step.preview.notices?.unrecognisedCondition ?? 0) +
          (step.preview.notices?.unrecognisedLanguage ?? 0) +
          (step.preview.notices?.unrecognisedFinish ?? 0),
        unlistedFinish: countFinishNotices(rows, step.defaults, step.copyEdits).unlistedFinish,
        genericNotes: summary.genericNotes ?? [],
        unmatched: step.preview.unmatched,
        deckId: summary.deckId,
      }

      // Save the commander chosen on the review screen. The deck already exists, so a failure here
      // does not undo the import; the result screen then says the commander is still unset.
      let commanderSaved = false
      if (step.commander && getFormatConfig(step.format).hasCommander) {
        try {
          const patch = await fetch(`/api/decks/${summary.deckId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commander_name: step.commander.name,
              commander_scryfall_id: step.commander.scryfallId,
            }),
          })
          commanderSaved = patch.ok
        } catch {
          commanderSaved = false
        }
      }

      setStep({
        status: 'done',
        summary: doneSummary,
        deckName: step.deckName,
        format: step.format,
        commanderName: commanderSaved ? step.commander?.name : undefined,
      })

      queryClient.invalidateQueries({ queryKey: ['decks'] })
      try {
        sessionStorage.setItem('manabox-import-summary', JSON.stringify(doneSummary))
      } catch {
        // ignore storage errors
      }
      onComplete?.(summary.deckId, step.format, step.deckName, doneSummary)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStep({ status: 'failed', error: message, file: step.file, previousStatus: 'importing' })
    } finally {
      savingRef.current = false
    }
  }, [step, queryClient, onComplete])

  /** "Open deck" on the result screen: the only thing that navigates. */
  const handleDone = useCallback(() => {
    if (step.status !== 'done') return
    const deckId = step.summary.deckId
    if (!deckId) return
    if (onFinish) onFinish(deckId)
    else router.push(`/decks/${deckId}?freshImport=true${step.format === 'commander' && !step.commanderName ? '&pickCommander=true' : ''}`)
  }, [step, router, onFinish])

  /** "Close" on the result screen: closes only; the deck is not opened. */
  const handleClose = useCallback(() => {
    if (onClose) onClose()
    else reset()
  }, [onClose, reset])

  const setDefaults = useCallback((defaults: ImportDefaults) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, defaults } : prev))
  }, [])

  const setCopyEdits = useCallback((copyEdits: ImportCopyEdits) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, copyEdits } : prev))
  }, [])

  const setOpenRowKeys = useCallback((openRowKeys: Set<string>) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, openRowKeys } : prev))
  }, [])

  const setDeckName = useCallback((deckName: string) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, deckName } : prev))
  }, [])

  const setFormat = useCallback((format: string) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, format } : prev))
  }, [])

  const setGenericArt = useCallback((rowKey: string, art: { scryfallId: string } | null) => {
    setStep((prev) => {
      if (prev.status !== 'review') return prev
      const next = { ...(prev.genericArt ?? {}) }
      if (art) next[rowKey] = art
      else delete next[rowKey]
      return { ...prev, genericArt: next }
    })
  }, [])

  const setCommander = useCallback((commander: { name: string; scryfallId: string | null } | null) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, commander } : prev))
  }, [])

  const setFilter = useCallback((filter: RowFilter) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, filter } : prev))
  }, [])

  const setQuery = useCallback((query: string) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, query } : prev))
  }, [])

  const setSelectedIds = useCallback((selectedIds: Set<string>) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, selectedIds } : prev))
  }, [])

  const stage = fill ? IMPORT_STAGE_CLASS : ''
  const grow = fill ? 'min-h-0 flex-1' : ''
  return (
    <div className={`flex flex-col gap-3 ${fill ? 'min-h-0 flex-1' : ''}`}>
      {titleSlot}

      {step.status === 'idle' && intent === null && heldFile && (
        <p className="text-[length:var(--fs-sm)] text-muted-foreground" role="status">
          {heldFile.name} · {INTENT_FILE_HELD}
        </p>
      )}

      {step.status === 'idle' && (
        <ManaBoxFilePicker
          accept=".csv,.txt,text/csv,text/plain"
          extensions={['csv', 'txt']}
          label=".csv or .txt"
          kind="deck"
          showHelp={fill}
          onFile={handleFile}
          onError={setError}
          error={error}
        />
      )}

      {step.status === 'checking' && (
        <div className={stage || 'flex flex-col items-center py-6'}>
          <ImportWorking
            title="Reading your file…"
            detail={processingDetail(step.cards)}
            fileName={step.file.name}
          />
        </div>
      )}

      {step.status === 'review' && (
        <div className={`flex flex-col gap-3 ${grow}`}>
          <ImportFileChip
            fileName={step.preview.fileName}
            cardCount={step.preview.rows.length}
            copyCount={step.preview.rows.reduce((sum, r) => sum + r.qty, 0)}
            onChange={reset}
          />
          <DeckImportOptions
            name={step.deckName}
            onNameChange={setDeckName}
            format={step.format}
            onFormatChange={setFormat}
            commanderSlot={
              getFormatConfig(step.format).hasCommander ? (
                <ReviewCommanderSelect
                  cards={step.preview.rows
                    .filter((r) => !r.isBasicLand)
                    .map((r) => ({ name: r.cardName, scryfallId: r.scryfallId }))}
                  value={step.commander}
                  onChange={setCommander}
                />
              ) : undefined
            }
          />
          <ImportNotices
            unmatched={step.preview.unmatched}
            tokens={step.preview.skippedTokens}
            source={step.source}
            hidden={notes.hidden}
            onDismiss={notes.hide}
          />
          <ImportDefaultsBar
            defaults={step.defaults}
            onChange={setDefaults}
            basics={
              basicsQty + specificBasicsQty > 0
                ? { generic: basicsQty, specific: specificBasicsQty }
                : undefined
            }
          />
          <ImportValueNoticeLines
            unrecognised={
              (step.preview.notices?.unrecognisedCondition ?? 0) +
              (step.preview.notices?.unrecognisedLanguage ?? 0) +
              (step.preview.notices?.unrecognisedFinish ?? 0)
            }
            {...countFinishNotices(step.preview.rows, step.defaults, step.copyEdits)}
            hidden={notes.hidden}
            onDismiss={notes.hide}
          />
          <ImportCardList
            rows={step.preview.rows}
            kind="deck"
            source={step.source}
            defaults={step.defaults}
            copyEdits={step.copyEdits}
            genericArt={step.genericArt ?? {}}
            onGenericArtChange={setGenericArt}
            onCopyEditsChange={setCopyEdits}
            openRowKeys={step.openRowKeys}
            onOpenRowKeysChange={setOpenRowKeys}
            filter={step.filter}
            onFilterChange={setFilter}
            query={step.query}
            onQueryChange={setQuery}
            selectedIds={step.selectedIds}
            onSelectedIdsChange={setSelectedIds}
            intentTagsByRow={intentView?.tags}
            intent={
              intentView
                ? {
                    viewsByRow: intentView.views,
                    busy: intentView.busy,
                    onChange: changeIntentCopy,
                    onChangeAdd: changeIntentAdd,
                  }
                : undefined
            }
          />
          {needsOwnership && ownership.status === 'loading' && (
            <p role="status" className="text-[length:var(--fs-sm)] text-muted-foreground">
              {OWNERSHIP_LOADING}
            </p>
          )}
          {needsOwnership && ownership.status === 'failed' && (
            <p role="alert" className="text-[length:var(--fs-sm)] text-[var(--signal-warning)]">
              {OWNERSHIP_FAILED}{' '}
              <button type="button" className="underline" onClick={() => setOwnershipTry((n) => n + 1)}>
                Try again
              </button>
            </p>
          )}
          {intentView?.summary && (
            <p role="status" className="text-[length:var(--fs-sm)] text-muted-foreground">
              {intentView.summary}
            </p>
          )}
        </div>
      )}

      {step.status === 'importing' && (
        <div className={stage || 'flex flex-col items-center py-6'}>
          <ImportWorking
            title="Creating your deck…"
            detail="Keep this window open until it finishes."
          />
        </div>
      )}

      {step.status === 'failed' && (
        <div className={`flex flex-col gap-3 ${grow}`}>
          <div className={fill ? 'flex flex-1 items-center justify-center text-center' : ''}>
            <p className="text-[length:var(--fs-sm)] text-destructive">{step.error}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel ?? reset}>
              {onCancel ? 'Back' : 'Back'}
            </Button>
            <Button type="button" onClick={() => handleFile(step.file)}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {step.status === 'done' && (
        <ImportResult
          kind="deck"
          name={step.deckName}
          inserted={step.summary.inserted}
          skipped={step.summary.skipped}
          basics={step.summary.basics}
          proxies={step.summary.proxies}
          unsleeved={step.summary.unsleeved}
          foils={step.summary.foils}
          unrecognisedValues={step.summary.unrecognisedValues}
          unlistedFinish={step.summary.unlistedFinish}
          genericNotes={step.summary.genericNotes}
          unmatched={step.summary.unmatched}
          deckId={step.summary.deckId}
          onOpenDeck={handleDone}
          onDismiss={handleClose}
          commanderSlot={
            step.format === 'commander' && !step.commanderName ? (
              <p className="flex items-center justify-center gap-2 text-[length:var(--fs-sm)] text-muted-foreground">
                <Info className="size-4 shrink-0" aria-hidden="true" />
                No commander yet. Choose one on the deck page.
              </p>
            ) : undefined
          }
        />
      )}

      {step.status === 'review' && (
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
          <ImportSummary
            rows={step.preview.rows}
            kind="deck"
            defaults={step.defaults}
            copyEdits={step.copyEdits}
            unmatchedCount={step.preview.unmatched.length}
            hiddenCount={countHiddenNotes(notes.hidden, step.preview, countFinishNotices(step.preview.rows, step.defaults, step.copyEdits))}
            onShowHidden={notes.restoreAll}
          />
          <div className="flex items-center gap-2">
            {intentView && intentView.choices > 0 && (
              <span className="text-[length:var(--fs-sm)] text-[var(--signal-warning)]">
                {intentView.choices} {intentView.choices === 1 ? 'card needs' : 'cards need'} a choice
              </span>
            )}
            {saveBlockedByIntent && (
              <span className="text-[length:var(--fs-sm)] text-muted-foreground">{INTENT_SAVE_PENDING}</span>
            )}
            {!saveBlockedByIntent && intentView?.untickedAdd && (
              <span className="text-[length:var(--fs-sm)] text-muted-foreground">{INTENT_SAVE_PENDING_UNTICKED}</span>
            )}
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={
                saveBlockedByIntent ||
                !!intentView?.untickedAdd ||
                step.preview.rows.length === 0 ||
                !step.deckName.trim()
              }
            >
              Import deck
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
