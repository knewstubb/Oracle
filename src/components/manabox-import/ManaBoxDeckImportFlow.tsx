'use client'

import { useState, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ManaBoxFilePicker } from './ManaBoxFilePicker'
import { ImportFileChip } from './ImportFileChip'
import { DeckImportOptions } from './DeckImportOptions'
import { ImportNotices } from './ImportNoticeLine'
import { ImportCardList } from './ImportCardList'
import { ImportSummary } from './ImportSummary'
import { DeckImportSpinner } from './ImportProgress'
import { ImportResult } from './ImportResult'
import type { UiPreviewRow, ImportStep, RowFilter, ImportSource } from './types'
import { rowId, defaultSplit, computeTotals, buildCommitDeck } from './types'
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
  titleSlot?: React.ReactNode
}

export function ManaBoxDeckImportFlow({ onComplete, onCancel, titleSlot }: ManaBoxDeckImportFlowProps) {
  const [step, setStep] = useState<ImportStep>({ status: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const router = useRouter()
  const abortRef = useRef<AbortController | null>(null)

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

    try {
      const text = await file.text()
      const source = detectSource(file)
      const body =
        source === 'csv'
          ? { csvContent: text, fileName: file.name }
          : { textContent: text, fileName: file.name }

      const res = await fetch('/api/decks/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Preview failed' }))
        throw new Error(body.error ?? 'Preview failed')
      }

      const preview: ManaBoxPreviewResponse = await res.json()
      setStep({
        status: 'review',
        file,
        source,
        preview: {
          ...preview,
          rows: preview.rows.map((row) => ({
            ...row,
            id: rowId(row),
            choices: { split: defaultSplit(row.qty), foil: false },
          })),
        },
        deckName: file.name.replace(/\.(csv|txt)$/i, ''),
        format: 'commander',
        genericBasics: true,
        filter: 'all',
        query: '',
        selectedIds: new Set(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStep({ status: 'failed', error: message, file, previousStatus: 'checking' })
    }
  }, [])

  const basicsQty =
    step.status === 'review'
      ? step.preview.rows
          .filter((r) => r.isBasicLand)
          .reduce((sum, r) => sum + r.qty, 0)
      : 0

  const handleImport = useCallback(async () => {
    if (step.status !== 'review') return
    const rows = step.preview.rows
    if (rows.length === 0 || !step.deckName.trim()) return

    abortRef.current = new AbortController()
    setStep({ ...step, status: 'importing', cancellable: false, processed: 0, total: rows.length })

    try {
      const deck = buildCommitDeck(rows, 'deck', step.genericBasics)
      deck.name = step.deckName

      const res = await fetch('/api/decks/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          deck,
          name: step.deckName,
          format: step.format,
          convertBasicLandsToGeneric: step.genericBasics,
          rowSplits: undefined,
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

      const totals = computeTotals(rows, 'deck', step.genericBasics)
      const doneSummary = {
        inserted: totals.tracked,
        skipped: step.preview.skippedTokens.length,
        basics: totals.basics,
        proxies: totals.proxies,
        unsleeved: totals.unsleeved,
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
    }
  }, [step, queryClient, onComplete])

  const handleDone = useCallback(() => {
    if (step.status !== 'done') return
    const deckId = step.summary.deckId
    if (deckId) {
      if (step.format === 'commander') {
        router.push(`/decks/${deckId}?freshImport=true&pickCommander=true`)
      } else {
        router.push(`/decks/${deckId}?freshImport=true`)
      }
    }
  }, [step, router])

  const updateRow = useCallback((id: string, patch: Partial<UiPreviewRow['choices']>) => {
    setStep((prev) => {
      if (prev.status !== 'review') return prev
      return {
        ...prev,
        preview: {
          ...prev.preview,
          rows: prev.preview.rows.map((row) =>
            row.id === id ? { ...row, choices: { ...row.choices, ...patch } } : row
          ),
        },
      }
    })
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

  return (
    <div className="flex flex-col gap-3">
      {titleSlot}

      {step.status === 'idle' && (
        <ManaBoxFilePicker
          accept=".csv,.txt,text/csv,text/plain"
          extensions={['csv', 'txt']}
          label="ManaBox .csv or .txt"
          onFile={handleFile}
          onError={setError}
          error={error}
        />
      )}

      {step.status === 'checking' && <DeckImportSpinner label="Checking…" />}

      {step.status === 'review' && (
        <>
          <ImportFileChip
            fileName={step.preview.fileName}
            cardCount={step.preview.totalLines}
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
          />
          <ImportCardList
            rows={step.preview.rows}
            kind="deck"
            source={step.source}
            filter={step.filter}
            onFilterChange={setFilter}
            query={step.query}
            onQueryChange={setQuery}
            selectedIds={step.selectedIds}
            onSelectedIdsChange={setSelectedIds}
            onRowChange={updateRow}
          />
        </>
      )}

      {step.status === 'importing' && (
        <div className="flex flex-col items-center gap-3 py-6">
          <DeckImportSpinner label="Importing…" />
        </div>
      )}

      {step.status === 'failed' && (
        <div className="flex flex-col gap-3">
          <p className="text-[length:var(--fs-sm)] text-destructive">{step.error}</p>
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
          unmatched={step.summary.unmatched}
          deckId={step.summary.deckId}
          onOpenDeck={handleDone}
          onDismiss={() => {
            if (step.status === 'done' && step.summary.deckId) {
              router.push(`/decks/${step.summary.deckId}?freshImport=true${step.format === 'commander' ? '&pickCommander=true' : ''}`)
            }
          }}
        />
      )}

      {step.status === 'review' && (
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
          <ImportSummary rows={step.preview.rows} kind="deck" genericBasics={step.genericBasics} />
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={step.preview.rows.length === 0 || !step.deckName.trim()}
            >
              Import
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
