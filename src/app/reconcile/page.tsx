'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, PackageX } from 'lucide-react'
import { usePageHeader } from '@/contexts/PageHeaderContext'
import { NavItem } from '@/components/reconciliation/ReconciliationNav'
import { OverusedCardRow } from '@/components/reconcile/OverusedCardRow'
import type { ReconcileOverusedResponse } from '@/app/api/reconcile/overused/route'

type Selection = 'all' | `deck:${number}`

export default function ReconcilePage() {
  usePageHeader({
    title: 'Reconcile',
    subtitle: 'Cards that more decks want than you own originals of. Proxies are not counted.',
  })

  const [selection, setSelection] = useState<Selection>('all')

  const { data, isLoading, error } = useQuery<ReconcileOverusedResponse>({
    queryKey: ['reconcile', 'overused'],
    queryFn: async () => {
      const res = await fetch('/api/reconcile/overused')
      if (!res.ok) throw new Error(`Failed to load overused cards (HTTP ${res.status})`)
      return res.json()
    },
    staleTime: 60 * 1000,
  })

  const cards = useMemo(() => data?.cards ?? [], [data])

  const decks = useMemo(() => {
    const byId = new Map<number, { deckId: number; deckName: string; isActive: boolean; count: number }>()
    for (const card of cards) {
      for (const deck of card.decks) {
        const entry = byId.get(deck.deckId) ?? { ...deck, count: 0 }
        entry.count += 1
        byId.set(deck.deckId, entry)
      }
    }
    return [...byId.values()].sort((a, b) => a.deckName.localeCompare(b.deckName))
  }, [cards])

  const selectedDeckId = selection.startsWith('deck:') ? Number(selection.slice('deck:'.length)) : undefined
  const visible = selectedDeckId === undefined ? cards : cards.filter((c) => c.decks.some((d) => d.deckId === selectedDeckId))
  const selectedDeck = decks.find((d) => d.deckId === selectedDeckId)

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-canvas)] px-4 py-8">
      <div className="mx-auto w-full max-w-[1220px]">
        {isLoading ? (
          <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="h-48 animate-pulse rounded-xl bg-white/[0.04]" />
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[112px] animate-pulse rounded-xl bg-white/[0.04]" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-dashed border-[var(--signal-critical)]/40 px-4 py-12 text-center">
            <p className="text-[length:var(--fs-lg)] font-medium text-foreground">Unable to load overused cards.</p>
            <p className="mt-1 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-default)] px-4 py-16 text-center">
            <p className="text-[length:var(--fs-lg)] font-medium text-foreground">No cards are overused.</p>
            <p className="mt-1 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
              Every card is wanted by no more decks than the originals you own.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
            <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
              <nav aria-label="Overused card lists" className="flex flex-col gap-4">
                <NavItem
                  selected={selection === 'all'}
                  onClick={() => setSelection('all')}
                  icon={<PackageX className="size-4" />}
                  title="All overused"
                  subtitle="Every card wanted more than owned"
                  count={cards.length}
                />
                <div className="flex flex-col gap-1">
                  <h2 className="flex items-center gap-1.5 px-3 pb-1 text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    <Layers className="size-3" aria-hidden="true" />
                    Decks
                  </h2>
                  {decks.map((deck) => (
                    <NavItem
                      key={deck.deckId}
                      selected={selection === `deck:${deck.deckId}`}
                      onClick={() => setSelection(`deck:${deck.deckId}`)}
                      title={deck.deckName}
                      subtitle={deck.isActive ? 'Active' : 'Brew'}
                      count={deck.count}
                    />
                  ))}
                </div>
              </nav>
            </aside>

            <section aria-label={selectedDeck?.deckName ?? 'All overused'} className="flex min-w-0 flex-col gap-4">
              <header>
                <h2 className="text-[length:var(--fs-lg)] font-semibold text-foreground">
                  {selectedDeck?.deckName ?? 'All overused'}
                </h2>
                <p className="mt-0.5 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
                  {visible.length} card{visible.length === 1 ? '' : 's'} wanted by more decks than you own originals of.
                </p>
              </header>
              <div className="flex flex-col gap-3">
                {visible.map((card) => (
                  <OverusedCardRow key={card.cardName} card={card} focusDeckId={selectedDeckId} />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
