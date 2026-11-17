'use client'

import { useId, useState } from 'react'
import { Ban, Clock, Loader2, Pause, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { computeDeckReadiness } from '@/lib/deck-readiness'
import type { DeckCounts, PendingItem } from './api'
import { cancelReasonText, formatClock, formatWhen } from './format'

const REQUIRED_SIZE = 100 // Commander size; same default the deck state badge assumes

const STATE_WORD = { brewing: 'Brewing', assembling: 'Assembling', playable: 'Playable' } as const

/** Deck status wording (Brewing / Assembling / Playable) from counts, via the existing readiness calculation. */
export function deckStateWord(c: DeckCounts): string {
  const slots = [
    ...Array.from({ length: c.sleeved }, () => ({ copy_id: 1 })),
    ...Array.from({ length: c.unsleeved_generics }, () => ({ is_generic: true, generic_sleeved: false })),
    ...Array.from({ length: Math.max(0, c.size - c.sleeved - c.unsleeved_generics) }, () => ({ copy_id: null })),
  ]
  return STATE_WORD[computeDeckReadiness(slots, REQUIRED_SIZE).state]
}

export interface PendingCardProps {
  item: PendingItem
  busy?: 'approve' | 'decline' | null
  onApprove: (item: PendingItem) => void
  onDecline: (item: PendingItem) => void
  onDismiss?: (item: PendingItem) => void
  /** Set when approving was refused because the deck changed. Shows the "Couldn't apply" state. */
  staleReason?: string | null
}

function DeckBox({ deck }: { deck: PendingItem['preview']['decks'][number] }) {
  const tag = deck.role === 'loses' ? '(loses a card)' : deck.role === 'gains' ? '(gains a card)' : '(changes)'
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] p-3" data-testid="pending-deck-box">
      <p className="text-[length:var(--fs-sm)] font-medium text-[var(--text-primary)]">
        {deck.name} <span className="font-normal text-[var(--text-secondary)]">{tag}</span>
      </p>
      <dl className="mt-1 space-y-0.5 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
        <div className="flex gap-1">
          <dt>Deck size:</dt>
          <dd>{deck.before.size} → {deck.after.size}</dd>
        </div>
        <div className="flex gap-1">
          <dt>In deck:</dt>
          <dd>{deck.before.sleeved} → {deck.after.sleeved}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Deck status:</dt>
          <dd>{deckStateWord(deck.before)} → {deckStateWord(deck.after)}</dd>
        </div>
      </dl>
    </div>
  )
}

function Ended({ item }: { item: PendingItem }) {
  const when = formatClock(item.decided_at ?? item.expires_at)
  if (item.status === 'expired')
    return (
      <p className="flex items-start gap-2 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
        <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Expired. Nobody answered within 24 hours. Nothing changed.</span>
      </p>
    )
  if (item.status === 'cancelled')
    return (
      <p className="flex items-start gap-2 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
        <Ban className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Cancelled: {cancelReasonText(item.cancel_reason)}. Nothing changed.</span>
      </p>
    )
  if (item.status === 'declined')
    return (
      <p className="text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
        Declined, {when}. Nothing changed. Claude was told no.
      </p>
    )
  if (item.status === 'failed')
    return (
      <p className="flex items-start gap-2 text-[length:var(--fs-sm)] text-[var(--text-primary)]">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--signal-critical)]" aria-hidden="true" />
        <span>Couldn&apos;t apply. {item.failure_reason ?? 'The deck changed since Claude asked'}. Nothing was moved. Ask Claude again.</span>
      </p>
    )
  return null
}

