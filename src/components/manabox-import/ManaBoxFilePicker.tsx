'use client'

import { useRef, useState, useCallback } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ManaBoxFilePickerProps {
  accept: string
  onFile: (file: File) => void
  onError?: (message: string) => void
  error?: string | null
  label: string
  extensions: string[]
}

export function ManaBoxFilePicker({
  accept,
  onFile,
  onError,
  error,
  label,
  extensions,
}: ManaBoxFilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const validate = useCallback(
    (file: File): boolean => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!extensions.includes(ext)) {
        onError?.(`Not a ManaBox ${extensions.map((e) => `.${e}`).join(' or ')} file`)
        return false
      }
      return true
    },
    [extensions, onError]
  )

  const handleFile = useCallback(
    (file: File) => {
      if (validate(file)) {
        onFile(file)
      }
    },
    [onFile, validate]
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

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  return (
    <div className="flex w-full flex-col gap-2">
      <div
        role="region"
        aria-label="File drop zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'flex flex-col items-center gap-2 rounded-xl border-[1.5px] border-dashed px-4 py-6 text-center transition-colors',
          dragOver
            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-bg)]'
            : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-muted-foreground'
        )}
      >
        <Upload className="size-5" aria-hidden="true" />
        <span className="text-[length:var(--fs-sm)]">{label}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={handleChange}
          aria-label="Choose file"
        />
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-[var(--signal-critical)] bg-[var(--signal-critical-bg)] px-3 py-2 text-[length:var(--fs-sm)] text-[var(--signal-critical)]"
        >
          <span aria-hidden="true">!</span>
          {error}
        </div>
      )}
    </div>
  )
}
