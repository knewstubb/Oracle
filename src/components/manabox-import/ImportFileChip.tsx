'use client'

import { FileText } from 'lucide-react'

export interface ImportFileChipProps {
  fileName: string
  cardCount: number
  checking?: boolean
  onChange: () => void
}

export function ImportFileChip({
  fileName,
  cardCount,
  checking,
  onChange,
}: ImportFileChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[length:var(--fs-sm)] text-muted-foreground">
      <FileText className="size-3.5" aria-hidden="true" />
      <span className="truncate">{fileName}</span>
      <span aria-hidden="true">·</span>
      {checking ? (
        <span role="status">Checking…</span>
      ) : (
        <span>
          {cardCount} {cardCount === 1 ? 'card' : 'cards'}
        </span>
      )}
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={onChange}
        className="underline underline-offset-2 hover:text-foreground"
      >
        Change
      </button>
    </span>
  )
}
