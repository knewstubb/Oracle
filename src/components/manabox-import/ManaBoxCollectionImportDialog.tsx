'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ManaBoxFilePicker } from './ManaBoxFilePicker'
import { ImportFileChip } from './ImportFileChip'
import { ImportNotices, ImportValueNoticeLines, useHiddenNotes, countHiddenNotes } from './ImportNoticeLine'
import { ImportDefaultsBar } from './ImportDefaultsBar'
import { countFinishNotices } from '@/lib/import-copies'
import type { ImportCopyEdits, ImportDefaults } from '../../../docs/oracle/contracts/import-row-editing.types'
import { ImportCardList } from './ImportCardList'
import { ImportSummary } from './ImportSummary'
import { ImportTitleIcon } from './ImportTitleIcon'
import { ImportWorking } from './ImportWorking'
import { ImportDiscardDialog } from './ImportDiscardDialog'
import { decideCollectionClose } from './import-close-guard'
import { EMPTY_FILE_MESSAGE, UNREADABLE_FILE_MESSAGE, processingDetail } from './import-copy'
import { ImportResult } from './ImportResult'
import { IMPORT_MODAL_CLASS, IMPORT_STAGE_CLASS } from './import-labels'
import { toast } from 'sonner'
import { readImportResponse, estimateFileCards, copiesWord } from './import-stream'
import type { ImportStep, RowFilter } from './types'
import { INITIAL_DEFAULTS, computeTotals } from './types'
import type { ManaBoxPreviewResponse } from '../../../docs/oracle/contracts/manabox-import.types'

