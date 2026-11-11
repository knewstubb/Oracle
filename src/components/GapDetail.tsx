'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Ban, ChevronLeft, ChevronRight, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CardImage } from '@/components/CardImage'
import { MobileCardPreview } from '@/components/MobileCardPreview'
import { useCardHoverPreview } from '@/components/CardHoverPreview'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import type { DeckHealthGap, GapCard } from '@/lib/deck-health-gap'
import { formatPrice, type BuyIdea } from '@/lib/deck-health-buy'
import type { HealthRoleKey } from '@/lib/deck-health'

export interface GapDetailProps {
  deckId: number
  role: HealthRoleKey
  onBack: () => void
}

/** Screen gives up after this long. Development gets longer: the first request also compiles the route. */
const GAP_TIMEOUT_MS = process.env.NODE_ENV === 'development' ? 40_000 : 20_000

const NOTHING_OWNED: Record<HealthRoleKey, string> = {
  ramp: "You don't own a card that adds ramp.",
  draw: "You don't own a card that adds draw.",
  removal: "You don't own a card that adds removal.",
  wipes: "You don't own a card that wipes the board.",
  lands: "You don't own a spare land that fits.",
}

function CardRow({ card }: { card: GapCard | BuyIdea }) {
  const buy = !('status' in card)
  const spare = !buy && card.status === 'SPARE'
  const spareCopies = 'spareCopies' in card ? card.spareCopies : 0
  const otherDeckName = 'otherDeckName' in card ? card.otherDeckName : null
  const [previewOpen, setPreviewOpen] = useState(false)
  // Existing hover preview: shows the full card beside the pointer, kept inside the window. It does nothing without an image.
  const { triggerProps } = useCardHoverPreview({ scryfallId: card.printingId, cardName: card.name })
  // Keyboard: focusing the thumbnail shows the same preview, placed beside the thumbnail.
  const onThumbFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    triggerProps.onMouseEnter({ clientX: r.right, clientY: r.top } as React.MouseEvent)
  }
  return (
    <li className="flex items-stretch gap-2.5 border-t py-2.5" style={{ borderColor: 'var(--border-default)' }}>
      {/* Thumbnail: as tall as the text block (top of the name to bottom of the detail line); lazy-loaded; plain box when no image is known. */}
      <div
        data-testid="gap-thumb"
        className="relative w-[42px] min-h-[56px] shrink-0 self-stretch overflow-hidden rounded-[4px] border"
        style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-hover)' }}
        aria-hidden={card.printingId ? undefined : true}
        {...(card.printingId
          ? {
              ...triggerProps,
              tabIndex: 0,
              role: 'img',
              'aria-label': `Preview of ${card.name}`,
              onFocus: onThumbFocus,
              onBlur: triggerProps.onMouseLeave,
            }
          : {})}
      >
        {card.printingId ? (
          <CardImage scryfallId={card.printingId} alt={card.name} width={42} height={59} noPreview className="h-full w-full" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            title={card.name}
            className="min-w-0 flex-1 truncate text-left text-[length:var(--fs-base)] font-semibold hover:underline"
            style={{ color: 'var(--text-primary)' }}
          >
            {card.name}
            {spareCopies > 1 ? <span className="font-normal" style={{ color: 'var(--text-secondary)' }}> ×{spareCopies}</span> : null}
          </button>
          {buy ? (
            <span data-testid="gap-price" className="shrink-0 text-[length:var(--fs-sm)] font-medium" style={{ color: 'var(--text-primary)' }}>
              {formatPrice(card.price)}
            </span>
          ) : spare ? (
            <span
              data-testid="gap-badge"
              className="inline-flex max-w-[50%] shrink-0 items-center gap-1 rounded-full border px-2 text-[length:var(--fs-sm)]"
              style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
            >
              <Circle size={10} aria-hidden="true" />
              Available
            </span>
          ) : (
            <span
              data-testid="gap-badge"
              className="inline-flex max-w-[50%] shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[length:var(--fs-sm)]"
              style={{ backgroundColor: 'var(--signal-warning-bg)', color: 'var(--signal-warning)' }}
            >
              <AlertTriangle size={12} aria-hidden="true" className="shrink-0" />
              <span className="truncate">In {otherDeckName}</span>
            </span>
          )}
        </div>
        {card.detailLine ? (
          <p data-testid="gap-line" className="mt-0.5 text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>
            {card.detailLine}
          </p>
        ) : null}
        {buy && card.inclusionPct !== null ? (
          <p data-testid="gap-popularity" className="text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>
            In {card.inclusionPct}% of decks on EDHREC
          </p>
        ) : null}
        {buy ? (
          <span
            data-testid="gap-badge"
            className="mt-1 inline-flex items-center gap-1 rounded-full border px-2 text-[length:var(--fs-sm)]"
            style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
          >
            <Ban size={10} aria-hidden="true" />
            Unowned
          </span>
        ) : null}
      </div>
      <MobileCardPreview cardName={card.name} scryfallId={card.printingId} isOpen={previewOpen} onClose={() => setPreviewOpen(false)} />
    </li>
  )
}

