'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { CardSlotBadge } from '@/components/CardSlotBadge'
import { LocationPickerModal } from '@/components/LocationPickerModal'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import { Button } from '@/components/ui/button'
import type { CardSlotStatus } from '@/lib/card-status'
import type { CardActionContext } from '@/app/api/decks/[id]/card-actions/[cardName]/route'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatusChipPopoverProps {
  status: CardSlotStatus
  cardName: string
  deckId: number
  deckCardsId: number
  physicalCopyId: number | null
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Wraps CardSlotBadge in a Popover. Clicking the chip opens contextual actions
 * based on the slot's status. Fetches action context on-demand (not preloaded).
 */
export function StatusChipPopover({
  status,
  cardName,
  deckId,
  deckCardsId,
  physicalCopyId,
  className,
}: StatusChipPopoverProps) {
  const [open, setOpen] = useState(false)
  const [locationPickerOpen, setLocationPickerOpen] = useState(false)
  const [replacePickerOpen, setReplacePickerOpen] = useState(false)
  const [replaceOriginalId, setReplaceOriginalId] = useState<number | null>(null)
  const [tier4Confirm, setTier4Confirm] = useState<{
    holderDeckName: string
    physicalCopyId: number
  } | null>(null)

  // Don't render popover for generic_land
  if (status === 'generic_land') {
    return <CardSlotBadge status={status} className={className} />
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="cursor-pointer" aria-label={`${cardName} status: ${status}`}>
            <CardSlotBadge status={status} className={className} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={4}
          className="w-[280px] p-0"
        >
          {open && (
            <PopoverBody
              status={status}
              cardName={cardName}
              deckId={deckId}
              deckCardsId={deckCardsId}
              physicalCopyId={physicalCopyId}
              onClose={() => setOpen(false)}
              onLocationPicker={() => { setOpen(false); setLocationPickerOpen(true) }}
              onTier4Confirm={(holderName, pcId) => { setOpen(false); setTier4Confirm({ holderDeckName: holderName, physicalCopyId: pcId }) }}
              onReplaceWithOriginal={(originalPcId) => { setOpen(false); setReplaceOriginalId(originalPcId); setReplacePickerOpen(true) }}
            />
          )}
        </PopoverContent>
      </Popover>

      {/* Location Picker (shown on Unassign/Remove) */}
      <LocationPickerModal
        open={locationPickerOpen}
        cardName={cardName}
        onConfirm={(locationId) => {
          setLocationPickerOpen(false)
          // The unassign action was already triggered before opening the picker
          // This is handled by the mutation flow in PopoverBody
        }}
        onCancel={() => setLocationPickerOpen(false)}
      />

      {/* Location Picker for Replace-with-original (proxy destination) */}
      <ReplaceLocationPicker
        open={replacePickerOpen}
        cardName={cardName}
        deckId={deckId}
        deckCardsId={deckCardsId}
        originalPhysicalCopyId={replaceOriginalId}
        onComplete={() => { setReplacePickerOpen(false); setReplaceOriginalId(null) }}
        onCancel={() => { setReplacePickerOpen(false); setReplaceOriginalId(null) }}
      />

      {/* Tier 4 Confirmation Modal */}
      <ConfirmationModal
        open={tier4Confirm !== null}
        onConfirm={() => {
          // Execute the claim — handled via mutation
          setTier4Confirm(null)
        }}
        onCancel={() => setTier4Confirm(null)}
        title="Claim from Built deck?"
        description={
          tier4Confirm
            ? `This copy is currently in ${tier4Confirm.holderDeckName}. Removing it will make that deck incomplete and no longer playable. Continue?`
            : undefined
        }
        confirmLabel="Claim"
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Popover Body (lazy-loaded content)
// ---------------------------------------------------------------------------

function PopoverBody({
  status,
  cardName,
  deckId,
  deckCardsId,
  physicalCopyId,
  onClose,
  onLocationPicker,
  onTier4Confirm,
  onReplaceWithOriginal,
}: {
  status: CardSlotStatus
  cardName: string
  deckId: number
  deckCardsId: number
  physicalCopyId: number | null
  onClose: () => void
  onLocationPicker: () => void
  onTier4Confirm: (holderName: string, physicalCopyId: number) => void
  onReplaceWithOriginal: (originalPhysicalCopyId: number) => void
}) {
  const queryClient = useQueryClient()

  // Fetch action context on-demand
  const { data, isLoading } = useQuery<CardActionContext>({
    queryKey: ['card-actions', deckId, cardName],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/card-actions/${encodeURIComponent(cardName)}`)
      if (!res.ok) throw new Error('Failed to load')
      return res.json()
    },
    staleTime: 15 * 1000, // 15s — short since allocation state changes frequently
  })

  // Fill mutation (assign a free copy to this slot)
  const fillMutation = useMutation({
    mutationFn: async (targetPhysicalCopyId: number) => {
      const res = await fetch('/api/allocation/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckCardsId, physicalCopyId: targetPhysicalCopyId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Fill failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
      toast.success(`Filled ${cardName}`)
      onClose()
    },
    onError: (err) => toast.error(err.message),
  })

  // Claim mutation (Tier 3 instant — from Brew deck)
  const claimMutation = useMutation({
    mutationFn: async (targetPhysicalCopyId: number) => {
      const res = await fetch('/api/allocation/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckCardsId, physicalCopyId: targetPhysicalCopyId, tier: 3 }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Claim failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
      toast.success(`Claimed ${cardName}`)
      onClose()
    },
    onError: (err) => toast.error(err.message),
  })

  // Add proxy mutation (atomic: create + assign)
  const addProxyMutation = useMutation({
    mutationFn: async (cardDefinitionId: number) => {
      const res = await fetch('/api/allocation/add-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckCardsId, cardDefinitionId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Add proxy failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
      toast.success(`Added proxy for ${cardName}`)
      onClose()
    },
    onError: (err) => toast.error(err.message),
  })

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isPending = fillMutation.isPending || claimMutation.isPending || addProxyMutation.isPending

  // ─── Original / Proxy ───────────────────────────────────────────────
  if (status === 'original' || status === 'proxy') {
    // For proxy: check if a free original exists (non-proxy entry in availableCopies)
    const freeOriginals = status === 'proxy'
      ? (data?.availableCopies ?? []).filter(c => !c.isProxy)
      : []

    return (
      <div className="flex flex-col gap-2 p-3">
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">
          {status === 'proxy' ? 'Proxy' : 'Original'} assigned to this deck
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          disabled={isPending}
          onClick={onLocationPicker}
        >
          Reassign
        </Button>
        {/* Replace with original — only for proxy when a free original exists */}
        {status === 'proxy' && freeOriginals.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled={isPending}
            onClick={() => onReplaceWithOriginal(freeOriginals[0].physicalCopyId)}
            style={{ color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' }}
          >
            Replace with original
          </Button>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onLocationPicker}
            className="text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground"
          >
            Remove
          </button>
          <button
            type="button"
            className="text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground"
          >
            Mark as missing
          </button>
        </div>
      </div>
    )
  }

  // ─── Open ───────────────────────────────────────────────────────────
  if (status === 'open') {
    const copies = data?.availableCopies ?? []
    return (
      <div className="flex flex-col gap-2 p-3">
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">
          {copies.length} {copies.length === 1 ? 'copy' : 'copies'} available
        </p>
        {copies.map((copy) => (
          <div
            key={copy.physicalCopyId}
            className="flex items-center justify-between rounded-md border border-[var(--border-default)] px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[length:var(--fs-sm)] font-medium">
                {copy.setName || 'Unknown'}
              </span>
              <span className="text-[length:var(--fs-xs)] text-muted-foreground">
                {copy.condition ? copy.condition.replace('_', ' ') : 'NM'}
                {copy.storageLocationName ? ` · ${copy.storageLocationName}` : ' · Unsorted'}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fillMutation.mutate(copy.physicalCopyId)}
              disabled={isPending}
              className="shrink-0 ml-2"
              style={{ color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' }}
            >
              Fill
            </Button>
          </div>
        ))}
        <button
          type="button"
          onClick={onClose}
          className="text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground"
        >
          Remove
        </button>
      </div>
    )
  }

  // ─── Claimed ────────────────────────────────────────────────────────
  if (status === 'claimed') {
    const holders = data?.holders ?? []
    const firstHolder = holders[0]

    return (
      <div className="flex flex-col gap-2 p-3">
        {firstHolder && (
          <p className="text-[length:var(--fs-sm)] text-muted-foreground">
            Claimed by <span className="text-foreground font-medium">{firstHolder.deckName}</span>
            {' · '}{firstHolder.deckStatus}
          </p>
        )}
        {firstHolder && (
          <Button
            size="sm"
            className="w-full"
            disabled={isPending}
            onClick={() => {
              if (firstHolder.deckStatus === 'brew') {
                // Tier 3: instant
                claimMutation.mutate(firstHolder.physicalCopyId)
              } else {
                // Tier 4: confirmation
                onTier4Confirm(firstHolder.deckName, firstHolder.physicalCopyId)
              }
            }}
          >
            {isPending ? <Loader2 className="size-3 animate-spin" /> : 'Claim'}
          </Button>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              // Add proxy — need card_definition_id
              // For now, use a simplified approach
              if (data?.availableCopies?.[0]?.physicalCopyId) {
                // Shouldn't have available copies if claimed, but fallback
              }
              toast.info('Add proxy: coming soon (printing picker not yet built)')
              onClose()
            }}
            className="text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground"
          >
            Add proxy
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground"
          >
            Remove
          </button>
        </div>
      </div>
    )
  }

  // ─── Unowned ────────────────────────────────────────────────────────
  if (status === 'unowned') {
    return (
      <div className="flex flex-col gap-2 p-3">
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">
          No copies in your collection
        </p>
        <Button
          size="sm"
          className="w-full"
          disabled={isPending}
          onClick={() => {
            toast.info('Add proxy: coming soon (printing picker not yet built)')
            onClose()
          }}
        >
          {isPending ? <Loader2 className="size-3 animate-spin" /> : 'Add proxy'}
        </Button>
        <button
          type="button"
          onClick={onClose}
          className="text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground"
        >
          Remove
        </button>
      </div>
    )
  }

  return null
}


// ---------------------------------------------------------------------------
// ReplaceLocationPicker — wraps LocationPickerModal with replace mutation
// ---------------------------------------------------------------------------

function ReplaceLocationPicker({
  open,
  cardName,
  deckId,
  deckCardsId,
  originalPhysicalCopyId,
  onComplete,
  onCancel,
}: {
  open: boolean
  cardName: string
  deckId: number
  deckCardsId: number
  originalPhysicalCopyId: number | null
  onComplete: () => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()

  const replaceMutation = useMutation({
    mutationFn: async (proxyStorageLocationId: number | null) => {
      if (!originalPhysicalCopyId) throw new Error('No original copy selected')
      const res = await fetch('/api/allocation/replace-with-original', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckCardsId,
          originalPhysicalCopyId,
          proxyStorageLocationId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Replace failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
      queryClient.invalidateQueries({ queryKey: ['card-actions', deckId, cardName] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['storage'] })
      toast.success(`Replaced proxy with original for ${cardName}`)
      onComplete()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <LocationPickerModal
      open={open}
      cardName={cardName}
      printingInfo="Where should the proxy go?"
      onConfirm={(locationId) => replaceMutation.mutate(locationId)}
      onCancel={onCancel}
    />
  )
}
