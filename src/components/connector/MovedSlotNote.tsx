'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { SlotBadge } from '@/components/vocabulary/SlotBadge'
import { connectorKeys, fetchMovedSlots, type MovedSlot } from './api'
import { formatDate, formatClock } from './format'

/** One request per deck, shared by every row. A failure shows nothing: the line is a quiet note, not a state. */
export function useMovedSlots(deckId: number): Map<number, MovedSlot> {
  const { data } = useQuery({
    queryKey: connectorKeys.moved(deckId),
    queryFn: () => fetchMovedSlots(deckId),
    retry: false,
    staleTime: 60_000,
  })
  return new Map((data ?? []).map((m) => [m.slot_id, m]))
}

/** The moved-card state under the slot: Unsleeved, Unavailable, "In {deck}", Open link, one history line. */
export function MovedSlotNote({ slot }: { slot: MovedSlot }) {
  return (
    <div className="flex flex-col gap-1 px-3 pb-2 pl-9" data-testid="moved-slot-note">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SlotBadge state="unavailable" reason={`In ${slot.moved_to_deck_name}`} />
        {slot.moved_to_deck_id != null && (
          <Link
            href={`/decks/${slot.moved_to_deck_id}`}
            className="inline-flex min-h-[44px] items-center text-[length:var(--fs-xs)] text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
          >
            Open {slot.moved_to_deck_name}
          </Link>
        )}
      </div>
      <p className="text-[length:var(--fs-xs)] text-[var(--text-secondary)]">
        Was sleeved here. {slot.client_name || 'Claude'} moved this copy to {slot.moved_to_deck_name} on {formatDate(slot.at)}, {formatClock(slot.at)}
        {slot.approved_by_owner ? ' (you approved it)' : ''}.
      </p>
    </div>
  )
}
