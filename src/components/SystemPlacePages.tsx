'use client'

/**
 * The two system places: "In your hand" and "Missing". Spec: docs/oracle/specs/know-where-cards-are.md.
 * Placed it saves one tick at once (picklist_tick). Turned up on Missing is not built yet: it needs a stored routine
 * that is still waiting for the Architect and owner approval, so no button is shown for it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { toast } from 'sonner'
import { usePageHeader } from '@/contexts/PageHeaderContext'
import { Skeleton } from '@/components/ui/skeleton'
import type { SystemLocationsResponseWithDestinations as Data } from '@/lib/system-locations'

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

type Option = { value: string; label: string; to: { kind: 'deck'; deckId: number } | { kind: 'location'; locationId: number } }

function useOtherPlaces() {
  return useQuery<Option[]>({
    queryKey: ['import', 'destinations'],
    queryFn: async () => {
      const res = await fetch('/api/import/destinations')
      if (!res.ok) return []
      const d = (await res.json()) as { storage?: Array<{ locationId: number; name: string }>; decks?: Array<{ deckId: number; name: string }> }
      return [
        ...(d.storage ?? []).map((b) => ({ value: `l${b.locationId}`, label: `Box: ${b.name}`, to: { kind: 'location' as const, locationId: b.locationId } })),
        ...(d.decks ?? []).map((k) => ({ value: `d${k.deckId}`, label: `Deck: ${k.name}`, to: { kind: 'deck' as const, deckId: k.deckId } })),
      ]
    },
    staleTime: 60_000,
  })
}

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
                  aria-label={`Placed it: ${c.cardName}`}
                  onClick={() => place.mutate({
                    copyId: c.copyId, cardName: c.cardName,
                    to: c.destination!.kind === 'deck'
                      ? { kind: 'deck', deckId: c.destination!.deckId, ...(c.destination!.deckCardId ? { deckCardId: c.destination!.deckCardId } : {}) } as Option['to']
                      : { kind: 'location', locationId: c.destination!.locationId },
                  })}
                >Placed it</button>
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
  const { data, isLoading, isError, refetch } = useSystem()
  const cards = data?.missing.cards ?? []
  const fmt = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')
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
              </div>
              <div className="text-[length:var(--fs-sm)] text-muted-foreground">
                {c.lastSeenName ? `Last in ${c.lastSeenName}` : 'Last place not recorded'}{c.since ? ` · flagged ${fmt(c.since)}` : ''}
              </div>
              <div className="mt-1 text-[length:var(--fs-sm)]">
                <span className="text-muted-foreground">Where to look next: </span>
                {c.lookNext.map((n, i) => (
                  <span key={n.label}>{i > 0 ? ', ' : ''}{n.deckId ? <Link className="underline" href={`/decks/${n.deckId}`}>{n.label}</Link> : n.label}</span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  )
}
