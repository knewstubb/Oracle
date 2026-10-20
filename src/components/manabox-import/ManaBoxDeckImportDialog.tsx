'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ManaBoxDeckImportFlow } from './ManaBoxDeckImportFlow'

export interface ManaBoxDeckImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManaBoxDeckImportDialog({ open, onOpenChange }: ManaBoxDeckImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <ManaBoxDeckImportFlow
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
