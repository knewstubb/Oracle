'use client'

/**
 * "Picklist · all decks". Spec: docs/oracle/specs/know-where-cards-are.md sections 4 and 20.5. Ticks save at once.
 * Lists every planned card of every deck, grouped by where the copy is now (Storage, Another deck), plus an Unowned
 * section with no ticks. Picked moves the copy to In your hand; Placed needs Picked first.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { usePageHeader } from '@/contexts/PageHeaderContext'
import { Skeleton } from '@/components/ui/skeleton'
import { undoToastText } from '@/lib/move-routines'
import { sendTick } from '@/lib/picklist-tick-client'
import { usePendingSaves } from '@/hooks/usePendingSaves'
import { applyWalkOptimistic, placedSummary, walkRowKey, type AllDecksPicklist as Data, type WalkOptimistic, type WalkRow, type WalkStop } from '@/lib/all-decks-picklist'

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
  const { data: serverData, isLoading, isError, refetch } = useQuery<Data>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch('/api/picklist')
      if (!res.ok) throw new Error('load failed')
      return res.json()
    },
  })
  // Ticks and Undo show their result at once. A refusal or a network failure puts the row back with the plain
  // message. One save per row at a time; a re-read of the Picklist cannot undo a save that is still running.
  const pending = usePendingSaves<WalkOptimistic>()
  const data = useMemo(() => (serverData ? applyWalkOptimistic(serverData, pending.values) : serverData), [serverData, pending.values])
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY })
    void qc.invalidateQueries({ queryKey: ['locations', 'system'] })
    void qc.invalidateQueries({ queryKey: ['decks'] })
  }
  const settle = async (itemId: number, token: number) => {
    // Keep the new state until the Picklist has been re-read, then hand over to the server's answer.
    void qc.invalidateQueries({ queryKey: ['locations', 'system'] })
    // The deck's card list and status chips change too (a Picked card shows In your hand there).
    void qc.invalidateQueries({ queryKey: ['decks'] })
    await qc.invalidateQueries({ queryKey: KEY })
    pending.clear(itemId, token)
  }
  const failed = (itemId: number, token: number, e: unknown) => {
    pending.fail(itemId, token)
    const text = e instanceof Error ? e.message : "Couldn't save that."
    toast.error(text); setAnnounce(text)
  }
  const tick = async (v: { action: Action; row: WalkRow }) => {
    const { row } = v
    const state: WalkOptimistic['state'] = v.action === 'found' ? 'found' : v.action === 'placed' ? 'placed' : 'missing'
    const key = walkRowKey(row)
    const token = pending.start(key, { itemId: key, state })
    if (token === null) return
    try {
      await sendTick(v.action === 'cant-find' ? 'cant_find' : v.action, toBody(row) as { copyId: number; cardName: string; to: unknown })
    } catch (e) { failed(key, token, e); return }
    pending.saved(key)
    const text = v.action === 'found' ? `${row.cardName} is in your hand.` : v.action === 'placed' ? `${row.cardName} placed.` : `${row.cardName} marked Missing.`
    toast.success(text); setAnnounce(text)
    await settle(key, token)
  }
  const undo = async (row: WalkRow) => {
    if (row.itemId === null) return
    const optimistic: WalkOptimistic['state'] = row.state === 'placed' ? 'found' : 'to_find'
    const itemId = row.itemId
    const token = pending.start(itemId, { itemId, state: optimistic })
    if (token === null) return
    let state: 'found' | 'to_find'
    try {
      let res: Response
      try {
        res = await fetch(`/api/moves/items/${row.itemId}/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedState: row.state, cardName: row.cardName }) })
      } catch { throw new Error(`Couldn't undo that. ${row.cardName} is still where Oracle had it.`) }
      const json = (await res.json().catch(() => ({}))) as { message?: string; state?: 'found' | 'to_find' }
      if (!res.ok) throw new Error(json.message || `Couldn't undo that. ${row.cardName} is still where Oracle had it.`)
      state = json.state ?? 'to_find'
    } catch (e) { failed(itemId, token, e); return }
    pending.saved(itemId)
    const text = undoToastText(row.cardName, row.state as 'placed' | 'found' | 'missing', state)
    toast.success(text); setAnnounce(text)
    await settle(itemId, token)
  }
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
  const rowActions: RowActions = { tick, undo, cancel: cancel.mutate, busy: cancel.isPending, isSaving: pending.isSaving }
  usePageHeader({ title: 'Picklist', subtitle: 'All decks' })

  const stops = (data?.takeFromBoxes.length ?? 0) + (data?.takeFromDecks.length ?? 0) + (data?.placeIn.length ?? 0) + (data?.unowned?.length ?? 0)
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
            {placedSummary(placed, c!.total)}{c!.missing > 0 ? ` · ${c!.missing} missing` : ''}
          </p>
          <div className="my-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={c!.total} aria-valuenow={placed}>
            <div className="h-full bg-[var(--accent-primary)]" style={{ width: c!.total ? `${(placed / c!.total) * 100}%` : '0%' }} />
          </div>
          {(data.decks ?? []).length > 0 && (
            <ul className="mb-2 space-y-0.5 text-[length:var(--fs-sm)] text-muted-foreground" data-testid="deck-progress">
              {data.decks.map((d) => <li key={d.deckId}>{d.deckName}: {placedSummary(d.placed, d.total)}</li>)}
            </ul>
          )}
          <p className="text-[length:var(--fs-sm)] text-muted-foreground">Every planned card in your decks shows here. Ticks save straight away. Picked moves the card to In your hand, and out of any deck it was in. Placed needs Picked first.</p>
          {stops === 0 ? (
            <p className="mt-6 text-muted-foreground">Nothing to pick. None of your decks has a planned card waiting for a copy.</p>
          ) : c!.total > 0 && placed === c!.total ? (
            <p className="mt-6 font-medium">All done. Everything on the Picklist is placed.</p>
          ) : null}
          <Section title="Storage" stops={data.takeFromBoxes} actions={rowActions} />
          <Section title="Another deck" stops={data.takeFromDecks} actions={rowActions} />
          <Section title="Place in decks and boxes" stops={data.placeIn} actions={rowActions} />
          <Section title="Unowned" stops={data.unowned ?? []} actions={rowActions} />
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
  isSaving: (itemId: number) => boolean
}

function Section({ title, stops, actions }: { title: string; stops: WalkStop[]; actions: RowActions }) {
  const { tick, undo, cancel, isSaving } = actions
  if (stops.length === 0) return null
  const btn = 'min-h-12 rounded-md border border-[var(--border-default)] px-3 text-[length:var(--fs-sm)] md:min-h-11'
  return (
    <section className="mt-6" aria-label={title}>
      <h3 className="text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {stops.map((s) => (
        <div key={s.key} className="mt-3" data-testid={`stop-${s.placeName}`}>
          <div className="font-medium">{s.placeName}</div>
          <ul className="mt-1 space-y-2">
            {s.rows.map((r) => {
              const busy = actions.busy || isSaving(walkRowKey(r))
              return (
              <li key={r.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-default)] p-3">
                <div className="min-w-0 flex-1">
                  <div className={r.state === 'placed' ? 'font-medium line-through opacity-60' : 'font-medium'}>{r.cardName}{r.isProxy ? ' (proxy)' : ''}</div>
                  <div className="text-[length:var(--fs-sm)] text-muted-foreground">
                    {r.state === 'missing' ? 'Missing' : r.state === 'found' ? `In your hand · going to ${r.toName}` : r.state === 'placed' ? `Placed in ${r.toName}` : r.copyId === null ? `For ${r.toName} · not in your collection` : `For ${r.toName}`}
                  </div>
                  {r.blockedBy && (
                    <div className="text-[length:var(--fs-sm)] text-muted-foreground" data-testid={`blocked-${r.key}`}>
                      Your only copy is already going to {r.blockedBy}. Pick it there first, or add another copy.
                    </div>
                  )}
                </div>
                {r.copyId !== null && r.state === 'to_find' && !r.blockedBy && (
                  <>
                    <button type="button" className={btn} disabled={busy} aria-label={`Picked: ${r.cardName}`} onClick={() => tick({ action: 'found', row: r })}>Picked</button>
                    <button type="button" className="min-h-11 text-[length:var(--fs-sm)] underline" disabled={busy} aria-label={`Can't find it: ${r.cardName}`} onClick={() => tick({ action: 'cant-find', row: r })}>Can&apos;t find it</button>
                    {r.itemId !== null && (
                      <button type="button" className="min-h-11 text-[length:var(--fs-sm)] text-muted-foreground underline" disabled={busy} aria-label={`Cancel step: ${r.cardName}`} onClick={() => cancel(r)}>Cancel step</button>
                    )}
                  </>
                )}
                {r.copyId !== null && r.state === 'found' && (
                  <button type="button" className={btn} disabled={busy} aria-label={`Placed: ${r.cardName}`} onClick={() => tick({ action: 'placed', row: r })}>Placed</button>
                )}
                {r.itemId !== null && r.state !== 'to_find' && (
                  <button type="button" className="min-h-11 text-[length:var(--fs-sm)] text-muted-foreground underline" disabled={busy} aria-label={`Undo: ${r.cardName}`} onClick={() => undo(r)}>Undo</button>
                )}
              </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
