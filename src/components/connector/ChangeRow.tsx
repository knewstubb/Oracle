'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { UndoRefusal } from './api'
import { ClaudeReason } from './ClaudeReason'
import { formatClock, formatDate } from './format'

export type ChangeStatus = 'done' | 'undone' | 'refused' | 'failed'

export interface ChangeRowProps {
  summary: string
  consequence?: string | null
  /** Claude's one-line reason; nothing is shown when there is none. */
  reason?: string | null
  deckName: string | null
  deckId?: number | null
  cardName: string
  at: string
  client: string | null
  status: ChangeStatus
  busy?: boolean
  undoneAt?: string | null
  refusal?: UndoRefusal | null
  /** Server-written reason (same wording as when Undo is pressed). Preferred over the client's fallback. */
  refusalText?: string | null
  /** Several cards in one request: shown as a disclosure. */
  cards?: string[]
  onUndo: () => void
  actionRef?: (el: HTMLButtonElement | null) => void
}

/** Plain-words reason for a refused Undo. Always names the card and the date when known. */
export function refusalWhat(r: UndoRefusal): string {
  const card = r.card ?? 'the card'
  const on = r.on ? `on ${formatDate(r.on)}` : 'since it was made'
  switch (r.code) {
    case 'slot_sleeved': return `${card} was sleeved with a copy ${on}`
    case 'slot_edited': return `${card} was edited ${on}`
    case 'copy_elsewhere':
    case 'copy_moved': return `the copy of ${card} was moved ${on}`
    case 'copy_in_deck': return `${card} is now in a deck (${on})`
    case 'card_back_on_list': return `${card} was put back on the list ${on}`
    case 'proxy_moved': return `the proxy of ${card} was moved ${on}`
    case 'source_changed':
    case 'moved_again': return `${card} was moved again ${on}`
    case 'window_closed': return 'the 7-day Undo window has closed'
    default: return `${card} changed ${on}`
  }
}

export function ChangeRow({
  summary, consequence, reason, deckName, deckId, cardName, at, client, status, busy = false, undoneAt, refusal, refusalText, cards, onUndo, actionRef,
}: ChangeRowProps) {
  const [open, setOpen] = useState(false)
  const whyId = useId()
  const undone = status === 'undone'
  const refused = status === 'refused'
  return (
    <li
      className="flex flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 sm:flex-row sm:items-start sm:justify-between"
      style={undone ? { opacity: 0.7 } : undefined}
      data-testid="change-row"
      data-status={status}
      data-card={cardName}
    >
      <div className="min-w-0">
        <p className="text-[length:var(--fs-base)] text-[var(--text-primary)]">
          {summary}
          {undone && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[length:var(--fs-xs)] text-[var(--text-secondary)]">
              <Check className="size-3" aria-hidden="true" />
              Undone{undoneAt ? `, ${formatClock(undoneAt)}` : ''}
            </span>
          )}
        </p>
        <ClaudeReason reason={reason} />
        {consequence && !undone && <p className="text-[length:var(--fs-sm)] text-[var(--text-secondary)]">{consequence}</p>}
        <p className="text-[length:var(--fs-xs)] text-[var(--text-secondary)]">
          {formatClock(at)}{client ? ` · ${client}` : ''}
          {undone && deckName ? `. ${deckName} is as it was before.` : ''}
        </p>
        {cards && cards.length > 1 && (
          <div className="mt-1">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex min-h-[44px] items-center text-[length:var(--fs-sm)] text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
            >
              {open ? 'Hide the cards' : `See the ${cards.length} cards`}
            </button>
            {open && (
              <ul className="list-disc pl-5 text-[length:var(--fs-sm)] text-[var(--text-primary)]">
                {cards.map((c, i) => <li key={`${c}-${i}`}>{c}</li>)}
              </ul>
            )}
          </div>
        )}
        {refused && (refusal || refusalText) && (
          <div id={whyId} className="mt-2 rounded-lg border border-[var(--signal-critical)] p-2 text-[length:var(--fs-sm)] text-[var(--text-primary)]">
            {refusalText ? (
              <p><b>Can&apos;t undo this one.</b> {refusalText}</p>
            ) : refusal?.code === 'owner_only' || refusal?.code === 'window_closed' ? (
              <p><b>Can&apos;t undo this one.</b> {refusal ? refusalWhat(refusal) : ''}.</p>
            ) : (
              <p>
                <b>Can&apos;t undo this one.</b> You have changed {refusal?.deck ?? deckName ?? 'the deck'} since: {refusal ? refusalWhat(refusal) : ''}.
                Undoing it now could break the deck. You can take it out by hand on the deck page.
              </p>
            )}
            {deckId != null && (
              <Link href={`/decks/${deckId}`} className="mt-1 inline-flex min-h-[44px] items-center underline underline-offset-2">
                Open {deckName ?? 'the deck'}
              </Link>
            )}
          </div>
        )}
        {status === 'failed' && (
          <p className="mt-2 flex items-start gap-2 text-[length:var(--fs-sm)] text-[var(--text-primary)]" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--signal-critical)]" aria-hidden="true" />
            We couldn&apos;t undo this. Nothing was changed. Try again.
          </p>
        )}
      </div>
      {!undone && (
        <Button
          ref={actionRef}
          data-action
          type="button"
          variant="outline"
          className="min-h-[44px] w-full sm:w-auto"
          disabled={busy}
          aria-disabled={busy || refused ? true : undefined}
          aria-describedby={refused ? whyId : undefined}
          aria-label={`Undo: ${summary}`}
          onClick={() => {
            if (refused || busy) return
            onUndo()
          }}
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {busy ? 'Undoing…' : 'Undo'}
        </Button>
      )}
    </li>
  )
}
