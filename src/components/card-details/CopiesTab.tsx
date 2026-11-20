'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { CARD_DETAILS_LABELS as L, conditionLabel, deckStateLabel, inDeckLabel } from '@/lib/card-details/labels'
import type { CopyView } from '@/lib/card-details/copies'
import type { CardDetails } from '@/lib/card-details/load'
import { moveHereErrorMessage, movedToastText, playableWarning } from '@/lib/move-here'
import { BTN_SM, Swatch, TAB_BODY, finishSuffix, setLabel } from './shared'
import { useRefreshAfterChange } from './useCardDetailsData'

export interface CopiesTabProps {
  deckId: number
  cardId: number
  data: CardDetails
}

function stateText(c: CopyView): string {
  switch (c.state) {
    case 'in_this_deck': return L.inThisDeck
    case 'open': return c.isProxy ? L.proxy : L.open
    case 'claimed': return c.where.kind === 'deck' ? inDeckLabel(c.where.deckName, deckStateLabel(c.where.deckState)) : L.claimed
    case 'proxy_elsewhere': return c.where.kind === 'deck' ? `${L.proxy} · ${c.where.deckName}` : L.proxy
    default: return L.missing
  }
}

function whereText(c: CopyView): string {
  if (c.where.kind === 'deck') return c.where.deckName
  return c.where.name ?? 'Not stored'
}

interface MoveReply {
  sourceDeckId: number
  sourceDeckName: string
  sourceWasPlayable?: boolean
  undo: unknown
}

export function CopiesTab({ deckId, cardId, data }: CopiesTabProps) {
  const refresh = useRefreshAfterChange(deckId, cardId)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [rowError, setRowError] = useState<{ id: number; text: string } | null>(null)
  const planned = data.slot.copyId == null

  const undo = async (m: MoveReply) => {
    try {
      const res = await fetch('/api/allocation/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m.undo) })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.success !== false) {
        toast.success(`Put ${data.cardName} back in ${m.sourceDeckName}.`)
        refresh()
        return
      }
      toast.error("Can't undo this move any more. Nothing was changed.")
    } catch {
      toast.error('No connection. Nothing was changed.')
    }
  }

  const sleeve = async (c: CopyView) => {
    setBusyId(c.copyId)
    setRowError(null)
    try {
      const res = await fetch('/api/allocation/assign-free-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyId: c.copyId, targetDeckId: deckId, cardName: data.cardName }),
      })
      if (!res.ok) throw new Error('failed')
      refresh()
    } catch {
      setRowError({ id: c.copyId, text: "Couldn't sleeve that copy. Nothing was changed." })
    } finally {
      setBusyId(null)
    }
  }

  const move = async (c: CopyView) => {
    if (c.where.kind !== 'deck') return
    setBusyId(c.copyId)
    setRowError(null)
    try {
      const res = await fetch(`/api/decks/${deckId}/move-here`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyId: c.copyId, cardName: data.cardName, expectedSourceDeckId: c.where.deckId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRowError({ id: c.copyId, text: typeof body.message === 'string' ? body.message : moveHereErrorMessage('failed', data.cardName) })
        return
      }
      const m = body as MoveReply
      setConfirming(null)
      toast.success(movedToastText(m.sourceDeckName, Boolean(m.sourceWasPlayable)), { duration: 8000, action: { label: 'Undo', onClick: () => void undo(m) } })
      refresh()
    } catch {
      setRowError({ id: c.copyId, text: 'No connection. Nothing was moved.' })
    } finally {
      setBusyId(null)
    }
  }

  const onMoveClick = (c: CopyView) => {
    // A Playable source warns on the row first; any other source moves on one click.
    if (c.where.kind === 'deck' && c.where.deckState === 'playable' && confirming !== c.copyId) {
      setConfirming(c.copyId)
      return
    }
    void move(c)
  }

  return (
    <div className={TAB_BODY}>
      {planned && (
        <p role="note" data-testid="card-details-planned-note" className="mb-3 rounded-md border border-[var(--border-default)] p-2 text-[length:var(--fs-sm)]">{L.slotPlannedNote}</p>
      )}
      {data.copies.length === 0 ? (
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">You don&apos;t own a copy of this card ({L.unowned}).</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[length:var(--fs-sm)]">
            <caption className="sr-only">Your copies of this card</caption>
            <thead className="text-[length:var(--fs-xs)] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 pr-3">Where</th>
                <th scope="col" className="py-1 pr-3">Printing</th>
                <th scope="col" className="py-1 pr-3">Condition</th>
                <th scope="col" className="py-1 pr-3">State</th>
                <th scope="col" className="py-1 pr-3"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {data.copies.map((c) => {
                const warn = confirming === c.copyId && c.where.kind === 'deck'
                return (
                  <tr key={c.copyId} data-testid="card-details-copy-row" className="border-t border-[var(--border-default)] align-top">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2"><Swatch copy={c} />{whereText(c)}</span>
                    </td>
                    <td className="py-2 pr-3">{c.printing ? `${setLabel(c.printing.setCode, c.printing.collectorNumber)}${finishSuffix(c.finish)}` : '—'}</td>
                    <td className="py-2 pr-3">{conditionLabel(c.condition)}</td>
                    <td className="py-2 pr-3">{stateText(c)}</td>
                    <td className="py-2 text-right">
                      {c.action === 'sleeve_here' && (
                        <button type="button" className={`${BTN_SM} bg-primary text-primary-foreground`} disabled={busyId !== null} onClick={() => void sleeve(c)}>{L.sleeveHere}</button>
                      )}
                      {c.action === 'move_here' && !warn && (
                        <button type="button" className={BTN_SM} disabled={busyId !== null} onClick={() => onMoveClick(c)}>{L.moveHere}</button>
                      )}
                      {c.action === 'swap_in' && (
                        <span className="text-[length:var(--fs-xs)] text-muted-foreground">Open · {L.swapInNote}</span>
                      )}
                      {warn && c.where.kind === 'deck' && (
                        <div role="alert" data-testid="card-details-move-warning" className="flex flex-col items-end gap-1.5">
                          <span style={{ color: 'var(--signal-warning)' }}>{playableWarning(c.where.deckName)}</span>
                          <span className="flex gap-2">
                            <button type="button" className={`${BTN_SM} bg-primary text-primary-foreground`} disabled={busyId !== null} onClick={() => void move(c)}>
                              {busyId === c.copyId ? 'Moving…' : `Confirm ${L.moveHere}`}
                            </button>
                            <button type="button" className={BTN_SM} onClick={() => setConfirming(null)}>Cancel</button>
                          </span>
                        </div>
                      )}
                      {rowError?.id === c.copyId && (
                        <p role="alert" className="mt-1 text-[length:var(--fs-xs)]" style={{ color: 'var(--signal-critical)' }}>{rowError.text}</p>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[length:var(--fs-xs)] text-muted-foreground">{L.moveFootnote}</p>
    </div>
  )
}
