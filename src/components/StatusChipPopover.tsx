'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Download, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { CardSlotBadge } from '@/components/CardSlotBadge'
import { CardHoverPreview, useCardHoverPreview } from '@/components/CardHoverPreview'
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
  scryfallId?: string | null
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
  scryfallId,
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
  const [tier4Loading, setTier4Loading] = useState(false)
  const queryClient = useQueryClient()

  // Don't render popover for generic_land
  if (status === 'generic_land') {
    return <CardSlotBadge status={status} className={className} />
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="cursor-pointer" aria-label={`${cardName} status: ${status}`}>
          <CardSlotBadge status={status} className={className} />
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
              scryfallId={scryfallId ?? null}
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
        onConfirm={async () => {
          if (!tier4Confirm) return
          setTier4Loading(true)
          try {
            const res = await fetch('/api/allocation/claim-from-deck', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                deckCardsId,
                physicalCopyId: tier4Confirm.physicalCopyId,
              }),
            })
            if (!res.ok) {
              const err = await res.json().catch(() => ({}))
              throw new Error(err.error || 'Claim failed')
            }
            queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
            queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
            toast.success(`Claimed ${cardName}`)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to claim')
          } finally {
            setTier4Loading(false)
            setTier4Confirm(null)
          }
        }}
        onCancel={() => setTier4Confirm(null)}
        title="Claim from In Rotation deck?"
        description={
          tier4Confirm
            ? `This copy is currently in ${tier4Confirm.holderDeckName}. Removing it will make that deck incomplete. Continue?`
            : undefined
        }
        confirmLabel="Claim"
        isLoading={tier4Loading}
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
  scryfallId,
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
  scryfallId: string | null
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
        {/* Assigned card thumbnail + info */}
        <CopyRow
          scryfallPrintingId={scryfallId}
          cardName={cardName}
          setName={status === 'proxy' ? 'Proxy' : 'Original'}
          condition={null}
          storageLocationName={null}
          isFoil={false}
          isProxy={status === 'proxy'}
          primaryLabel="Reassign"
          subtitle="Assigned to this deck"
          onPrimary={() => {}}
          isPending={false}
          hideAction
        />

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
            className="text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground disabled:opacity-40"
            disabled={isPending}
            onClick={async () => {
              if (!physicalCopyId) return
              try {
                const res = await fetch(`/api/physical-copies/${physicalCopyId}/missing`, { method: 'POST' })
                if (!res.ok) throw new Error('Failed to mark as missing')
                queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
                queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
                toast.success(`Marked ${cardName} as missing`)
                onClose()
              } catch {
                toast.error('Failed to mark as missing')
              }
            }}
          >
            Mark as missing
          </button>
        </div>
      </div>
    )
  }

  // ─── Open ───────────────────────────────────────────────────────────
  if (status === 'available') {
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
          disabled={isPending || !data?.cardDefinitionId}
          onClick={() => {
            if (data?.cardDefinitionId) addProxyMutation.mutate(data.cardDefinitionId)
          }}
          className="mt-1 text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground self-start disabled:opacity-40"
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
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] px-3 py-2">
          <span className="text-[length:var(--fs-sm)] font-medium text-foreground">
            Claimed by ({holders.length})
          </span>
        </div>

        {/* Holder rows */}
        <div className="flex flex-col divide-y divide-[var(--border-default)]">
          {holders.map((holder) => {
            const thumbUrl = holder.scryfallPrintingId
              ? `https://cards.scryfall.io/small/front/${holder.scryfallPrintingId.charAt(0)}/${holder.scryfallPrintingId.charAt(1)}/${holder.scryfallPrintingId}.jpg`
              : null

            return (
              <div
                key={holder.physicalCopyId}
                className="flex items-center gap-2.5 px-3 py-2"
              >
                {/* Card thumbnail */}
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt=""
                    loading="lazy"
                    className="h-[40px] w-[29px] shrink-0 rounded object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="h-[40px] w-[29px] shrink-0 rounded bg-[rgba(255,255,255,0.05)]" />
                )}

                {/* Original/Proxy indicator dot */}
                <span
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={holder.isProxy
                    ? { border: '1.5px dashed var(--signal-success)' }
                    : { backgroundColor: 'var(--signal-success)' }
                  }
                  aria-label={holder.isProxy ? 'Proxy' : 'Original'}
                />

                {/* Deck name + printing info */}
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[length:var(--fs-sm)] font-medium text-foreground">
                    {holder.deckName}
                  </span>
                  <span className="block truncate text-[length:var(--fs-xs)] text-muted-foreground">
                    {holder.editionName || holder.setCode?.toUpperCase() || 'Unknown printing'}
                    {holder.condition && holder.condition !== 'near_mint' ? ` · ${holder.condition.replace('_', ' ')}` : ''}
                  </span>
                </div>

                {/* Claim button */}
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    if (holder.deckStatus === 'brewing') {
                      claimMutation.mutate(holder.physicalCopyId)
                    } else {
                      onTier4Confirm(holder.deckName, holder.physicalCopyId)
                    }
                  }}
                  disabled={isPending}
                  className="shrink-0"
                  style={{ color: 'var(--status-over)', borderColor: 'var(--status-over)' }}
                >
                  Claim
                </Button>
              </div>
            )
          })}
        </div>

        {/* Bottom actions */}
        <div className="flex items-center gap-3 border-t border-[var(--border-default)] px-3 py-2">
          <button
            type="button"
            disabled={isPending || !data?.cardDefinitionId}
            onClick={() => {
              if (data?.cardDefinitionId) addProxyMutation.mutate(data.cardDefinitionId)
            }}
            className="text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Add as proxy
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
          disabled={isPending || !data?.cardDefinitionId}
          onClick={() => {
            if (data?.cardDefinitionId) addProxyMutation.mutate(data.cardDefinitionId)
          }}
        >
          {addProxyMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : 'Add proxy'}
        </Button>
        <button
          type="button"
          disabled={isPending}
          onClick={async () => {
            try {
              const res = await fetch(`/api/decks/${deckId}/cards/${deckCardsId}`, { method: 'DELETE' })
              if (!res.ok) throw new Error('Remove failed')
              queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
              queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
              queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
              toast.success(`Removed ${cardName}`)
              onClose()
            } catch {
              toast.error('Failed to remove card')
            }
          }}
          className="text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground disabled:opacity-40"
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
  hideAction,
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
  hideAction?: boolean
}) {
  const { triggerProps, previewProps } = useCardHoverPreview({
    scryfallId: scryfallPrintingId,
    cardName,
    delay: 100,
  })

  const thumbUrl = scryfallPrintingId
    ? `https://cards.scryfall.io/small/front/${scryfallPrintingId.charAt(0)}/${scryfallPrintingId.charAt(1)}/${scryfallPrintingId}.jpg`
    : null

  return (
    <div className="group relative flex items-center gap-2 rounded-md border border-[var(--border-default)] px-2 py-1.5">
      {/* Thumbnail */}
      <div
        className="relative shrink-0"
        {...triggerProps}
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

        <CardHoverPreview {...previewProps} />
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
      {!hideAction && (
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
      )}

      {/* Proxy image actions — download & copy */}
      {isProxy && previewUrl && (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-foreground"
            title="Download image"
            onClick={async () => {
              try {
                const res = await fetch(previewUrl)
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${cardName.replace(/[^a-zA-Z0-9]/g, '_')}_proxy.jpg`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
                toast.success('Image downloaded')
              } catch {
                toast.error('Failed to download image')
              }
            }}
          >
            <Download className="size-3.5" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-foreground"
            title="Copy image"
            onClick={async () => {
              try {
                // Fetch the image and draw onto canvas as PNG (clipboard requires PNG)
                const res = await fetch(previewUrl)
                const blob = await res.blob()
                const bitmap = await createImageBitmap(blob)
                const canvas = document.createElement('canvas')
                canvas.width = bitmap.width
                canvas.height = bitmap.height
                const ctx = canvas.getContext('2d')!
                ctx.drawImage(bitmap, 0, 0)

                const pngBlob = await new Promise<Blob>((resolve, reject) => {
                  canvas.toBlob(
                    (b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))),
                    'image/png'
                  )
                })

                await navigator.clipboard.write([
                  new ClipboardItem({ 'image/png': pngBlob }),
                ])
                toast.success('Image copied to clipboard')
              } catch {
                // Fallback: copy the image URL as plain text
                try {
                  await navigator.clipboard.writeText(previewUrl)
                  toast.success('Image URL copied to clipboard')
                } catch {
                  toast.error('Failed to copy image')
                }
              }
            }}
          >
            <Copy className="size-3.5" />
          </button>
        </div>
      )}
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
