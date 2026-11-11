'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import type { DeckHealthGap, GapCard } from '@/lib/deck-health-gap'
import type { HealthRoleKey } from '@/lib/deck-health'

export interface GapDetailProps {
  deckId: number
  role: HealthRoleKey
  onBack: () => void
}

const GAP_TIMEOUT_MS = 20_000

const NOTHING_OWNED: Record<HealthRoleKey, string> = {
  ramp: "You don't own a card that adds ramp.",
  draw: "You don't own a card that adds draw.",
  removal: "You don't own a card that adds removal.",
  wipes: "You don't own a card that wipes the board.",
  lands: "You don't own a spare land that fits.",
}

function CardRow({ card }: { card: GapCard }) {
  const spare = card.status === 'SPARE'
  return (
    <li className="border-t py-2.5" style={{ borderColor: 'var(--border-default)' }}>
      <div className="text-[length:var(--fs-base)]" style={{ color: 'var(--text-primary)' }}>
        {card.name}
        {card.spareCopies > 1 ? <span style={{ color: 'var(--text-secondary)' }}> ×{card.spareCopies}</span> : null}
      </div>
      {spare ? (
        <span
          className="mt-1 inline-flex items-center gap-1 rounded-full border px-2 text-[length:var(--fs-sm)]"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
        >
          <Circle size={10} aria-hidden="true" />
          Available
        </span>
      ) : (
        <span
          className="mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[length:var(--fs-sm)]"
          style={{ backgroundColor: 'var(--signal-warning-bg)', color: 'var(--signal-warning)' }}
        >
          <AlertTriangle size={12} aria-hidden="true" />
          In {card.otherDeckName}
        </span>
      )}
    </li>
  )
}

/** Gap detail for one role: spare owned cards first, then cards in another deck (deck name only). Suggest-only. */
export function GapDetail({ deckId, role, onBack }: GapDetailProps) {
  const [showInDeck, setShowInDeck] = useState(false)
  const { data, isPending, isError, refetch } = useQuery<DeckHealthGap>({
    queryKey: [...deckKeys.health(deckId), 'gap', role],
    queryFn: async ({ signal }) => {
      // Hard stop: never wait silently. After 20 seconds the request is cancelled and the error with Try again shows.
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), GAP_TIMEOUT_MS)
      signal?.addEventListener('abort', () => controller.abort())
      try {
        const res = await fetch(`/api/decks/${deckId}/health/gap?role=${role}`, { signal: controller.signal })
        if (!res.ok) throw new Error('Failed to fetch gap detail')
        const body = await res.json()
        // A reply without the expected lists is an error, never a blank panel.
        if (!body || !Array.isArray(body.spare) || !Array.isArray(body.inAnotherDeck) || !Array.isArray(body.inDeckCards)) {
          throw new Error('Unexpected gap detail response')
        }
        return body as DeckHealthGap
      } finally {
        clearTimeout(timer)
      }
    },
    staleTime: 60 * 1000,
    // No automatic retries: a failure or timeout shows the error straight away, and Try again is the owner's call.
    retry: false,
  })
  const isLoading = isPending && !isError

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 min-h-11">
        <ChevronLeft aria-hidden="true" />
        Deck health
      </Button>

      {isLoading && (
        <div role="status" className="space-y-2">
          <p style={{ color: 'var(--text-primary)' }}>Looking through your cards…</p>
          <p className="text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>
            This can take a few seconds on a big collection.
          </p>
          <Skeleton className="h-12 w-full border" style={{ borderColor: 'var(--border-default)' }} />
        </div>
      )}

      {isError && !isLoading && (
        <div role="alert" className="space-y-2">
          <p className="flex items-center gap-1.5" style={{ color: 'var(--signal-critical)' }}>
            <AlertTriangle size={14} aria-hidden="true" />
            Couldn&apos;t check your cards.
          </p>
          <p style={{ color: 'var(--text-secondary)' }}>Your cards haven&apos;t changed.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {data && (
        <>
          <div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {data.label}
            </h3>
            <p className="text-[length:var(--fs-base)]" style={{ color: 'var(--text-primary)' }}>
              {data.label}: {data.have} of {data.typical}
            </p>
            <p className="text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>
              General guide
            </p>
          </div>

          {data.inDeckCount > 0 && (
            <div>
              <button
                type="button"
                aria-expanded={showInDeck}
                onClick={() => setShowInDeck((v) => !v)}
                className="min-h-11 text-left text-[length:var(--fs-sm)] underline underline-offset-2"
                style={{ color: 'var(--text-primary)' }}
              >
                See the {data.inDeckCount} {data.label.toLowerCase()} cards already in this deck
              </button>
              {showInDeck && (
                <ul aria-label={`${data.label} cards in this deck`} className="text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>
                  {data.inDeckCards.map((c) => (
                    <li key={c.name}>
                      {c.name}
                      {c.quantity > 1 ? ` ×${c.quantity}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!data.coloursKnown && (
            <p role="status" className="text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-warning)' }}>
              Couldn&apos;t work out this deck&apos;s colours, so no cards are listed.
            </p>
          )}

          {data.coloursKnown && data.spare.length === 0 && data.inAnotherDeck.length === 0 && (
            <p className="rounded-lg border px-3 py-2.5 font-medium" style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}>
              {NOTHING_OWNED[data.role]}
            </p>
          )}

          {data.spare.length > 0 && (
            <section aria-label="Spare">
              <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Spare ({data.spareTotal})
              </h4>
              <p className="text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>
                Free now.
              </p>
              <ul>
                {data.spare.map((c) => (
                  <CardRow key={c.name} card={c} />
                ))}
              </ul>
            </section>
          )}

          {data.inAnotherDeck.length > 0 && (
            <section aria-label="In another deck">
              <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                In another deck ({data.inAnotherDeckTotal})
              </h4>
              <ul>
                {data.inAnotherDeck.map((c) => (
                  <CardRow key={c.name} card={c} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
