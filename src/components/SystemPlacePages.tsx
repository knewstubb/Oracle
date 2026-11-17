'use client'

/**
 * The two system places: "In your hand" and "Missing". Spec: docs/oracle/specs/know-where-cards-are.md.
 * Placed it saves one tick at once (picklist_tick). On Missing, Found it asks where the card is now (the owner always
 * chooses) and I checked here remembers a place already searched so it is not suggested again.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { toast } from 'sonner'
import { usePageHeader } from '@/contexts/PageHeaderContext'
import { Skeleton } from '@/components/ui/skeleton'
import type { SystemLocationsResponseWithDestinations as Data } from '@/lib/system-locations'
import { usePlaceOptions, type PlaceOption } from '@/components/PicklistPlaces'

const KEY = ['locations', 'system']

async function failureMessage(res: Response): Promise<string> {
  const j = (await res.json().catch(() => ({}))) as { message?: string }
  return j.message || "Couldn't save that. The card is still where Oracle had it."
}

function useSystem() {
  return useQuery<Data>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch('/api/locations/system')
      if (!res.ok) throw new Error('load failed')
      return res.json()
    },
  })
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  usePageHeader({ title, subtitle })
  return (
    <div className="mx-auto w-full max-w-[var(--content-max-width)] px-5 py-6">
      <Link href="/storage" className="text-[length:var(--fs-sm)] text-muted-foreground hover:text-foreground">← Binders</Link>
      {children}
    </div>
  )
}

function Loading() { return <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div> }

function LoadError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="mt-4 rounded-lg border border-[var(--border-default)] p-4 text-[length:var(--fs-sm)]">
      Couldn&apos;t load this list.{' '}
      <button type="button" onClick={retry} className="min-h-11 underline">Try again</button>
    </div>
  )
}

type Option = PlaceOption
const useOtherPlaces = usePlaceOptions

export function InHandPage() {
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useSystem()
  const places = useOtherPlaces()
  const place = useMutation({
    mutationFn: async (v: { copyId: number; cardName: string; to: Option['to'] }) => {
      const res = await fetch('/api/picklist/placed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })
      if (!res.ok) throw new Error(await failureMessage(res))
      return v
    },
    onSuccess: (v) => { toast.success(`${v.cardName} placed.`); void qc.invalidateQueries({ queryKey: KEY }) },
    onError: (e: Error) => toast.error(e.message),
  })
  const cards = data?.inHand.cards ?? []
  return (
    <Shell title="In your hand" subtitle="Cards you've picked up and haven't put down yet">
      {isLoading ? <Loading /> : isError ? <LoadError retry={() => void refetch()} /> : cards.length === 0 ? (
        <p className="mt-6 text-muted-foreground">You aren&apos;t carrying anything. Cards you pick up on a Picklist show here until you place them.</p>
      ) : (
        <ul className="mt-4 space-y-2" data-testid="in-hand-list">
          {cards.map((c) => (
            <li key={c.copyId} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-default)] p-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{c.cardName}{c.isProxy ? ' (proxy)' : ''}</div>
                <div className="text-[length:var(--fs-sm)] text-muted-foreground">
                  {c.destination ? `Going to ${c.destination.name}` : 'No destination saved'}
                </div>
              </div>
              {c.destination && (
                <button
                  type="button"
                  className="min-h-12 rounded-md bg-[var(--accent-primary)] px-4 text-[length:var(--fs-sm)] font-medium text-white md:min-h-11"
                  disabled={place.isPending}
                  aria-label={`Placed: ${c.cardName}`}
                  onClick={() => place.mutate({
                    copyId: c.copyId, cardName: c.cardName,
                    to: c.destination!.kind === 'deck'
                      ? { kind: 'deck', deckId: c.destination!.deckId, ...(c.destination!.deckCardId ? { deckCardId: c.destination!.deckCardId } : {}) } as Option['to']
                      : { kind: 'location', locationId: c.destination!.locationId },
                  })}
                >Placed</button>
              )}
              <select
                aria-label={`Put ${c.cardName} somewhere else`}
                className="min-h-12 rounded-md border border-[var(--border-default)] bg-card px-2 text-[length:var(--fs-sm)] md:min-h-11"
                value=""
                disabled={place.isPending}
                onChange={(e) => {
                  const opt = (places.data ?? []).find((o) => o.value === e.target.value)
                  if (opt) place.mutate({ copyId: c.copyId, cardName: c.cardName, to: opt.to })
                }}
              >
                <option value="">Put it somewhere else…</option>
                {(places.data ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" role="status" aria-live="polite" />
    </Shell>
  )
}

export function MissingPage() {
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useSystem()
  const places = useOtherPlaces()
  const [openId, setOpenId] = useState<number | null>(null)
  const cards = data?.missing.cards ?? []
  const unsortedId = data?.unsorted.locationId ?? 0
  const fmt = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')
  const done = () => {
    void qc.invalidateQueries({ queryKey: KEY })
    void qc.invalidateQueries({ queryKey: ['picklist', 'all-decks'] })
  }
  const turnedUp = useMutation({
    mutationFn: async (v: { copyId: number; cardName: string; to: { kind: 'in_hand' } | Option['to'] }) => {
      const res = await fetch(`/api/moves/missing/${v.copyId}/turned-up`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: v.to, cardName: v.cardName }) })
      if (!res.ok) throw new Error(await failureMessage(res))
      return v
    },
    onSuccess: (v) => {
      toast.success(v.to.kind === 'in_hand' ? `${v.cardName} is in your hand.` : `${v.cardName} is no longer Missing.`)
      setOpenId(null)
      done()
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const checked = useMutation({
    mutationFn: async (v: { stepId: number; cardName: string; place: { kind: 'deck' | 'location'; id: number }; label: string }) => {
      const res = await fetch(`/api/moves/items/${v.stepId}/looked-here`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ place: v.place, cardName: v.cardName }) })
      if (!res.ok) throw new Error(await failureMessage(res))
      return v
    },
    onSuccess: (v) => { toast.success(`Noted. ${v.label} won't be suggested again for ${v.cardName}.`); done() },
    onError: (e: Error) => toast.error(e.message),
  })
  const busy = turnedUp.isPending || checked.isPending
  return (
    <Shell title="Missing" subtitle="Cards you couldn't find">
      {isLoading ? <Loading /> : isError ? <LoadError retry={() => void refetch()} /> : cards.length === 0 ? (
        <p className="mt-6 text-muted-foreground">Nothing is missing.</p>
      ) : (
        <ul className="mt-4 space-y-2" data-testid="missing-list">
          {cards.map((c) => (
            <li key={c.copyId} className="rounded-lg border border-[var(--border-default)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.cardName}{c.isProxy ? ' (proxy)' : ''}</span>
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[length:var(--fs-xs)] font-medium text-amber-300">⚠ Missing</span>
                <button
                  type="button"
                  className="ml-auto min-h-12 rounded-md border border-[var(--border-default)] px-3 text-[length:var(--fs-sm)] md:min-h-11"
                  aria-expanded={openId === c.copyId}
                  aria-label={`Found it: ${c.cardName}`}
                  disabled={busy}
                  onClick={() => setOpenId(openId === c.copyId ? null : c.copyId)}
                >Found it</button>
              </div>
              <div className="text-[length:var(--fs-sm)] text-muted-foreground">
                {c.lastSeenName ? `Last in ${c.lastSeenName}` : 'Last place not recorded'}{c.since ? ` · flagged ${fmt(c.since)}` : ''}
              </div>
              {openId === c.copyId && (
                <label className="mt-2 flex flex-wrap items-center gap-2 text-[length:var(--fs-sm)]">
                  <span>Where is it now?</span>
                  <select
                    aria-label={`Where ${c.cardName} is now`}
                    className="min-h-12 rounded-md border border-[var(--border-default)] bg-card px-2 md:min-h-11"
                    value=""
                    disabled={busy}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === 'hand') turnedUp.mutate({ copyId: c.copyId, cardName: c.cardName, to: { kind: 'in_hand' } })
                      else {
                        const opt = (places.data ?? []).find((o) => o.value === v)
                        if (opt) turnedUp.mutate({ copyId: c.copyId, cardName: c.cardName, to: opt.to })
                      }
                    }}
                  >
                    <option value="">Choose…</option>
                    <option value="hand">In your hand</option>
                    {(places.data ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              )}
              <div className="mt-1 text-[length:var(--fs-sm)]">
                <span className="text-muted-foreground">Where to look next: </span>
                {c.lookNext.length === 0 && <span className="text-muted-foreground">You&apos;ve checked everywhere Oracle can think of.</span>}
                {c.lookNext.map((n, i) => {
                  const place = n.deckId ? { kind: 'deck' as const, id: n.deckId } : (n.locationId ?? unsortedId) ? { kind: 'location' as const, id: n.locationId ?? unsortedId } : null
                  return (
                    <span key={n.label}>
                      {i > 0 ? ', ' : ''}{n.deckId ? <Link className="underline" href={`/decks/${n.deckId}`}>{n.label}</Link> : n.label}
                      {c.stepId && place ? (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="min-h-11 text-[length:var(--fs-xs)] text-muted-foreground underline"
                            disabled={busy}
                            aria-label={`I checked ${n.label} for ${c.cardName}`}
                            onClick={() => checked.mutate({ stepId: c.stepId as number, cardName: c.cardName, place, label: n.label })}
                          >I checked here</button>
                        </>
                      ) : null}
                    </span>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  )
}
