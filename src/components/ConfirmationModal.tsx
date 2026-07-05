'use client'

import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConfirmationModalProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  title: string
  description?: string
  children?: React.ReactNode
  confirmLabel?: string
  isLoading?: boolean
}

export function ConfirmationModal({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  isLoading = false,
}: ConfirmationModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isLoading) onCancel()
      }}
    >
      <DialogContent
        role="alertdialog"
        aria-label={title}
        showCloseButton={!isLoading}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {children && <div className="text-sm">{children}</div>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {isLoading ? 'Applying...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
