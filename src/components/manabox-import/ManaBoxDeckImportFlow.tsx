'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Info } from 'lucide-react'
import { ManaBoxFilePicker } from './ManaBoxFilePicker'
import { estimateFileCopies } from './import-stream'
import { DeckImportOptions } from './DeckImportOptions'
import { ImportNotices, ImportValueNoticeLines, useHiddenNotes, countHiddenNotes } from './ImportNoticeLine'
import { ImportDefaultsBar } from './ImportDefaultsBar'
import { ReviewCommanderSelect } from './ReviewCommanderSelect'
import { useSlotApplies } from './use-slot-applies'
import { isIgnorableBasic } from '@/lib/basic-lands'
import { getFormatConfig } from '@/lib/format-config'
import { countFinishNotices } from '@/lib/import-copies'
import { isManaBoxCsv } from '@/lib/manabox-import'
import type { ImportCopyEdits, ImportDefaults } from '../../../docs/oracle/contracts/import-row-editing.types'
import { ImportCardList } from './ImportCardList'
import { ImportSummary } from './ImportSummary'
import { ImportWorking } from './ImportWorking'
import {
  EMPTY_FILE_MESSAGE,
  UNREADABLE_FILE_MESSAGE,
  processingDetail,
  INTENT_SAVE_ENABLED,
  intentNotes,
  INTENT_SAVE_PENDING,
  INTENT_SAVE_PENDING_NOT_NEW,
  SHORT_BLOCKS_IMPORT,
  SHARED_BLOCKS_IMPORT,
  OWNERSHIP_FAILED,
  OWNERSHIP_LOADING,
  DUPLICATE_NAME_NOTE,
} from './import-copy'
import type { DeckImportIntentSummary, ImportIntent, IntentCopyEdits, OwnershipResponse, OwnershipRowFacts } from '../../../docs/oracle/contracts/import-intent.types'
import {
  applyIntentChange,
  hasNonNewCopy,
  intentChoiceStats,
  intentCopyViews,
  isGenericImportRow,
  needsChoice,
  planImportDetailed,
  setIntentEdit,
  stripIntentFields,
  summariseImportPlan,
  summaryText,
  deckBreakdown,
  breakdownLine,
  type IntentChange,
} from '@/lib/import-intent'
import { ImportResult } from './ImportResult'
import { ImportDeckDetails } from './ImportDeckDetails'
import { ImportIntentChoice } from './ImportIntentChoice'
import { IMPORT_STAGE_CLASS } from './import-labels'
import type { ImportStep, RowFilter, ImportSource } from './types'
import { INITIAL_DEFAULTS, computeTotals, buildCommitDeck } from './types'
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
   * What the deck is (I bought it / I built it / I'm planning it).
   * `null` = not chosen yet: the deck is read and the question is asked with real numbers, then
   * `onIntentChange` is called. `undefined` = no intent question (plain purchase).
   */
  intent?: ImportIntent | null
  /** The owner answered "What's this deck?" (or went back: null). */
  onIntentChange?: (intent: ImportIntent | null) => void
  /** Commander to preselect on the review screen (a precon knows its commander). */
  initialCommanderName?: string | null
  /** A precon: "I bought it" is suggested (not locked). */
  precon?: boolean
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
  /** The deck has loaded and "What's this deck?" is being asked. */
  choosing: boolean
}

/** "100 cards (95 in deck · 5 in maybeboard)". */
function deckLoadLine(rows: { qty: number; board?: string }[]): string {
  const maybe = rows.filter((r) => r.board === 'maybeboard').reduce((n, r) => n + r.qty, 0)
  const all = rows.reduce((n, r) => n + r.qty, 0)
  const cards = `${all} ${all === 1 ? 'card' : 'cards'}`
  return maybe > 0 ? `${cards} (${all - maybe} in deck · ${maybe} in maybeboard)` : cards
}

