'use client'

import { Check, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCardHoverPreview } from '@/components/CardHoverPreview'
import { StateButtonGroup } from './StateButtonGroup'
import { WishlistCheckbox } from './WishlistCheckbox'
import { AlternatePrintingSelect, PrintingIdentifier } from './AlternatePrintingSelect'
import type {
  ConflictPrintingRow,
  ConflictInstance,
  InstanceState,
  SlotState,
} from '@/types/import-reconciliation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConflictCardProps {
  printing: ConflictPrintingRow
  /** If true, hide deck tags (used inside the Decks tab where the deck is implied). */
  hideDeckTags?: boolean
  /** If true, show claimant deck names for already-claimed rows (Decks tab). */
  showClaimantDecks?: boolean
  /** Called when any instance state changes. */
  onInstanceStateChange: (instance: ConflictInstance, state: InstanceState) => void
  /** Called when an alternate printing is selected. */
  onAlternatePrintingChange?: (instance: ConflictInstance, printingId: string | null) => void
  /** Called when a wishlist checkbox toggles. */
  onWishlistChange?: (instance: ConflictInstance, checked: boolean) => void
  /** Whether interactions are disabled globally (e.g. mutation pending). */
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// Slot-state descriptor
// ---------------------------------------------------------------------------

/**
 * Non-selectable descriptor shown on a slot per its `slotState` (contract
 * §authoritative display state; spec §8.1, §13). `planned_claimed` (doc
 * states 3, 9) means every usable real copy is held by another deck — no
 * alternate is free. `planned_alt_available` (doc states 2, 8) means the
 * requested printing is gone, but the user can still switch to a free
 * alternate printing. These are different states with different next
 * actions and must not be conflated into one "already claimed" label.
 */
const SLOT_STATE_DESCRIPTOR: Partial<Record<SlotState, { label: string; icon: typeof AlertTriangle }>> = {
  planned_claimed: { label: 'Already claimed', icon: AlertTriangle },
  planned_alt_available: { label: 'Alternate printing available', icon: AlertTriangle },
}

