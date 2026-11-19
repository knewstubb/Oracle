'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { useDeleteDeck } from '@/hooks/useDeleteDeck'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DeleteDeckButtonProps {
  deckId: number
  deckName: string
}

interface DeleteDeckDialogProps extends DeleteDeckButtonProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The delete confirmation on its own, opened and closed by the caller (the deck "..." menu uses it). */
export function DeleteDeckDialog({ deckId, deckName, open, onOpenChange }: DeleteDeckDialogProps) {
  const router = useRouter()
  const deleteMutation = useDeleteDeck({ id: deckId, name: deckName })
  const setOpen = onOpenChange

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!deleteMutation.isPending) setOpen(isOpen) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{deckName}&rdquo;?</DialogTitle>
          <DialogDescription>
            This will permanently delete the deck and all its card slots. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              deleteMutation.mutate(undefined, {
                onSuccess: () => {
                  setOpen(false)
                  router.push('/')
                },
              })
            }
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending && (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            )}
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteDeckButton({ deckId, deckName }: DeleteDeckButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        <span className="sr-only">Delete deck</span>
      </Button>
      <DeleteDeckDialog deckId={deckId} deckName={deckName} open={open} onOpenChange={setOpen} />
    </>
  )
}
