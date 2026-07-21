'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
        <p className="text-[length:var(--fs-md)] font-medium text-foreground">
          Delete &ldquo;{deckName}&rdquo;?
        </p>
        <p className="mt-1 text-[length:var(--fs-sm)] text-muted-foreground">
          This will permanently remove this deck.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isDeleting}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onConfirm}
          disabled={isDeleting}
        >
          {isDeleting && (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          )}
          {isDeleting ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </div>
  )
}
