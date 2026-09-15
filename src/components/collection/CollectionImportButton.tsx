'use client'

import { useCallback, useRef, useState } from 'react'
import { Upload, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  chunkedImport,
  type ChunkProgress,
  type ChunkedImportSummary,
} from '@/lib/chunked-import-client'
import { useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImportState =
  | { status: 'idle' }
  | { status: 'confirming'; csvContent: string; fileName: string }
  | { status: 'importing'; progress: ChunkProgress }
  | { status: 'complete'; summary: ChunkedImportSummary }
  | { status: 'error'; message: string }

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * CollectionImportButton — Client-side chunked CSV collection import.
 *
 * Provides:
 * - File picker for CSV upload
 * - Client-side parsing and chunked upload (~500 rows per request)
 * - Real-time progress bar during import
 * - Per-chunk error handling (shows which chunks failed)
 * - Cancellation support
 * - Auto-invalidates collection queries on success
 *
 * Validates: Requirements 6.3 (Background_Job_Pattern), 6.5 (CSV import strategy)
 */
export function CollectionImportButton() {
  const [state, setState] = useState<ImportState>({ status: 'idle' })
  const abortControllerRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const queryClient = useQueryClient()

  const startImport = useCallback(async (csvContent: string) => {
    const controller = new AbortController()
    abortControllerRef.current = controller

    setState({
      status: 'importing',
      progress: {
        currentChunk: 0,
        totalChunks: 1,
        rowsProcessed: 0,
        totalRows: 0,
        chunkSuccess: true,
        phase: 'validating',
      },
    })

    try {
      const summary = await chunkedImport({
        csvContent,
        signal: controller.signal,
        onProgress: (progress) => {
          setState({ status: 'importing', progress })
        },
      })

      setState({ status: 'complete', summary })

      // Invalidate collection queries so the UI refreshes
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['collection-rollup'] })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setState({ status: 'error', message })
    } finally {
      abortControllerRef.current = null
    }
  }, [queryClient])

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    const csvContent = await file.text()
    setState({ status: 'confirming', csvContent, fileName: file.name })
  }, [])

  const handleConfirmImport = useCallback(() => {
    if (state.status !== 'confirming') return
    void startImport(state.csvContent)
  }, [startImport, state])

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const handleDismiss = useCallback(() => {
    setState({ status: 'idle' })
  }, [])

  const handleTriggerPicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return (
    <div className="flex items-center gap-2">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Select CSV file for import"
      />

      {/* Main button / progress display */}
      {state.status === 'idle' && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleTriggerPicker}
          className="gap-1.5 text-[length:var(--fs-sm)]"
        >
          <Upload className="size-3.5" />
          Import CSV
        </Button>
      )}

      {state.status === 'confirming' && (
        <ImportConfirmation
          fileName={state.fileName}
          onConfirm={handleConfirmImport}
          onCancel={handleDismiss}
        />
      )}

      {state.status === 'importing' && (
        <ImportProgress progress={state.progress} onCancel={handleCancel} />
      )}

      {state.status === 'complete' && (
        <ImportComplete summary={state.summary} onDismiss={handleDismiss} />
      )}

      {state.status === 'error' && (
        <ImportError message={state.message} onDismiss={handleDismiss} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

function ImportConfirmation({
  fileName,
  onConfirm,
  onCancel,
}: {
  fileName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="flex max-w-[360px] flex-col gap-2 rounded-md border border-amber-400/30 bg-amber-400/5 p-3"
      role="alertdialog"
      aria-labelledby="collection-replace-warning"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-amber-400" aria-hidden="true" />
        <div className="min-w-0">
          <p id="collection-replace-warning" className="text-[length:var(--fs-sm)] font-medium text-amber-200">
            Replace your entire collection?
          </p>
          <p className="mt-1 text-[length:var(--fs-xs)] leading-relaxed text-white/60">
            {fileName} will replace the current collection. Deck allocations will be cleared and need Built-deck reconciliation afterward. Storage locations, notes, purchase prices, and missing flags will not carry over.
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onConfirm}>
          Replace collection
        </Button>
      </div>
    </div>
  )
}

function ImportProgress({
  progress,
  onCancel,
}: {
  progress: ChunkProgress
  onCancel: () => void
}) {
  const progressTotal = progress.totalCards ?? progress.totalRows
  const progressProcessed = progress.cardsProcessed ?? progress.rowsProcessed
  const percent =
    progressTotal > 0
      ? Math.round((progressProcessed / progressTotal) * 100)
      : 0
  const phaseLabel = progress.phase === 'replacing'
    ? 'Replacing collection'
    : progress.phase === 'preparing'
      ? 'Preparing cards'
      : progress.phase === 'resolving'
        ? 'Resolving cards'
        : 'Validating collection'

  return (
    <div className="flex items-center gap-2.5">
      <Loader2
        className="size-3.5 animate-spin"
        style={{ color: '#1D9E75' }}
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] text-white/60">
          {phaseLabel} · {progressProcessed.toLocaleString()} / {progressTotal.toLocaleString()}
        </span>
        {/* Progress bar */}
        <div
          className="h-1.5 w-28 overflow-hidden rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${percent}%`,
              background: '#1D9E75',
            }}
          />
        </div>
        <span className="text-[length:var(--fs-xs)] text-white/40">
          {progress.cardsProcessed !== undefined
            ? `${progress.cardsProcessed.toLocaleString()} / ${progress.totalCards?.toLocaleString() ?? '—'} cards`
            : `${progress.rowsProcessed.toLocaleString()} / ${progress.totalRows.toLocaleString()} rows`}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onCancel}
        className="text-white/30 hover:bg-white/5 hover:text-white/60"
        aria-label="Cancel import"
        title="Cancel import"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}

function ImportComplete({
  summary,
  onDismiss,
}: {
  summary: ChunkedImportSummary
  onDismiss: () => void
}) {
  const hasErrors = summary.chunksFailed > 0

  return (
    <div className="flex items-center gap-2">
      {hasErrors ? (
        <AlertCircle className="size-3.5 text-amber-400" />
      ) : (
        <CheckCircle2 className="size-3.5 text-[#1D9E75]" />
      )}
      <span
        className={cn(
          'text-[11px]',
          hasErrors ? 'text-amber-400' : 'text-[#1D9E75]'
        )}
      >
        {summary.totalImported.toLocaleString()} rows imported
        {hasErrors && ` (${summary.chunksFailed} chunk${summary.chunksFailed > 1 ? 's' : ''} failed)`}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onDismiss}
        className="text-white/30 hover:bg-white/5 hover:text-white/60"
        aria-label="Dismiss"
      >
        <X className="size-3" />
      </Button>
    </div>
  )
}

function ImportError({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <AlertCircle className="size-3.5 text-red-400" />
      <span className="max-w-[200px] truncate text-[11px] text-red-400" title={message}>
        {message}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onDismiss}
        className="text-white/30 hover:bg-white/5 hover:text-white/60"
        aria-label="Dismiss error"
      >
        <X className="size-3" />
      </Button>
    </div>
  )
}