function SlotStateDescriptor({ slotState }: { slotState: SlotState }) {
  const descriptor = SLOT_STATE_DESCRIPTOR[slotState]
  if (!descriptor) return null
  const Icon = descriptor.icon
  return (
    <span
      className="inline-flex items-center gap-1 text-[length:var(--fs-xs)] font-medium"
      style={{ color: 'var(--signal-warning)' }}
    >
      <Icon className="size-3" aria-hidden="true" />
      {descriptor.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Status chip
// ---------------------------------------------------------------------------

interface StatusChipProps {
  resolved: boolean
  slotState?: SlotState
}

function StatusChip({ resolved, slotState }: StatusChipProps) {
  const descriptor = slotState ? SLOT_STATE_DESCRIPTOR[slotState] : undefined
  if (descriptor) {
    const Icon = descriptor.icon
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-semibold"
        style={{ color: 'var(--signal-warning)', background: 'var(--signal-warning-bg)' }}
      >
        <Icon className="size-3" aria-hidden="true" />
        {descriptor.label}
      </span>
    )
  }

  if (resolved) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-semibold"
        style={{ color: 'var(--signal-success)', background: 'var(--signal-success-bg)' }}
      >
        <Check className="size-3" aria-hidden="true" />
        Resolved
      </span>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// Instance row
// ---------------------------------------------------------------------------

function InstanceRow({
  printing,
  instance,
  hideDeckTag,
  showClaimantDecks,
  onStateChange,
  onAlternatePrintingChange,
  onWishlistChange,
  disabled,
}: {
  printing: ConflictPrintingRow
  instance: ConflictInstance
  hideDeckTag?: boolean
  showClaimantDecks?: boolean
  onStateChange: (instance: ConflictInstance, state: InstanceState) => void
  onAlternatePrintingChange?: (instance: ConflictInstance, printingId: string | null) => void
  onWishlistChange?: (instance: ConflictInstance, checked: boolean) => void
  disabled?: boolean
}) {
  const options = printing.ownership === 'unowned'
    ? (['planned', 'proxy'] as const)
    : (['planned', 'sleeved', 'proxy'] as const)

  const claimantNames = showClaimantDecks
    ? instance.claimedBy.map((d) => d.deckName)
    : []

  return (
    <div className="flex min-h-[36px] flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {!hideDeckTag && (
          <span className="rounded-md bg-white/[0.05] px-2 py-1 text-[length:var(--fs-xs)] text-[var(--text-secondary)] whitespace-nowrap">
            {instance.deckName}
          </span>
        )}
        <SlotStateDescriptor slotState={instance.slotState} />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <StateButtonGroup
          value={instance.state}
          options={options}
          onChange={(state) => onStateChange(instance, state)}
          disabled={disabled}
          isOptionDisabled={(option) => option === 'sleeved' && !instance.canSleeve}
          disabledReason="All owned copies are already sleeved. Choose Proxy, Planned, or use an alternate printing."
          aria-label={`${printing.cardName} state for ${instance.deckName}`}
        />

        {printing.ownership === 'owned' && printing.alternatePrintings.length > 0 && (
          <AlternatePrintingSelect
            value={instance.selectedPrintingId}
            options={printing.alternatePrintings}
            onChange={(printingId) => onAlternatePrintingChange?.(instance, printingId)}
            disabled={disabled}
            aria-label={`Alternate printing for ${printing.cardName} in ${instance.deckName}`}
          />
        )}

        {printing.ownership === 'unowned' && onWishlistChange && (
          <WishlistCheckbox
            checked={instance.wishlisted}
            onChange={(checked) => onWishlistChange(instance, checked)}
            disabled={disabled}
            aria-label={`Add ${printing.cardName} from ${instance.deckName} to wishlist`}
          />
        )}
      </div>

      {showClaimantDecks && claimantNames.length > 0 && (
        <div className="w-full pl-0 text-[length:var(--fs-xs)] text-[var(--text-secondary)]">
          Claimed by: {claimantNames.join(', ')}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card container
// ---------------------------------------------------------------------------

export function ConflictCard({
  printing,
  hideDeckTags,
  showClaimantDecks,
  onInstanceStateChange,
  onAlternatePrintingChange,
  onWishlistChange,
  disabled,
}: ConflictCardProps) {
  const { triggerProps } = useCardHoverPreview({
    scryfallId: printing.printingId,
    cardName: printing.cardName,
  })

  const thumbUrl = printing.imageUriSmall

  const claimedDescriptorInstance = printing.instances.find(
    (i) => SLOT_STATE_DESCRIPTOR[i.slotState]
  )

  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]',
        printing.resolved && 'border-[rgba(29,158,117,0.25)] bg-[rgba(29,158,117,0.06)]'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="shrink-0" {...triggerProps}>
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt=""
              loading="lazy"
              className="h-11 w-8 cursor-help rounded object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div className="h-11 w-8 rounded bg-[var(--border-subtle)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[length:var(--fs-md)] font-medium text-foreground">
              {printing.cardName}
            </span>
            <StatusChip
              resolved={printing.resolved}
              slotState={showClaimantDecks ? undefined : claimedDescriptorInstance?.slotState}
            />
          </div>
          <PrintingIdentifier
            printingId={printing.printingId}
            cardName={printing.cardName}
            setCode={printing.setCode}
            collectorNumber={printing.collectorNumber}
            finish={printing.finish}
          />
        </div>
      </div>

      {/* Instance list */}
      <div className="flex flex-col gap-2 px-4 pb-3 pl-[60px]">
        {printing.instances.map((instance) => (
          <InstanceRow
            key={instance.claimId}
            printing={printing}
            instance={instance}
            hideDeckTag={hideDeckTags}
            showClaimantDecks={showClaimantDecks}
            onStateChange={onInstanceStateChange}
            onAlternatePrintingChange={onAlternatePrintingChange}
            onWishlistChange={onWishlistChange}
            disabled={disabled}
          />
        ))}
      </div>

      {/* Printing-level warning when all copies are allocated */}
      {printing.ownership === 'owned' &&
        printing.instances.some((i) => i.state !== 'sleeved' && !i.canSleeve) && (
          <div
            className="flex items-center gap-1.5 px-4 pb-3 pl-[60px] text-[length:var(--fs-xs)]"
            style={{ color: 'var(--signal-warning)' }}
          >
            <AlertTriangle className="size-3" aria-hidden="true" />
            All owned copies are already sleeved in other decks.
          </div>
        )}
    </div>
  )
}
