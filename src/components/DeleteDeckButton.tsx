'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface DeleteDeckButtonProps {
  deckId: number
  deckName: string
}

export function DeleteDeckButton({ deckId, deckName }: DeleteDeckButtonProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${deckId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Delete failed' }))
        throw new Error(body.error ?? 'Failed to delete deck')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      toast.success(`Deleted "${deckName}"`)
      setOpen(false)
      router.push('/')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!deleteMutation.isPending) setOpen(isOpen) }}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          />
        }
      >
        <Trash2 className="size-4" aria-hidden="true" />
        <span className="sr-only">Delete deck</span>
      </DialogTrigger>

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
            onClick={() => deleteMutation.mutate()}
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
