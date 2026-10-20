'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { IMPORT_MODAL_CLASS } from './import-labels'
import { ManaBoxDeckImportFlow } from './ManaBoxDeckImportFlow'

export interface ManaBoxDeckImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManaBoxDeckImportDialog({ open, onOpenChange }: ManaBoxDeckImportDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        // Clicking outside never closes the import.
        if (!next && details?.reason === 'outside-press') return details.cancel?.()
        onOpenChange(next)
      }}
    >
      <DialogContent className={IMPORT_MODAL_CLASS}>
        <ManaBoxDeckImportFlow
          fill
          onComplete={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
          titleSlot={
            <DialogHeader>
              <DialogTitle>Import deck</DialogTitle>
              <DialogDescription>Import a ManaBox deck CSV or text file.</DialogDescription>
            </DialogHeader>
          }
        />
      </DialogContent>
    </Dialog>
  )
}
