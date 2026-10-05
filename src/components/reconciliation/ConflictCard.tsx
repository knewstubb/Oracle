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

const SCRYFALL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Falls back to Scryfall's image address when the card database has no image yet (e.g. brand-new sets). */
function thumbnailUrl(printing: ConflictPrintingRow): string | null {
  if (printing.imageUriSmall) return printing.imageUriSmall
  const id = printing.printingId
  if (!SCRYFALL_ID_PATTERN.test(id)) return null
  return `https://cards.scryfall.io/small/front/${id.charAt(0)}/${id.charAt(1)}/${id}.jpg`
}

interface ConflictCardProps {
  printing: ConflictPrintingRow
  /** When viewing one deck, its slot is listed first and other decks are marked as also wanting the card. */
  focusDeckId?: number
  /** If true, show which decks already hold a real copy. */
  showClaimantDecks?: boolean
  onInstanceStateChange: (instance: ConflictInstance, state: InstanceState) => void
  onAlternatePrintingChange?: (instance: ConflictInstance, printingId: string | null) => void
  onWishlistChange?: (instance: ConflictInstance, checked: boolean) => void
  disabled?: boolean
}

/**
 * Non-selectable descriptor shown on a slot per its `slotState`.
 * `planned_claimed` means every usable real copy is held by another deck;
 * `planned_alt_available` means the requested printing is gone but a free
 * alternate printing exists. They need different next actions, so they keep
 * separate labels.
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

function ResolvedChip() {
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

function InstanceRow({
  printing,
  instance,
  isOtherDeck,
  showClaimantDecks,
  onStateChange,
  onAlternatePrintingChange,
  onWishlistChange,
  disabled,
}: {
  printing: ConflictPrintingRow
  instance: ConflictInstance
  isOtherDeck: boolean
  showClaimantDecks?: boolean
  onStateChange: (instance: ConflictInstance, state: InstanceState) => void
  onAlternatePrintingChange?: (instance: ConflictInstance, printingId: string | null) => void
  onWishlistChange?: (instance: ConflictInstance, checked: boolean) => void
  disabled?: boolean
}) {
  const options = printing.ownership === 'unowned'
    ? (['planned', 'proxy'] as const)
    : (['planned', 'sleeved', 'proxy'] as const)

  const claimantNames = showClaimantDecks ? instance.claimedBy.map((d) => d.deckName) : []

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {isOtherDeck && (
          <span className="text-[length:var(--fs-xs)] text-[var(--text-secondary)]">Also wanted by</span>
        )}
        <span
          className={cn(
            'truncate rounded-md px-2 py-1 text-[length:var(--fs-xs)] font-medium',
            isOtherDeck
              ? 'border border-dashed border-[var(--border-default)] text-[var(--text-secondary)]'
              : 'bg-white/[0.06] text-foreground'
          )}
        >
          {instance.deckName}
        </span>
        <SlotStateDescriptor slotState={instance.slotState} />
        {claimantNames.length > 0 && (
          <span className="text-[length:var(--fs-xs)] text-[var(--text-secondary)]">
            Held by {claimantNames.join(', ')}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <StateButtonGroup
          value={instance.state}
          options={options}
          onChange={(state) => onStateChange(instance, state)}
          disabled={disabled}
          isOptionDisabled={(option) => option === 'sleeved' && !instance.canSleeve}
          disabledReason="All owned copies are already sleeved. Choose Proxy, Unsleeved, or use an alternate printing."
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
    </div>
  )
}

export function ConflictCard({
  printing,
  focusDeckId,
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

  const thumbnail = thumbnailUrl(printing)

  const instances = [...printing.instances].sort(
    (a, b) =>
      Number(focusDeckId !== undefined && b.deckId === focusDeckId) -
        Number(focusDeckId !== undefined && a.deckId === focusDeckId) ||
      a.claimId - b.claimId
  )

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border bg-[var(--bg-surface)] md:flex-row',
        printing.resolved
          ? 'border-[rgba(29,158,117,0.3)]'
          : 'border-[var(--border-default)]'
      )}
    >
      <div className="flex shrink-0 items-start gap-3 p-3 md:w-[260px] md:border-r md:border-[var(--border-subtle)]">
        <div className="shrink-0" {...triggerProps}>
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              className="h-[88px] w-[63px] cursor-default rounded-md object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div className="h-[88px] w-[63px] rounded-md bg-[var(--border-subtle)]" />
          )}
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[length:var(--fs-md)] font-medium leading-snug text-foreground">
            {printing.cardName}
          </p>
          <PrintingIdentifier
            printingId={printing.printingId}
            cardName={printing.cardName}
            setCode={printing.setCode}
            collectorNumber={printing.collectorNumber}
            finish={printing.finish}
          />
          {printing.resolved && (
            <div className="mt-1.5">
              <ResolvedChip />
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)] md:border-t-0">
        {instances.map((instance) => (
          <InstanceRow
            key={instance.claimId}
            printing={printing}
            instance={instance}
            isOtherDeck={focusDeckId !== undefined && instance.deckId !== focusDeckId}
            showClaimantDecks={showClaimantDecks}
            onStateChange={onInstanceStateChange}
            onAlternatePrintingChange={onAlternatePrintingChange}
            onWishlistChange={onWishlistChange}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  )
}
