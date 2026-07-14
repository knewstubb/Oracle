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

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Reset file input so same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    // Read file content
    const csvContent = await file.text()

    // Create abort controller for cancellation
    const controller = new AbortController()
    abortControllerRef.current = controller

    setState({
      status: 'importing',
      progress: {
        currentChunk: 0,
        totalChunks: 0,
        rowsProcessed: 0,
        totalRows: 0,
        chunkSuccess: true,
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
      queryClient.invalidateQueries({ queryKey: ['shared-cards'] })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setState({ status: 'error', message })
    } finally {
      abortControllerRef.current = null
    }
  }, [queryClient])

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

function ImportProgress({
  progress,
  onCancel,
}: {
  progress: ChunkProgress
  onCancel: () => void
}) {
  const percent =
    progress.totalRows > 0
      ? Math.round((progress.rowsProcessed / progress.totalRows) * 100)
      : 0

  return (
    <div className="flex items-center gap-2.5">
      <Loader2
        className="size-3.5 animate-spin"
        style={{ color: '#1D9E75' }}
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] text-white/60">
          Importing... chunk {progress.currentChunk + 1}/{progress.totalChunks}
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
          {progress.rowsProcessed.toLocaleString()} / {progress.totalRows.toLocaleString()} rows
        </span>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="rounded p-1 text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
        aria-label="Cancel import"
        title="Cancel import"
      >
        <X className="size-3.5" />
      </button>
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
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-1 text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
        aria-label="Dismiss"
      >
        <X className="size-3" />
      </button>
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
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-1 text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
        aria-label="Dismiss error"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}