export function ManaBoxDeckImportFlow({ onComplete, onCancel, onFinish, onClose, titleSlot, fill, onStateChange, initialFile, intent, onIntentChange, initialCommanderName, precon }: ManaBoxDeckImportFlowProps) {
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
  // "What's this deck?" before it is confirmed with Continue.
  const [pickedIntent, setPickedIntent] = useState<ImportIntent | null>(null)
  const effectiveIntent: ImportIntent = intent ?? 'purchased'
  type OwnershipResult = { token: string; facts: OwnershipRowFacts[] | null }
  const [ownershipResult, setOwnershipResult] = useState<OwnershipResult | null>(null)
  const [ownershipTry, setOwnershipTry] = useState(0)

  const checking = step.status === 'checking'
  const saving = step.status === 'importing'
  const choosing = step.status === 'review' && intent === null
  const reviewing = step.status === 'review' && !choosing
  const done = step.status === 'done'
  const hasEdits =
    step.status === 'review' &&
    (Object.keys(step.copyEdits).length > 0 ||
      JSON.stringify(step.defaults) !== JSON.stringify(INITIAL_DEFAULTS))
  useEffect(() => {
    onStateChange?.({ checking, saving, hasEdits, reviewing, done, choosing })
  }, [checking, saving, hasEdits, reviewing, done, choosing, onStateChange])

  const reset = useCallback(() => {
    setStep({ status: 'idle' })
    setError(null)
    setPickedIntent(null)
    abortRef.current?.abort()
    abortRef.current = null
    onIntentChange?.(null)
  }, [onIntentChange])

  // The file's content decides CSV or text, not its extension (import-formats E-12).
  const detectSource = (text: string): ImportSource => {
    return isManaBoxCsv(text) ? 'csv' : 'text'
  }

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setStep({ status: 'checking', file })
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const text = await file.text()
      const source = detectSource(text)
      setStep({ status: 'checking', file, cards: estimateFileCopies(text) })
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

      if (!res.ok) {
        // The server says why in plain words (unsupported type, too big, no cards).
        let message = UNREADABLE_FILE_MESSAGE
        try {
          const payload = (await res.json()) as { error?: string }
          if (res.status === 400 && payload.error) message = payload.error
        } catch {
          // keep the generic message
        }
        if (controller.signal.aborted) return
        setError(message)
        setStep({ status: 'idle' })
        return
      }

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
          // A name passed in (a precon) wins; otherwise the commander the file marks is pre-ticked
          // (import-formats S-6). The picker still opens so the owner can change it.
          const wanted = initialCommanderName ?? preview.commanders?.[0]?.name
          if (!wanted) return null
          const hit = preview.rows.find((r) => !r.isBasicLand && r.cardName === wanted)
          return hit ? { name: hit.cardName, scryfallId: hit.scryfallId } : null
        })(),
        second: (() => {
          const wanted = initialCommanderName ? undefined : preview.commanders?.[1]?.name
          const hit = wanted ? preview.rows.find((r) => !r.isBasicLand && r.cardName === wanted) : undefined
          return hit ? { name: hit.cardName, scryfallId: hit.scryfallId } : null
        })(),
        companion: (() => {
          const wanted = preview.companion?.name
          const hit = wanted ? preview.rows.find((r) => !r.isBasicLand && r.cardName === wanted) : undefined
          return hit ? { name: hit.cardName, scryfallId: hit.scryfallId } : null
        })(),
        defaults: INITIAL_DEFAULTS,
        ignoreBasics: true,
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
  }, [initialCommanderName])

  // A pasted decklist arrives as a small text file and goes through the same check and review.
  const handledInitialFile = useRef<File | null>(null)
  useEffect(() => {
    if (!initialFile || handledInitialFile.current === initialFile) return
    handledInitialFile.current = initialFile
    void handleFile(initialFile)
  }, [initialFile, handleFile])

  // "Ignore basic lands" covers the five basics and Wastes (not Snow-Covered). The count is copies, not rows.
  const ignorableBasicsQty =
    step.status === 'review'
      ? step.preview.rows
          .filter((r) => r.board !== 'maybeboard' && isIgnorableBasic(r.cardName))
          .reduce((sum, r) => sum + r.qty, 0)
      : 0
  const ignoreBasics = step.status === 'review' ? step.ignoreBasics !== false : true

  // Existing decks, for the duplicate-name warning (the same read the deck list uses). Warns only.
  const decksQuery = useQuery<{ decks?: { name: string }[] }>({
    queryKey: ['decks'],
    queryFn: () =>
      fetch('/api/decks')
        .then((r) => (r.ok ? r.json() : { decks: [] }))
        .catch(() => ({ decks: [] })),
    enabled: step.status === 'review',
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const commanderCards = useMemo(
    () =>
      step.status === 'review'
        ? step.preview.rows.filter((r) => !r.isBasicLand).map((r) => ({ name: r.cardName, scryfallId: r.scryfallId }))
        : [],
    [step]
  )
  const showSecond = useSlotApplies('second', commanderCards, step.status === 'review' ? step.commander?.name : undefined, step.status === 'review' && !choosing)
  const showCompanion = useSlotApplies('companion', commanderCards, undefined, step.status === 'review' && !choosing)
  const duplicateName = useMemo(() => {
    if (step.status !== 'review') return false
    const wanted = step.deckName.trim().toLowerCase()
    return !!wanted && (decksQuery.data?.decks ?? []).some((d) => d.name?.trim().toLowerCase() === wanted)
  }, [step, decksQuery.data])

  // Built and planned decks can't be saved yet (S4). Every deck with an intent checks ownership
  // (read-only) so the Add tick and the choices know what the owner has.
  // Switched on (NEXT_PUBLIC_IMPORT_INTENT_SAVE=true) only after migration M2 is applied and reviewed.
  const intentSaveOn = INTENT_SAVE_ENABLED && !!intent
  const saveBlockedByIntent = !INTENT_SAVE_ENABLED && (intent === 'built' || intent === 'planned')
  const needsOwnership = intent !== undefined
  const previewRows = step.status === 'review' ? step.preview.rows : null
  // Maybeboard rows are saved as maybes with no copies, so ownership and the plan ignore them (D-022).
  const reviewRows = useMemo(
    () => (previewRows ? previewRows.filter((r) => r.board !== 'maybeboard') : null),
    [previewRows]
  )
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
    return {
      views,
      busy: !ready,
      notAllNew: hasNonNewCopy(views),
      summary: ready ? summaryText(summariseImportPlan(plans)) : null,
      breakdown: ready ? deckBreakdown(plans) : null,
      choices: ready ? needsChoice(plans).length : 0,
      shared: ready ? plans.filter((p) => p.kind === 'share').length : 0,
    }
  }, [needsOwnership, reviewRows, step, ownership, effectiveIntent])

  /** Review → "What's this deck?" again. Choices made under the old answer are dropped. */
  const backToQuestion = useCallback(() => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, copyEdits: {}, selectedIds: new Set() } : prev))
    onIntentChange?.(null)
  }, [onIntentChange])

  // "What's this deck?" with real numbers, once the deck and the collection check are in.
  const choiceStats = useMemo(() => {
    if (!choosing || !reviewRows || step.status !== 'review' || ownership.status !== 'ready') return null
    return intentChoiceStats({ rows: reviewRows, facts: ownership.facts, defaults: step.defaults }, { precon })
  }, [choosing, reviewRows, step, ownership, precon])
  const shownPick = pickedIntent ?? choiceStats?.suggested ?? null

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

  /** The collapsed row and the bulk bar: every copy of each row at once. */
  const changeIntentRows = useCallback(
    (rows: { rowKey: string; cardName: string }[], change: IntentChange) => {
      if (step.status !== 'review') return
      let edits = step.copyEdits as IntentCopyEdits
      for (const row of rows) {
        for (const view of intentView?.views[row.rowKey] ?? []) {
          if (view.generic) continue
          edits = applyIntentChange(edits, row.rowKey, row.cardName, view, change).edits
        }
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
          copyEdits: intentSaveOn ? step.copyEdits : stripIntentFields(step.copyEdits as IntentCopyEdits),
          ...(intentSaveOn ? { intent } : {}),
          genericArt: step.genericArt ?? {},
          unmatched: step.preview.unmatched,
          ...(getFormatConfig(step.format).hasCommander && (step.commander || step.companion)
            ? {
                commandZone: {
                  commander: step.commander?.name ?? null,
                  second: step.commander ? (step.second?.name ?? null) : null,
                  companion: step.companion?.name ?? null,
                },
              }
            : {}),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Import failed' }))
        throw new Error(body.error ?? 'Import failed')
      }

      const summary: {
        deckId: number
        genericNotes?: string[]
        intentSummary?: DeckImportIntentSummary
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
        genericNotes: [...(summary.genericNotes ?? []), ...intentNotes(summary.intentSummary)],
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

  const setIgnoreBasics = useCallback((ignoreBasics: boolean) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, ignoreBasics } : prev))
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
    // A new commander can invalidate the second commander (the pair rule), so it is cleared.
    setStep((prev) =>
      prev.status === 'review' ? { ...prev, commander, second: prev.commander?.name === commander?.name ? prev.second : null } : prev
    )
  }, [])

  const setSecond = useCallback((second: { name: string; scryfallId: string | null } | null) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, second } : prev))
  }, [])

  const setCompanion = useCallback((companion: { name: string; scryfallId: string | null } | null) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, companion } : prev))
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

      {(step.status === 'idle' || step.status === 'checking' || choosing) && (
        <div className={`flex flex-col gap-3 ${grow}`}>
          {/* One screen: the source area on top, "What's this deck?" below (disabled until the deck has loaded). */}
          <div className={fill ? 'flex min-h-0 flex-1 flex-col' : ''}>
            {step.status === 'idle' && (
              <ManaBoxFilePicker
                accept=".csv,.txt,text/csv,text/plain"
                extensions={['csv', 'txt']}
                label=".csv or .txt"
                kind="deck"
                showHelp={false}
                onFile={handleFile}
                onError={setError}
                error={error}
              />
            )}
            {step.status === 'checking' && (
              <div className={stage || 'flex flex-col items-center py-6'}>
                <ImportWorking
                  title="Processing deck list…"
                  detail={processingDetail(step.cards)}
                  fileName={step.file.name}
                />
              </div>
            )}
            {choosing && step.status === 'review' && (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <ImportDeckDetails
                  deckName={step.deckName}
                  commander={step.commander}
                  rows={step.preview.rows}
                  summary={deckLoadLine(step.preview.rows)}
                />
                {ownership.status === 'loading' && (
                  <p role="status" className="text-[length:var(--fs-sm)] text-muted-foreground">
                    {OWNERSHIP_LOADING}
                  </p>
                )}
                {ownership.status === 'failed' && (
                  <p role="alert" className="text-[length:var(--fs-sm)] text-[var(--signal-warning)]">
                    {OWNERSHIP_FAILED}{' '}
                    <button type="button" className="underline" onClick={() => setOwnershipTry((n) => n + 1)}>
                      Try again
                    </button>
                  </p>
                )}
              </div>
            )}
          </div>
          {needsOwnership && (
            <ImportIntentChoice
              value={choosing ? shownPick : null}
              onChange={setPickedIntent}
              disabled={!choosing}
              stats={choosing ? choiceStats?.byIntent : undefined}
              headline={choosing ? choiceStats?.headline : undefined}
              suggestion={choosing && choiceStats ? { value: choiceStats.suggested, reason: choiceStats.reason } : undefined}
            />
          )}
          <div className="flex justify-end gap-2 -mx-4 -mb-4 rounded-b-xl border-t bg-muted/50 p-4">
            <Button type="button" variant="outline" onClick={onCancel ?? reset}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!choosing || !shownPick}
              onClick={() => shownPick && onIntentChange?.(shownPick)}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step.status === 'review' && !choosing && (
        <div className={`flex flex-col gap-3 ${grow}`}>
          <DeckImportOptions
            name={step.deckName}
            onNameChange={setDeckName}
            nameNote={duplicateName ? DUPLICATE_NAME_NOTE(step.deckName.trim()) : null}
            format={step.format}
            onFormatChange={setFormat}
            commanderSlot={
              getFormatConfig(step.format).hasCommander ? (
                <div className="flex items-end gap-2.5 [&>*]:min-w-0 [&>*]:flex-1">
                  <ReviewCommanderSelect cards={commanderCards} value={step.commander} onChange={setCommander} />
                  {step.commander && showSecond && (
                    <ReviewCommanderSelect
                      slot="second"
                      cards={commanderCards}
                      withName={step.commander.name}
                      value={step.second ?? null}
                      onChange={setSecond}
                    />
                  )}
                  {showCompanion && (
                    <ReviewCommanderSelect slot="companion" cards={commanderCards} value={step.companion ?? null} onChange={setCompanion} />
                  )}
                </div>
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
          {step.preview.notes && step.preview.notes.length > 0 && (
            <ul
              className="flex flex-col gap-1 text-[length:var(--fs-sm)] text-muted-foreground"
              aria-label="Notes about this file"
            >
              {step.preview.notes.map((note) => (
                <li key={note} className="flex items-start gap-2">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}
          <ImportDefaultsBar
            defaults={step.defaults}
            onChange={setDefaults}
            ignoreBasics={{ on: ignoreBasics, count: ignorableBasicsQty, onChange: setIgnoreBasics }}
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
            intent={
              intentView
                ? {
                    viewsByRow: intentView.views,
                    busy: intentView.busy,
                    onChange: changeIntentCopy,
                    onChangeRows: changeIntentRows,
                    quiet: intent === 'planned',
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
          {intentView?.breakdown && (
            <p role="status" className="text-[length:var(--fs-sm)] text-muted-foreground">
              {breakdownLine(intentView.breakdown, step.filter)}
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

      {step.status === 'review' && !choosing && (
        <div className="flex items-center justify-between -mx-4 -mb-4 rounded-b-xl border-t bg-muted/50 p-4">
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
                {SHORT_BLOCKS_IMPORT(intentView.choices)}
              </span>
            )}
            {intentSaveOn && intentView && intentView.shared > 0 && (
              <span className="text-[length:var(--fs-sm)] text-[var(--signal-warning)]">
                {SHARED_BLOCKS_IMPORT(intentView.shared)}
              </span>
            )}
            {saveBlockedByIntent && (
              <span className="text-[length:var(--fs-sm)] text-muted-foreground">{INTENT_SAVE_PENDING}</span>
            )}
            {!intentSaveOn && !saveBlockedByIntent && intentView?.notAllNew && !intentView.choices && (
              <span className="text-[length:var(--fs-sm)] text-muted-foreground">{INTENT_SAVE_PENDING_NOT_NEW}</span>
            )}
            <Button type="button" variant="outline" onClick={onIntentChange ? backToQuestion : reset}>
              Back
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={
                saveBlockedByIntent ||
                (!intentSaveOn && !!intentView?.notAllNew) ||
                (intentView?.choices ?? 0) > 0 ||
                (intentSaveOn && (intentView?.shared ?? 0) > 0) ||
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
