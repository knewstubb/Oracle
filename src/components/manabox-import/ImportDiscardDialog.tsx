'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface ImportDiscardDialogProps {
  open: boolean
  onKeepEditing: () => void
  onDiscard: () => void
}

/** The app's own "Discard edits?" question, shown instead of a browser confirm box. */
export function ImportDiscardDialog({ open, onKeepEditing, onDiscard }: ImportDiscardDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (!next) {
          if (details?.reason === 'outside-press') return details.cancel?.()
          onKeepEditing()
        }
      }}
    >
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Discard edits?</DialogTitle>
          <DialogDescription>Your changes to this import will be lost.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onKeepEditing} autoFocus>
            Keep editing
          </Button>
          <Button type="button" variant="destructive" onClick={onDiscard}>
            Discard edits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
