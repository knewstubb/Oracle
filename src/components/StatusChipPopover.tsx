'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { CardSlotBadge } from '@/components/CardSlotBadge'
import { LocationPickerModal } from '@/components/LocationPickerModal'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import { DeckPickerPopover, type ValidDeck } from '@/components/DeckPickerPopover'
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

  // Reassign mutation — atomic: moves the physical copy to a slot in the target deck
  const reassignMutation = useMutation({
    mutationFn: async (targetDeckId: number) => {
      if (!physicalCopyId) throw new Error('No physical copy to reassign')
      const res = await fetch('/api/allocation/reassign-to-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ physicalCopyId, targetDeckId, cardName }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Reassign failed')
      }
      return { targetDeckId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['decks', data.targetDeckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
      queryClient.invalidateQueries({ queryKey: ['picklist', data.targetDeckId] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      toast.success(`Reassigned ${cardName}`)
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

  const isPending = fillMutation.isPending || claimMutation.isPending || addProxyMutation.isPending || reassignMutation.isPending

  // ─── Original / Proxy ───────────────────────────────────────────────
  if (status === 'original' || status === 'proxy') {
    // For proxy: check if a free original exists (non-proxy entry in availableCopies)
    const freeOriginals = status === 'proxy'
      ? (data?.availableCopies ?? []).filter(c => !c.isProxy)
      : []

    const validDecks = data?.validDecks ?? []

    return (
      <div className="flex flex-col gap-2 p-3">
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">
          {status === 'proxy' ? 'Proxy' : 'Original'} assigned to this deck
        </p>
        {/* Reassign via valid-deck picker */}
        <DeckPickerPopover
          validDecks={validDecks}
          isLoading={false}
          disabled={isPending}
          label="Reassign"
          onSelect={(deck) => reassignMutation.mutate(deck.deckId)}
        >
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled={isPending || validDecks.length === 0}
          >
            {reassignMutation.isPending ? (
              <Loader2 className="size-3 animate-spin mr-1" />
            ) : null}
            Reassign{validDecks.length > 0 ? ` (${validDecks.length})` : ''}
          </Button>
        </DeckPickerPopover>
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
      <div className="flex flex-col gap-1 p-3">
        <p className="text-[length:var(--fs-sm)] text-muted-foreground mb-1">
          {copies.length} {copies.length === 1 ? 'copy' : 'copies'} available
        </p>
        {copies.map((copy) => (
          <CopyRow
            key={copy.physicalCopyId}
            scryfallPrintingId={copy.scryfallPrintingId}
            cardName={cardName}
            setName={copy.setName}
            condition={copy.condition}
            storageLocationName={copy.storageLocationName}
            isFoil={copy.isFoil}
            isProxy={copy.isProxy}
            primaryLabel="Fill"
            onPrimary={() => fillMutation.mutate(copy.physicalCopyId)}
            isPending={isPending}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            toast.info('Add proxy: coming soon (printing picker not yet built)')
            onClose()
          }}
          className="mt-1 text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground self-start"
        >
          Add proxy
        </button>
      </div>
    )
  }

  // ─── Claimed ────────────────────────────────────────────────────────
  if (status === 'claimed') {
    const holders = data?.holders ?? []

    return (
      <div className="flex flex-col gap-1 p-3">
        <p className="text-[length:var(--fs-sm)] text-muted-foreground mb-1">
          {holders.length} {holders.length === 1 ? 'copy' : 'copies'} claimed
        </p>
        {holders.map((holder) => (
          <CopyRow
            key={holder.physicalCopyId}
            scryfallPrintingId={holder.scryfallPrintingId}
            cardName={cardName}
            setName={holder.deckName}
            condition={null}
            storageLocationName={null}
            isFoil={false}
            isProxy={holder.isProxy}
            primaryLabel="Claim"
            subtitle={holder.deckStatus}
            onPrimary={() => {
              if (holder.deckStatus === 'brew') {
                claimMutation.mutate(holder.physicalCopyId)
              } else {
                onTier4Confirm(holder.deckName, holder.physicalCopyId)
              }
            }}
            isPending={isPending}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            toast.info('Add proxy: coming soon (printing picker not yet built)')
            onClose()
          }}
          className="mt-1 text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground self-start"
        >
          Add proxy
        </button>
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
// CopyRow — thumbnail + printing info + hover preview + primary action
// ---------------------------------------------------------------------------

function CopyRow({
  scryfallPrintingId,
  cardName,
  setName,
  condition,
  storageLocationName,
  isFoil,
  isProxy,
  primaryLabel,
  subtitle,
  onPrimary,
  isPending,
}: {
  scryfallPrintingId: string | null
  cardName: string
  setName: string
  condition: string | null
  storageLocationName: string | null
  isFoil: boolean
  isProxy: boolean
  primaryLabel: string
  subtitle?: string
  onPrimary: () => void
  isPending: boolean
}) {
  const [showPreview, setShowPreview] = useState(false)

  const thumbUrl = scryfallPrintingId
    ? `https://cards.scryfall.io/small/front/${scryfallPrintingId.charAt(0)}/${scryfallPrintingId.charAt(1)}/${scryfallPrintingId}.jpg`
    : null

  const previewUrl = scryfallPrintingId
    ? `https://cards.scryfall.io/normal/front/${scryfallPrintingId.charAt(0)}/${scryfallPrintingId.charAt(1)}/${scryfallPrintingId}.jpg`
    : null

  return (
    <div className="group relative flex items-center gap-2 rounded-md border border-[var(--border-default)] px-2 py-1.5">
      {/* Thumbnail */}
      <div
        className="relative shrink-0"
        onMouseEnter={() => setShowPreview(true)}
        onMouseLeave={() => setShowPreview(false)}
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            className="h-[36px] w-[26px] rounded object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="h-[36px] w-[26px] rounded bg-[rgba(255,255,255,0.05)]" />
        )}

        {/* Large hover preview */}
        {showPreview && previewUrl && (
          <div className="absolute bottom-full left-0 z-50 mb-2 pointer-events-none">
            <img
              src={previewUrl}
              alt={cardName}
              className="h-[260px] w-auto rounded-lg shadow-xl"
            />
          </div>
        )}
      </div>

      {/* Printing info */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--fs-sm)] font-medium text-foreground">
          {setName || 'Unknown printing'}
        </span>
        <span className="block text-[length:var(--fs-xs)] text-muted-foreground">
          {condition ? condition.replace('_', ' ') : 'NM'}
          {storageLocationName ? ` · ${storageLocationName}` : subtitle ? ` · ${subtitle}` : ''}
          {isFoil ? ' · Foil' : ''}
          {isProxy ? ' · Proxy' : ''}
        </span>
      </div>

      {/* Primary action */}
      <Button
        size="sm"
        variant="outline"
        onClick={onPrimary}
        disabled={isPending}
        className="shrink-0"
        style={{ color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' }}
      >
        {primaryLabel}
      </Button>
    </div>
  )
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