/** Gap detail for one role: spare owned cards first, then cards in another deck (deck name only). Suggest-only. */
export class GapRequestError extends Error {
  constructor(public reason: string) {
    super(reason)
  }
}

/** Short text for the small grey line under the error, so a failure can be told apart without opening developer tools. */
export function gapErrorReason(err: unknown): string {
  if (err instanceof GapRequestError) return err.reason
  return 'unknown error'
}

export function GapDetail({ deckId, role, onBack }: GapDetailProps) {
  const [showInDeck, setShowInDeck] = useState(false)
  const { data, error, isPending, isError, refetch } = useQuery<DeckHealthGap>({
    queryKey: [...deckKeys.health(deckId), 'gap', role],
    queryFn: async ({ signal }) => {
      // Hard stop: never wait silently. After the limit the request is cancelled and the error with Try again shows.
      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, GAP_TIMEOUT_MS)
      signal?.addEventListener('abort', () => controller.abort())
      try {
        let res: Response
        try {
          res = await fetch(`/api/decks/${deckId}/health/gap?role=${role}`, { signal: controller.signal })
        } catch {
          throw new GapRequestError(timedOut ? 'timeout' : 'network error')
        }
        if (!res.ok) throw new GapRequestError(`server error ${res.status}`)
        let body: Partial<DeckHealthGap> | null = null
        try {
          body = await res.json()
        } catch {
          throw new GapRequestError(timedOut ? 'timeout' : 'unreadable reply')
        }
        // A reply without the expected lists is an error, never a blank panel.
        if (!body || !Array.isArray(body.spare) || !Array.isArray(body.inAnotherDeck) || !Array.isArray(body.inDeckCards)) {
          throw new GapRequestError('unexpected reply')
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
          <p data-testid="gap-error-reason" className="text-[length:var(--fs-xs)]" style={{ color: 'var(--text-secondary)' }}>
            Reason: {gapErrorReason(error)}
          </p>
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

          <BuyIdeasGroup
            ideas={data.buyIdeas ?? []}
            defaultOpen={Boolean(data.buyDefaultOpen)}
            reason={data.buyUnavailableReason ?? null}
          />
        </>
      )}
    </div>
  )
}

/** Buy ideas: collapsed with a count when owned options exist, open when nothing owned fits. Suggest-only (no buy button). */
function BuyIdeasGroup({ ideas, defaultOpen, reason }: { ideas: BuyIdea[]; defaultOpen: boolean; reason: DeckHealthGap['buyUnavailableReason'] }) {
  const [open, setOpen] = useState(defaultOpen)
  if (reason === 'thin_data') {
    return (
      <p data-testid="buy-thin" className="rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}>
        <span className="font-medium">No buy ideas yet.</span>{' '}
        <span style={{ color: 'var(--text-secondary)' }}>No popularity data for this commander, so nothing is guessed.</span>
      </p>
    )
  }
  if (reason === 'lookup_failed') {
    return (
      <p role="status" data-testid="buy-failed" className="text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-warning)' }}>
        Couldn&apos;t check buy ideas just now. Your owned cards above are fine.
      </p>
    )
  }
  if (ideas.length === 0) return null
  return (
    <section aria-label="Buy ideas" className="border-t pt-2" style={{ borderColor: 'var(--border-default)' }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-1.5 text-left font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        <ChevronRight size={14} aria-hidden="true" className={open ? 'rotate-90 transition-transform' : 'transition-transform'} />
        Buy ideas ({ideas.length}) · estimates
      </button>
      {open && (
        <ul>
          {ideas.map((c) => (
            <CardRow key={c.name} card={c} />
          ))}
        </ul>
      )}
    </section>
  )
}
