'use client'

import { useRef, useState, useCallback } from 'react'
import { Upload, ArrowDown, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EMPTY_FILE_MESSAGE, NEXT_STEPS, exportHelpText, wrongTypeMessage, type StageKind } from './import-copy'

export interface ManaBoxFilePickerProps {
  accept: string
  onFile: (file: File) => void
  onError?: (message: string) => void
  error?: string | null
  /** Format line under the button, e.g. "ManaBox .csv". */
  label: string
  extensions: string[]
  kind?: StageKind
  /** Show the two help cards under the drop zone. */
  showHelp?: boolean
}

/** Upload stage: a large drop zone, an error banner above it, and two static help cards. */
export function ManaBoxFilePicker({
  accept,
  onFile,
  onError,
  error,
  label,
  extensions,
  kind = 'collection',
  showHelp = false,
}: ManaBoxFilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = useCallback(
    (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!extensions.includes(ext)) return onError?.(wrongTypeMessage(extensions))
      if (file.size === 0) return onError?.(EMPTY_FILE_MESSAGE)
      onFile(file)
    },
    [extensions, onError, onFile]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      if (e.target) e.target.value = ''
    },
    [handleFile]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3 text-left">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-[var(--signal-critical)] bg-[var(--signal-critical-bg)] px-3 py-2 text-[length:var(--fs-sm)]"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--signal-critical)]" aria-hidden="true" />
          <span className="text-muted-foreground">{error}</span>
        </div>
      )}

      <div
        role="region"
        aria-label="File drop zone"
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragOver(false)
        }}
        data-drag-over={dragOver ? 'true' : 'false'}
        className={cn(
          'flex min-h-[200px] flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-dashed p-6 text-center transition-colors',
          dragOver
            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-bg)]'
            : 'border-[var(--border-default)] text-muted-foreground'
        )}
      >
        <span
          className={cn(
            'grid size-14 place-items-center rounded-full',
            dragOver ? 'bg-[var(--accent-primary-bg)] text-[var(--accent-primary)]' : 'bg-[var(--bg-surface-hover)] text-muted-foreground'
          )}
        >
          {dragOver ? <ArrowDown className="size-6" aria-hidden="true" /> : <Upload className="size-6" aria-hidden="true" />}
        </span>
        {dragOver ? (
          <>
            <span className="text-[length:var(--fs-lg)] font-medium text-foreground">Drop to import</span>
            <span className="text-[length:var(--fs-xs)]">
              Release to read the {kind === 'deck' ? 'deck' : 'file'}
            </span>
          </>
        ) : (
          <>
            <span className="text-[length:var(--fs-lg)] font-medium text-foreground">Drop your file here</span>
            <span className="text-[length:var(--fs-xs)]">or</span>
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              Choose file
            </Button>
            <span className="text-[length:var(--fs-xs)]">{label}</span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={handleChange}
          aria-label="Choose file"
        />
      </div>

      {showHelp && <ImportHelpCards kind={kind} />}
    </div>
  )
}

export function ImportHelpCards({ kind }: { kind: StageKind }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <section className="rounded-[10px] border border-[var(--border-subtle)] px-3 py-2.5">
        <h4 className="mb-1 text-[length:var(--fs-xs)] font-medium">Export your list</h4>
        <p className="text-[length:var(--fs-xs)] text-muted-foreground">{exportHelpText(kind)}</p>
      </section>
      <section className="rounded-[10px] border border-[var(--border-subtle)] px-3 py-2.5">
        <h4 className="mb-1 text-[length:var(--fs-xs)] font-medium">What happens next</h4>
        <ol className="list-decimal pl-4 text-[length:var(--fs-xs)] text-muted-foreground">
          {NEXT_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </div>
  )
}
