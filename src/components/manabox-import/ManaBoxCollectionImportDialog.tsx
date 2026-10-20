'use client'

import { useState, useCallback, useRef } from 'react'
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
import { ImportNotices, ImportValueNoticeLines } from './ImportNoticeLine'
import { ImportDefaultsBar } from './ImportDefaultsBar'
import { countFinishNotices } from '@/lib/import-copies'
import type { ImportCopyEdits, ImportDefaults } from '../../../docs/oracle/contracts/import-row-editing.types'
import { ImportCardList } from './ImportCardList'
import { ImportSummary } from './ImportSummary'
import { ImportProgress, DeckImportSpinner } from './ImportProgress'
import { ImportResult } from './ImportResult'
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
  const queryClient = useQueryClient()
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    setStep({ status: 'idle' })
    setError(null)
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) reset()
      onOpenChange(nextOpen)
    },
    [onOpenChange, reset]
  )

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setStep({ status: 'checking', file })

    try {
      const text = await file.text()
      const res = await fetch('/api/collection/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent: text, fileName: file.name }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Preview failed' }))
        throw new Error(body.error ?? 'Preview failed')
      }

      const preview: ManaBoxPreviewResponse = await res.json()
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
        defaults: INITIAL_DEFAULTS,
        copyEdits: {},
        openRowKeys: new Set(),
        filter: 'all',
        query: '',
        selectedIds: new Set(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStep({ status: 'failed', error: message, file, previousStatus: 'checking' })
    }
  }, [])

  const handleImport = useCallback(async () => {
    if (step.status !== 'review') return
    const rows = step.preview.rows
    if (rows.length === 0) return

    abortRef.current = new AbortController()
    setStep({ ...step, status: 'importing', cancellable: true, processed: 0, total: rows.length })

    try {
      const res = await fetch('/api/collection/import?mode=manabox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          csvContent: await step.file.text(),
          fileName: step.file.name,
          defaults: step.defaults,
          copyEdits: step.copyEdits,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Import failed' }))
        throw new Error(body.error ?? 'Import failed')
      }

      const summary: {
        inserted: number
        skipped: number
        removed: number
        sourceTag: string
        errors: string[]
        unmatched: ManaBoxPreviewResponse['unmatched']
        durationMs: number
      } = await res.json()

      setStep({
        status: 'done',
        summary: {
          inserted: summary.inserted,
          skipped: summary.skipped,
          basics: 0,
          proxies: computeTotals(rows, 'collection', false, step.defaults, step.copyEdits).proxies,
          unsleeved: 0,
          unmatched: summary.unmatched,
        },
        deckName: step.deckName,
        format: step.format,
      })

      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['collection-rollup'] })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setStep({ ...step, status: 'review' })
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      setStep({ status: 'failed', error: message, file: step.file, previousStatus: 'importing' })
    }
  }, [step, queryClient])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

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

  const title = step.status === 'checking' ? 'Importing…' : 'Import collection'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {step.status === 'idle' && (
            <DialogDescription>Import a ManaBox collection CSV.</DialogDescription>
          )}
          {step.status === 'review' && (
            <ImportFileChip
              fileName={step.preview.fileName}
              cardCount={step.preview.totalLines}
              onChange={reset}
            />
          )}
        </DialogHeader>

        {step.status === 'idle' && (
          <ManaBoxFilePicker
            accept=".csv,text/csv"
            extensions={['csv']}
            label="ManaBox .csv"
            onFile={handleFile}
            onError={setError}
            error={error}
          />
        )}

        {step.status === 'checking' && <DeckImportSpinner label="Checking…" />}

        {step.status === 'review' && (
          <div className="flex min-w-0 flex-col gap-3">
            <ImportNotices
              unmatched={step.preview.unmatched}
              tokens={step.preview.skippedTokens}
              source={step.source}
            />
            <ImportDefaultsBar defaults={step.defaults} onChange={setDefaults} />
            <ImportValueNoticeLines
              unrecognised={
                (step.preview.notices?.unrecognisedCondition ?? 0) +
                (step.preview.notices?.unrecognisedLanguage ?? 0) +
                (step.preview.notices?.unrecognisedFinish ?? 0)
              }
              {...countFinishNotices(step.preview.rows, step.defaults, step.copyEdits)}
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
          <ImportProgress
            processed={step.processed}
            total={step.total}
            cancellable={step.cancellable}
            onCancel={handleCancel}
          />
        )}

        {step.status === 'failed' && (
          <div className="flex flex-col gap-3">
            <p className="text-[length:var(--fs-sm)] text-destructive">{step.error}</p>
            <div className="flex justify-end gap-2">
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
            unmatched={step.summary.unmatched}
            onViewCollection={() => handleClose(false)}
            onDismiss={() => handleClose(false)}
          />
        )}

        {step.status === 'review' && (
          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
            <ImportSummary rows={step.preview.rows} kind="collection" genericBasics={step.genericBasics} defaults={step.defaults} copyEdits={step.copyEdits} />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={step.preview.rows.length === 0}
              >
                Add {step.preview.rows.reduce((sum, r) => sum + r.qty, 0)}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
