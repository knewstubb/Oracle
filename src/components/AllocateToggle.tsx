'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { DeckStatus } from '@/lib/deck-status'

export interface AllocateToggleProps {
  deckId: number
  deckStatus: DeckStatus
  allocate: boolean
}

/**
 * Allocate toggle per spec Section 4.
 * - Brew: default off, overridable (toggle enabled)
 * - Boxed: default on, overridable (toggle enabled)
 * - Archived: forced off, toggle DISABLED
 *
 * Confirmation modal gates the OFF transition only.
 */
export function AllocateToggle({ deckId, deckStatus, allocate }: AllocateToggleProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [optimisticValue, setOptimisticValue] = useState(allocate)
  const queryClient = useQueryClient()

  // Sync optimistic state when prop changes (e.g. after refetch)
  useEffect(() => {
    setOptimisticValue(allocate)
  }, [allocate])

  const mutation = useMutation({
    mutationFn: async (newValue: boolean) => {
      const res = await fetch(`/api/decks/${deckId}/allocate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocate: newValue }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update allocate toggle')
      }
      return data
    },
    onSuccess: (_data, newValue) => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
      queryClient.invalidateQueries({ queryKey: ['shared-cards'] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['rollup-v2'] })
      toast.success(newValue ? 'Allocate turned on' : 'Allocate turned off')
    },
    onError: (err: Error) => {
      // Roll back optimistic update
      setOptimisticValue(allocate)
      toast.error(err.message)
    },
  })

  const isDisabled = deckStatus === 'graveyard' || mutation.isPending

  function handleToggle() {
    if (isDisabled) return

    if (optimisticValue) {
      // Turning OFF — requires confirmation (spec Section 4)
      setConfirmOpen(true)
    } else {
      // Turning ON — no confirmation needed, optimistic update immediately
      setOptimisticValue(true)
      mutation.mutate(true)
    }
  }

  function handleConfirmOff() {
    setConfirmOpen(false)
    // Optimistic update after confirmation
    setOptimisticValue(false)
    mutation.mutate(false)
  }

  const toggle = (
    <div className="flex items-center gap-2">
      <Switch
        checked={optimisticValue}
        onCheckedChange={handleToggle}
        disabled={isDisabled}
        size="sm"
        aria-label="Allocate cards against collection"
      />
      <span className="text-[length:var(--fs-sm)] text-muted-foreground">
        Allocate
      </span>
    </div>
  )

  return (
    <>
      {deckStatus === 'graveyard' ? (
        <Tooltip>
          <TooltipTrigger render={<div className="inline-flex" />}>
            {toggle}
          </TooltipTrigger>
          <TooltipContent>
            Archived decks cannot allocate cards. Un-archive to re-enable.
          </TooltipContent>
        </Tooltip>
      ) : (
        toggle
      )}

      {/* Confirmation modal — gates OFF transition only */}
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) setConfirmOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Turn off allocation?</DialogTitle>
            <DialogDescription>
              Turning this off means these cards will no longer be reserved against your collection.
              They may show as available to other decks even though they&apos;re still physically in
              this deck. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmOff}>
              Turn Off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
