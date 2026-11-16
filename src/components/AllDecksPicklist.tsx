'use client'

/** "Picklist · all decks". Spec: docs/oracle/specs/know-where-cards-are.md sections 4 and 20.5. Ticks save at once. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { usePageHeader } from '@/contexts/PageHeaderContext'
import { Skeleton } from '@/components/ui/skeleton'
import { undoToastText } from '@/lib/move-routines'
import { unownedFootnote, type AllDecksPicklist as Data, type WalkRow, type WalkStop } from '@/lib/all-decks-picklist'

const KEY = ['picklist', 'all-decks']
type Action = 'found' | 'placed' | 'cant-find'

function toBody(row: WalkRow) {
  const to = row.toDeckId !== null
    ? { kind: 'deck', deckId: row.toDeckId, ...(row.toDeckCardId ? { deckCardId: row.toDeckCardId } : {}) }
    : { kind: 'location', locationId: row.toLocationId }
  return { copyId: row.copyId, cardName: row.cardName, to }
}

export function AllDecksPicklist() {
  const qc = useQueryClient()
  const [announce, setAnnounce] = useState('')
  const { data, isLoading, isError, refetch } = useQuery<Data>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch('/api/picklist')
      if (!res.ok) throw new Error('load failed')
      return res.json()
    },
  })
  const tick = useMutation({
    mutationFn: async (v: { action: Action; row: WalkRow }) => {
      const res = await fetch(`/api/picklist/${v.action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toBody(v.row)) })
      const json = (await res.json().catch(() => ({}))) as { message?: string }
      if (!res.ok) throw new Error(json.message || `Couldn't save that. ${v.row.cardName} is still where Oracle had it.`)
      return v
    },
    onSuccess: (v) => {
      const text = v.action === 'found' ? `${v.row.cardName} is in your hand.` : v.action === 'placed' ? `${v.row.cardName} placed.` : `${v.row.cardName} marked Missing.`
      toast.success(text); setAnnounce(text)
      void qc.invalidateQueries({ queryKey: KEY })
      void qc.invalidateQueries({ queryKey: ['locations', 'system'] })
    },
    onError: (e: Error) => { toast.error(e.message); setAnnounce(e.message) },
  })
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY })
    void qc.invalidateQueries({ queryKey: ['locations', 'system'] })
  }
  const undo = useMutation({
    mutationFn: async (row: WalkRow) => {
      const res = await fetch(`/api/moves/items/${row.itemId}/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedState: row.state, cardName: row.cardName }) })
      const json = (await res.json().catch(() => ({}))) as { message?: string; state?: 'found' | 'to_find' }
      if (!res.ok) throw new Error(json.message || `Couldn't undo that. ${row.cardName} is still where Oracle had it.`)
      return { row, state: json.state ?? 'to_find' }
    },
    onSuccess: ({ row, state }) => {
      const text = undoToastText(row.cardName, row.state as 'placed' | 'found' | 'missing', state)
      toast.success(text); setAnnounce(text); refresh()
    },
    onError: (e: Error) => { toast.error(e.message); setAnnounce(e.message) },
  })
  const cancel = useMutation({
    mutationFn: async (row: WalkRow) => {
      const res = await fetch(`/api/moves/items/${row.itemId}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardName: row.cardName }) })
      const json = (await res.json().catch(() => ({}))) as { message?: string }
      if (!res.ok) throw new Error(json.message || `Couldn't cancel that step. ${row.cardName} is still on the Picklist.`)
      return row
    },
    onSuccess: (row) => {
      const text = `${row.cardName} is off the Picklist. Nothing moved.`
      toast.success(text); setAnnounce(text); refresh()
    },
    onError: (e: Error) => { toast.error(e.message); setAnnounce(e.message) },
  })
  const rowActions: RowActions = { tick: tick.mutate, undo: undo.mutate, cancel: cancel.mutate, busy: tick.isPending || undo.isPending || cancel.isPending }
  usePageHeader({ title: 'Picklist', subtitle: 'All decks' })

  const stops = (data?.takeFromBoxes.length ?? 0) + (data?.takeFromDecks.length ?? 0) + (data?.placeIn.length ?? 0)
  const c = data?.counts
  const placed = c?.placed ?? 0

  return (
    <div className="mx-auto w-full max-w-[var(--content-max-width)] px-5 py-6">
      {isLoading ? (
        <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : isError || !data ? (
        <div role="alert" className="rounded-lg border border-[var(--border-default)] p-4">
          Couldn&apos;t load the Picklist.{' '}
          <button type="button" className="min-h-11 underline" onClick={() => void refetch()}>Try again</button>
        </div>
      ) : (
        <>
          <h2 className="text-[length:var(--fs-lg)] font-semibold">Picklist · all decks</h2>
          <p className="text-[length:var(--fs-sm)] text-muted-foreground" data-testid="all-decks-summary">
            {placed} of {c!.total} placed{c!.missing > 0 ? ` · ${c!.missing} missing` : ''}
          </p>
          <div className="my-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={c!.total} aria-valuenow={placed}>
            <div className="h-full bg-[var(--accent-primary)]" style={{ width: c!.total ? `${(placed / c!.total) * 100}%` : '0%' }} />
          </div>
          <p className="text-[length:var(--fs-sm)] text-muted-foreground">Ticks save straight away. Found takes the card out of its deck in Oracle at once.</p>
          {stops === 0 ? (
            <p className="mt-6 text-muted-foreground">Nothing to move. Add cards to the Picklist from a deck&apos;s Picklist and they show here in walking order.</p>
          ) : c!.total > 0 && placed === c!.total ? (
            <p className="mt-6 font-medium">All done. Everything on the Picklist is placed.</p>
          ) : null}
          <Section title="Take from boxes" stops={data.takeFromBoxes} actions={rowActions} />
          <Section title="Take from decks" stops={data.takeFromDecks} actions={rowActions} />
          <Section title="Place in decks and boxes" stops={data.placeIn} actions={rowActions} />
          {(data.unownedByDeck ?? []).length > 0 && (
            <div className="mt-6 space-y-1 text-[length:var(--fs-sm)] text-muted-foreground" data-testid="unowned-footnote">
              {data.unownedByDeck.map((u) => <p key={u.deckId}>{unownedFootnote(u.count, u.deckName)}</p>)}
            </div>
          )}
        </>
      )}
      <p className="sr-only" role="status" aria-live="polite" data-testid="all-decks-announce">{announce}</p>
    </div>
  )
}

interface RowActions {
  tick: (v: { action: Action; row: WalkRow }) => void
  undo: (row: WalkRow) => void
  cancel: (row: WalkRow) => void
  busy: boolean
}

function Section({ title, stops, actions }: { title: string; stops: WalkStop[]; actions: RowActions }) {
  const { tick, undo, cancel, busy } = actions
  if (stops.length === 0) return null
  const btn = 'min-h-12 rounded-md border border-[var(--border-default)] px-3 text-[length:var(--fs-sm)] md:min-h-11'
  return (
    <section className="mt-6" aria-label={title}>
      <h3 className="text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {stops.map((s) => (
        <div key={s.key} className="mt-3" data-testid={`stop-${s.placeName}`}>
          <div className="font-medium">{s.placeName}</div>
          <ul className="mt-1 space-y-2">
            {s.rows.map((r) => (
              <li key={r.itemId} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-default)] p-3">
                <div className="min-w-0 flex-1">
                  <div className={r.state === 'placed' ? 'font-medium line-through opacity-60' : 'font-medium'}>{r.cardName}{r.isProxy ? ' (proxy)' : ''}</div>
                  <div className="text-[length:var(--fs-sm)] text-muted-foreground">
                    {r.state === 'missing' ? 'Missing' : r.state === 'found' ? `In your hand · going to ${r.toName}` : r.state === 'placed' ? `Placed in ${r.toName}` : `For ${r.toName}`}
                  </div>
                </div>
                {r.copyId !== null && r.state === 'to_find' && (
                  <>
                    <button type="button" className={btn} disabled={busy} aria-label={`Found it: ${r.cardName}`} onClick={() => tick({ action: 'found', row: r })}>Found it</button>
                    <button type="button" className="min-h-11 text-[length:var(--fs-sm)] underline" disabled={busy} aria-label={`Can't find it: ${r.cardName}`} onClick={() => tick({ action: 'cant-find', row: r })}>Can&apos;t find it</button>
                    <button type="button" className="min-h-11 text-[length:var(--fs-sm)] text-muted-foreground underline" disabled={busy} aria-label={`Cancel step: ${r.cardName}`} onClick={() => cancel(r)}>Cancel step</button>
                  </>
                )}
                {r.copyId !== null && r.state === 'found' && (
                  <button type="button" className={btn} disabled={busy} aria-label={`Placed it: ${r.cardName}`} onClick={() => tick({ action: 'placed', row: r })}>Placed it</button>
                )}
                {r.state !== 'to_find' && (
                  <button type="button" className="min-h-11 text-[length:var(--fs-sm)] text-muted-foreground underline" disabled={busy} aria-label={`Undo: ${r.cardName}`} onClick={() => undo(r)}>Undo</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
