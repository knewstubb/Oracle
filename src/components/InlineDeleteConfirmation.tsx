'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface InlineDeleteConfirmationProps {
  deckName: string
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
}

export function InlineDeleteConfirmation({
  deckName,
  onConfirm,
  onCancel,
  isDeleting,
}: InlineDeleteConfirmationProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 p-4 text-center"
      role="alertdialog"
      aria-label={`Confirm deletion of ${deckName}`}
    >
      <div>
        <p className="text-sm font-medium text-foreground">
          Delete &ldquo;{deckName}&rdquo;?
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          This will permanently remove the draft.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isDeleting}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            'bg-[rgba(255,255,255,0.1)] text-muted-foreground border border-border',
            'hover:bg-muted hover:text-foreground',
            'disabled:pointer-events-none disabled:opacity-50'
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isDeleting}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            'bg-[rgba(226,75,74,0.15)] text-[#E24B4A] border border-[rgba(226,75,74,0.3)]',
            'hover:bg-[rgba(226,75,74,0.25)]',
            'disabled:pointer-events-none disabled:opacity-50'
          )}
        >
          {isDeleting && (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          )}
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
