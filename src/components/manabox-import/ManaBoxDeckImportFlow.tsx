'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
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
import { countFinishNotices } from '@/lib/import-copies'
import type { ImportCopyEdits, ImportDefaults } from '../../../docs/oracle/contracts/import-row-editing.types'
import { ImportCardList } from './ImportCardList'
import { ImportSummary } from './ImportSummary'
import { ImportWorking } from './ImportWorking'
import { EMPTY_FILE_MESSAGE, UNREADABLE_FILE_MESSAGE, processingDetail } from './import-copy'
import { ImportResult } from './ImportResult'
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
  titleSlot?: React.ReactNode
  /** Fill a fixed-size modal: every stage uses the same space (used by the import dialog). */
  fill?: boolean
  /** Tells the window around the flow what it is doing, so it can guard closing. */
  onStateChange?: (state: DeckFlowState) => void
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

export function ManaBoxDeckImportFlow({ onComplete, onCancel, onFinish, titleSlot, fill, onStateChange }: ManaBoxDeckImportFlowProps) {
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
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const detectSource = (file: File): ImportSource => {
    return file.name.toLowerCase().endsWith('.txt') ? 'text' : 'csv'
  }

  const handleFile = useCallback(async (file: File) => {
    setError(null)
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
        genericBasics: true,
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
  }, [])

  const basicsQty =
    step.status === 'review'
      ? step.preview.rows
          .filter((r) => r.isBasicLand)
          .reduce((sum, r) => sum + r.qty, 0)
      : 0

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
          convertBasicLandsToGeneric: step.genericBasics,
          defaults: step.defaults,
          copyEdits: step.copyEdits,
          unmatched: step.preview.unmatched,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Import failed' }))
        throw new Error(body.error ?? 'Import failed')
      }

      const summary: {
        deckId: number
        allocationSummary: {
          assigned: number
          shortfall: number
          errors: string[]
          unmatched: ManaBoxPreviewResponse['unmatched']
        }
      } = await res.json()

      const totals = computeTotals(rows, 'deck', step.genericBasics, step.defaults, step.copyEdits)
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
        unmatched: step.preview.unmatched,
        deckId: summary.deckId,
      }

      setStep({
        status: 'done',
        summary: doneSummary,
        deckName: step.deckName,
        format: step.format,
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

  /** Close / Open deck on the result screen. */
  const handleDone = useCallback(() => {
    if (step.status !== 'done') return
    const deckId = step.summary.deckId
    if (!deckId) return
    if (onFinish) onFinish(deckId)
    else router.push(`/decks/${deckId}?freshImport=true${step.format === 'commander' ? '&pickCommander=true' : ''}`)
  }, [step, router, onFinish])

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

  const setGenericBasics = useCallback((genericBasics: boolean) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, genericBasics } : prev))
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

      {step.status === 'idle' && (
        <ManaBoxFilePicker
          accept=".csv,.txt,text/csv,text/plain"
          extensions={['csv', 'txt']}
          label="ManaBox .csv or .txt"
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
            genericBasics={step.genericBasics}
            onGenericBasicsChange={setGenericBasics}
            basicsQty={basicsQty}
            cardCount={step.preview.rows.reduce((sum, r) => sum + r.qty, 0)}
          />
          <ImportNotices
            unmatched={step.preview.unmatched}
            tokens={step.preview.skippedTokens}
            source={step.source}
            hidden={notes.hidden}
            onDismiss={notes.hide}
          />
          <ImportDefaultsBar defaults={step.defaults} onChange={setDefaults} />
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
            onCopyEditsChange={setCopyEdits}
            openRowKeys={step.openRowKeys}
            onOpenRowKeysChange={setOpenRowKeys}
            filter={step.filter}
            onFilterChange={setFilter}
            query={step.query}
            onQueryChange={setQuery}
            selectedIds={step.selectedIds}
            onSelectedIdsChange={setSelectedIds}
          />
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
          unmatched={step.summary.unmatched}
          deckId={step.summary.deckId}
          onOpenDeck={handleDone}
          onDismiss={handleDone}
          commanderSlot={
            step.format === 'commander' ? (
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
            genericBasics={step.genericBasics}
            defaults={step.defaults}
            copyEdits={step.copyEdits}
            unmatchedCount={step.preview.unmatched.length}
            hiddenCount={countHiddenNotes(notes.hidden, step.preview, countFinishNotices(step.preview.rows, step.defaults, step.copyEdits))}
            onShowHidden={notes.restoreAll}
          />
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={step.preview.rows.length === 0 || !step.deckName.trim()}
            >
              Import deck
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
