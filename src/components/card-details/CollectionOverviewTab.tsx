'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { CopySwatch, type CopySwatchKind } from '@/components/CopySwatch'
import { CARD_DETAILS_LABELS as L, conditionLabel, deckStateLabel } from '@/lib/card-details/labels'
import type { CollectionCopyView } from '@/lib/card-details/collection-copies'
import type { CollectionCardDetails, WaitingDeck } from '@/lib/card-details/load-collection'
import { BTN_SM, TAB_BODY } from './shared'
import { OverviewFacts } from './OverviewFacts'

export function copySwatchKind(c: CollectionCopyView): CopySwatchKind {
  if (c.isProxy) return 'proxy'
  return c.state === 'in_deck' ? 'original' : 'open'
}

/** "Playable · NM", "Open · LP", "Proxy": state first, then condition for Originals. */
export function copyStateText(c: CollectionCopyView): string {
  if (c.state === 'missing') return L.missing
  const parts: string[] = []
  if (c.assigned) parts.push(deckStateLabel(c.assigned.deckState))
  else parts.push(c.isProxy ? L.proxy : L.open)
  if (c.assigned && c.isProxy) parts.push(L.proxy)
  if (!c.isProxy && c.condition) parts.push(conditionLabel(c.condition))
  return parts.join(' · ')
}

export interface CollectionOverviewTabProps {
  data: CollectionCardDetails
  refresh: () => void
}

export function CollectionOverviewTab({ data, refresh }: CollectionOverviewTabProps) {
  const [busy, setBusy] = useState<number | null>(null)
  const [rowError, setRowError] = useState<{ id: number; text: string } | null>(null)
  // The copy to sleeve: an Open Original first, else an Open Proxy.
  const open = data.copies.filter((c) => c.state === 'open')
  const freeCopy = open.find((c) => !c.isProxy) ?? open[0] ?? null

  const act = async (d: WaitingDeck) => {
    setBusy(d.deckCardsId)
    setRowError(null)
    try {
      if (freeCopy) {
        const res = await fetch('/api/allocation/assign-free-copy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ copyId: freeCopy.copyId, targetDeckId: d.deckId, cardName: data.cardName }),
        })
        if (!res.ok) throw new Error('failed')
        toast.success(`Sleeved a copy of ${data.cardName} in ${d.deckName}`)
      } else {
        const res = await fetch('/api/allocation/add-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deckCardsId: d.deckCardsId }),
        })
        if (!res.ok) throw new Error('failed')
        toast.success(`Added a proxy of ${data.cardName} to ${d.deckName}`)
      }
      refresh()
    } catch {
      setRowError({ id: d.deckCardsId, text: freeCopy ? "Couldn't sleeve that copy. Nothing was changed." : "Couldn't add a proxy. Nothing was changed." })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={`${TAB_BODY} grid content-start gap-6 sm:grid-cols-[minmax(0,1fr)_300px]`}>
      <OverviewFacts facts={data.facts} tags={data.tags} />
      <div className="flex min-w-0 flex-col gap-4">
        <section aria-labelledby="cd-where" className="rounded-lg border border-[var(--border-default)] p-3" data-testid="card-details-where">
          <h3 id="cd-where" className="text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-muted-foreground">{L.whereYourCopiesAre}</h3>
          {data.copies.length === 0 ? (
            <p className="mt-2 text-[length:var(--fs-sm)] text-muted-foreground">{L.noCopiesYet}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {data.copies.map((c) => (
                <li key={c.copyId} data-testid="card-details-where-row" className="flex items-start gap-2 text-[length:var(--fs-sm)]">
                  <span className="mt-0.5"><CopySwatch kind={copySwatchKind(c)} /></span>
                  <span className="min-w-0">
                    <span className="block break-words font-medium">{c.assigned ? c.assigned.deckName : (c.storage.name ?? 'Not stored')}</span>
                    <span className="block text-muted-foreground">{copyStateText(c)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="cd-waiting" className="rounded-lg border border-[var(--border-default)] p-3" data-testid="card-details-waiting">
          <h3 id="cd-waiting" className="text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-muted-foreground">{L.decksWaiting}</h3>
          {data.waitingDecks.length === 0 ? (
            <p className="mt-2 text-[length:var(--fs-sm)] text-muted-foreground">{L.noDecksWaiting}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-3">
              {data.waitingDecks.map((d) => (
                <li key={d.deckCardsId} data-testid="card-details-waiting-row" className="flex flex-col gap-1.5 text-[length:var(--fs-sm)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <a href={`/decks/${d.deckId}`} className="block break-words font-medium underline">{d.deckName}</a>
                      <span className="block text-muted-foreground">{L.plannedNotSleeved}</span>
                    </span>
                    <button type="button" className={`${BTN_SM} shrink-0`} disabled={busy !== null} onClick={() => void act(d)}>
                      {busy === d.deckCardsId ? 'Working…' : freeCopy ? L.sleeveFreeCopy : L.addProxy}
                    </button>
                  </div>
                  {rowError?.id === d.deckCardsId && (
                    <p role="alert" className="text-[length:var(--fs-xs)]" style={{ color: 'var(--signal-critical)' }}>{rowError.text}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