export interface ManaBoxCollectionImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManaBoxCollectionImportDialog({
  open,
  onOpenChange,
}: ManaBoxCollectionImportDialogProps) {
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
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    setStep({ status: 'idle' })
    setError(null)
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const busy = step.status === 'checking'
  // Once the save starts it cannot be stopped, so nothing may close the window.
  const saving = step.status === 'importing'
  const savingRef = useRef(false)
  const hasEdits =
    step.status === 'review' &&
    (Object.keys(step.copyEdits).length > 0 ||
      JSON.stringify(step.defaults) !== JSON.stringify(INITIAL_DEFAULTS))

  const [discardOpen, setDiscardOpen] = useState(false)
  const finished = step.status === 'done' || step.status === 'failed'

  const handleClose = useCallback(
    (nextOpen: boolean, details?: { reason?: string; cancel?: () => void }) => {
      if (!nextOpen) {
        const decision = decideCollectionClose(details?.reason, { checking: busy, saving, hasEdits, finished })
        if (decision === 'block') return details?.cancel?.()
        if (decision === 'confirm') {
          setDiscardOpen(true)
          return details?.cancel?.()
        }
        reset()
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange, reset, busy, saving, hasEdits, finished]
  )

  const confirmDiscard = useCallback(() => {
    setDiscardOpen(false)
    reset()
    onOpenChange(false)
  }, [reset, onOpenChange])

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setStep({ status: 'checking', file })
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const text = await file.text()
      setStep({ status: 'checking', file, cards: estimateFileCards(text) })
      const res = await fetch('/api/collection/import/preview', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent: text, fileName: file.name }),
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
        source: 'csv',
        preview: {
          ...preview,
          rows: preview.rows,
        },
        deckName: file.name.replace(/\.csv$/i, ''),
        format: 'commander',
        genericBasics: true,
        commander: null,
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

  const handleImport = useCallback(async () => {
    if (step.status !== 'review' || savingRef.current) return
    savingRef.current = true
    const rows = step.preview.rows
    if (rows.length === 0) return

    const totalCopies = rows.reduce((sum, r) => sum + r.qty, 0)
    setStep({ ...step, status: 'importing', cancellable: false, processed: 0, total: totalCopies, phase: 'resolving' })

    try {
      const res = await fetch('/api/collection/import?mode=manabox&stream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvContent: await step.file.text(),
          fileName: step.file.name,
          defaults: step.defaults,
          copyEdits: step.copyEdits,
        }),
      })

      const summary = await readImportResponse<{
        inserted: number
        skipped: number
        removed: number
        sourceTag: string
        errors: string[]
        unmatched: ManaBoxPreviewResponse['unmatched']
        durationMs: number
        unlistedFinish?: number
        foils?: number
      }>(res, (event) => {
        setStep((prev) =>
          prev.status === 'importing'
            ? {
                ...prev,
                phase: event.phase,
                processed: event.phase === 'writing' ? prev.total : Math.min(event.done, prev.total),
              }
            : prev
        )
      })

      setStep({
        status: 'done',
        summary: {
          inserted: summary.inserted,
          skipped: summary.skipped,
          basics: 0,
          proxies: computeTotals(rows, 'collection', false, step.defaults, step.copyEdits).proxies,
          unsleeved: 0,
          foils: summary.foils ?? computeTotals(rows, 'collection', false, step.defaults, step.copyEdits).foil,
          unrecognisedValues:
            (step.preview.notices?.unrecognisedCondition ?? 0) +
            (step.preview.notices?.unrecognisedLanguage ?? 0) +
            (step.preview.notices?.unrecognisedFinish ?? 0),
          unlistedFinish: summary.unlistedFinish ?? 0,
          unmatched: summary.unmatched,
        },
        deckName: step.deckName,
        format: step.format,
      })

      toast.success(`Added ${copiesWord(summary.inserted)} to your collection`)
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['collection-rollup'] })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStep({ status: 'failed', error: message, file: step.file, previousStatus: 'importing' })
    } finally {
      savingRef.current = false
    }
  }, [step, queryClient])

  const setDefaults = useCallback((defaults: ImportDefaults) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, defaults } : prev))
  }, [])

  const setCopyEdits = useCallback((copyEdits: ImportCopyEdits) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, copyEdits } : prev))
  }, [])

  const setOpenRowKeys = useCallback((openRowKeys: Set<string>) => {
    setStep((prev) => (prev.status === 'review' ? { ...prev, openRowKeys } : prev))
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

  const title = 'Import cards'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={IMPORT_MODAL_CLASS} showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>
            <ImportTitleIcon kind="collection" />
            {title}
          </DialogTitle>
          {step.status === 'idle' && (
            <DialogDescription>Import a ManaBox collection CSV.</DialogDescription>
          )}
          {step.status === 'review' && (
            <ImportFileChip
              fileName={step.preview.fileName}
              cardCount={step.preview.rows.length}
              copyCount={step.preview.rows.reduce((sum, r) => sum + r.qty, 0)}
              onChange={reset}
            />
          )}
        </DialogHeader>

        {step.status === 'idle' && (
          <ManaBoxFilePicker
            accept=".csv,text/csv"
            extensions={['csv']}
            label="ManaBox .csv"
            kind="collection"
            showHelp
            onFile={handleFile}
            onError={setError}
            error={error}
          />
        )}

        {step.status === 'checking' && (
          <div className={IMPORT_STAGE_CLASS}>
            <ImportWorking
              title="Reading your file…"
              detail={processingDetail(step.cards)}
              fileName={step.file.name}
            />
          </div>
        )}

        {step.status === 'review' && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
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
              kind="collection"
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
          <div className={IMPORT_STAGE_CLASS}>
            <ImportWorking
              title="Adding to your collection…"
              detail="Keep this window open until it finishes."
              processed={step.processed}
              total={step.total}
              unit="copies"
            />
          </div>
        )}

        {step.status === 'failed' && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-1 items-center justify-center text-center">
              <p className="text-[length:var(--fs-sm)] text-destructive">{step.error}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
              <Button type="button" variant="outline" onClick={reset}>
                Back
              </Button>
              <Button type="button" onClick={() => handleFile(step.file)}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {step.status === 'done' && (
          <ImportResult
            kind="collection"
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
            onViewCollection={() => handleClose(false)}
            onDismiss={() => handleClose(false)}
          />
        )}

        {step.status === 'review' && (
          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
            <ImportSummary
              rows={step.preview.rows}
              kind="collection"
              genericBasics={step.genericBasics}
              defaults={step.defaults}
              copyEdits={step.copyEdits}
              unmatchedCount={step.preview.unmatched.length}
              hiddenCount={countHiddenNotes(notes.hidden, step.preview, countFinishNotices(step.preview.rows, step.defaults, step.copyEdits))}
              onShowHidden={notes.restoreAll}
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={step.preview.rows.length === 0}
              >
                Import cards
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
      <ImportDiscardDialog open={discardOpen} onKeepEditing={() => setDiscardOpen(false)} onDiscard={confirmDiscard} />
    </Dialog>
  )
}