export function PendingCard({ item, busy = null, onApprove, onDecline, onDismiss, staleReason }: PendingCardProps) {
  const [showAll, setShowAll] = useState(false)
  const listId = useId()
  const isMove = item.kind === 'copy_move'
  const waiting = item.status === 'waiting' && !staleReason
  const ended = item.status !== 'waiting'
  const title = item.title ?? item.summary ?? (isMove ? 'Move a card?' : `Change ${item.card_count} cards?`)
  const decks = isMove
    ? [...item.preview.decks].sort((a, b) => (a.role === 'loses' ? -1 : b.role === 'loses' ? 1 : 0))
    : item.preview.decks
  const cards = item.preview.cards
  const approveLabel = isMove ? 'Approve move' : `Approve all ${item.card_count}`
  const removing = /remove|cut|zone/i.test(item.action)
  const collapsed = !isMove && cards.length > 8 && !showAll

  return (
    <article
      className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
      aria-labelledby={`${listId}-t`}
      data-testid="pending-card"
      data-status={staleReason ? 'failed' : item.status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium text-[var(--text-primary)]"
          style={{ backgroundColor: 'rgba(239, 159, 39, 0.15)', border: '1px solid var(--signal-warning, #EF9F27)' }}
        >
          <Pause className="size-3" aria-hidden="true" />
          {isMove ? 'Moving a card' : 'Big edit'} · {waiting ? 'waiting' : item.status === 'waiting' ? 'not applied' : item.status}
        </span>
        <span className="text-[length:var(--fs-xs)] text-[var(--text-secondary)]">
          {item.client_name ? `${item.client_name} · ` : ''}asked {formatClock(item.created_at)}
        </span>
      </div>
      <h3 id={`${listId}-t`} className="mt-2 text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)]">
        {title}
      </h3>

      {isMove ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {decks.map((d) => <DeckBox key={`${d.deck_id}-${d.role}`} deck={d} />)}
          </div>
          <p className="mt-3 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
            Nothing is lost or duplicated. The copy exists once and is in one deck.
          </p>
        </>
      ) : (
        <>
          <ul
            id={listId}
            tabIndex={0}
            aria-label={`The ${item.card_count} cards in this change`}
            className="mt-3 max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--border-subtle)] p-2 text-[length:var(--fs-sm)] text-[var(--text-primary)]"
          >
            {(collapsed ? cards.slice(0, 8) : cards).map((c, i) => (
              <li key={`${c.name}-${i}`}>
                {c.quantity > 1 ? `${c.quantity} × ` : ''}{c.name}{c.is_proxy ? ' (Proxy)' : ''}
                {c.to ? `: ${c.from?.length ? c.from.join(', ') : 'no category'} → ${c.to.join(', ')}` : ''}
              </li>
            ))}
          </ul>
          {cards.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-1 inline-flex min-h-[44px] items-center text-[length:var(--fs-sm)] text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
            >
              {showAll ? 'Show fewer' : `See the ${cards.length} cards`}
            </button>
          )}
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {decks.map((d) => <DeckBox key={`${d.deck_id}-${d.role}`} deck={d} />)}
          </div>
          {removing && (
            <p className="mt-3 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
              The copies go back to storage, not deleted.
            </p>
          )}
        </>
      )}

      <div className="mt-3">
        {staleReason ? (
          <p className="flex items-start gap-2 text-[length:var(--fs-sm)] text-[var(--text-primary)]" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--signal-critical)]" aria-hidden="true" />
            <span>Couldn&apos;t apply. {staleReason}. Nothing was moved. Ask Claude again.</span>
          </p>
        ) : ended ? (
          <Ended item={item} />
        ) : (
          <p className="text-[length:var(--fs-xs)] text-[var(--text-secondary)]">
            Disappears if nobody answers by {formatWhen(item.expires_at)}.
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        {waiting ? (
          <>
            <Button
              type="button"
              variant="outline"
              data-action
              className="min-h-[44px] border-[var(--signal-critical)] text-[var(--text-primary)]"
              disabled={busy !== null}
              onClick={() => onDecline(item)}
            >
              {busy === 'decline' && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Decline
            </Button>
            <Button type="button" data-action className="min-h-[44px]" disabled={busy !== null} onClick={() => onApprove(item)}>
              {busy === 'approve' && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {approveLabel}
            </Button>
          </>
        ) : (
          (staleReason || item.status === 'failed') && onDismiss && (
            <Button type="button" variant="outline" className="col-span-2 min-h-[44px]" onClick={() => onDismiss(item)}>
              Dismiss
            </Button>
          )
        )}
      </div>
    </article>
  )
}
