'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusFilter } from '@/components/StatusFilter'
import { DeckImportButton } from '@/components/DeckImportButton'
import { NewDeckModal } from '@/components/NewDeckModal'
import { DeckTile } from '@/components/DeckTile'
import { DraftSessionTile } from '@/components/DraftSessionTile'
import { PageHeader } from '@/components/PageHeader'

interface Deck {
  id: number
  name: string
  commander_name: string
  commander_scryfall_id: string
  colour_identity: string
  card_count: number
  deck_type: string | null
  status: 'brewing' | 'in_rotation' | 'graveyard'
  allocate: boolean
  completeness?: { resolved: number; total: number } | null
}

interface DraftSession {
  session_id: number
  commander_name: string | null
  status: string
  updated_at: string
  colour_identity: string | null
}

interface DecksResponse {
  decks: Deck[]
  draftSessions: DraftSession[]
}

export default function DashboardPage() {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<DecksResponse>({
    queryKey: ['decks'],
    queryFn: () => fetch('/api/decks').then(r => {
      if (!r.ok) throw new Error('Failed to load decks')
      return r.json()
    }),
    staleTime: 5 * 60 * 1000,
  })

  const decks = data?.decks
  const draftSessions = data?.draftSessions

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
      <div className="mx-auto flex h-full w-full max-w-[var(--content-max-width)] flex-col">
      <PageHeader
        title="Decks"
        actions={
          <>
            <DeckImportButton />
            <NewDeckModal />
          </>
        }
      />

      <div className="flex-1 overflow-y-auto px-5 py-5">
      <StatusFilter className="mb-6" />
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-[length:var(--fs-md)] text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            Couldn&apos;t load decks. {(error as Error).message}
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['decks'] })}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" data-icon="inline-start" />
            Retry
          </Button>
        </div>
      )}

      {isLoading ? (
        <div
          role="list"
          aria-label="Loading decks"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} role="listitem" className="overflow-hidden rounded-2xl bg-[#F6F3EE] dark:bg-card [box-shadow:0px_1px_3px_rgba(0,0,0,0.12),0px_4px_8px_3px_rgba(0,0,0,0.06)]">
              <Skeleton className="aspect-[4/3] w-full rounded-none" />
              <div className="px-4 pb-2 pt-3 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-none" />
            </div>
          ))}
        </div>
      ) : decks && decks.length === 0 && (!draftSessions || draftSessions.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="mb-4 text-muted-foreground">
            No decks found. Import a deck to get started.
          </p>
          <DeckImportButton />
          <Link
            href="/onboarding"
            className="text-[length:var(--fs-sm)] text-muted-foreground underline hover:text-foreground transition-colors mt-3"
          >
            Or import your full Archidekt collection
          </Link>
        </div>
      ) : decks && decks.length > 0 || (draftSessions && draftSessions.length > 0) ? (
        <>
        <div
          role="list"
          aria-label="Deck list"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          {draftSessions && draftSessions.map((session) => (
            <div key={`draft-${session.session_id}`} role="listitem">
              <DraftSessionTile
                sessionId={session.session_id}
                commanderName={session.commander_name}
                status={session.status}
                updatedAt={session.updated_at}
                colourIdentity={session.colour_identity ? session.colour_identity.split(',').flatMap(s => s.trim().length === 1 ? [s.trim()] : s.trim().split('')) : []}
              />
            </div>
          ))}
          {decks && decks.map((deck) => (
            <div key={deck.id} role="listitem">
              <DeckTile
                id={deck.id}
                name={deck.name}
                commanderName={deck.commander_name}
                commanderScryfallId={deck.commander_scryfall_id}
                colourIdentity={deck.colour_identity ? deck.colour_identity.split(',').flatMap(s => s.trim().length === 1 ? [s.trim()] : s.trim().split('')) : []}
                cardCount={deck.card_count}
                status={deck.status}
                completeness={deck.completeness}
                allocate={deck.allocate}
                format={deck.format}
                pipDistribution={deck.pipDistribution}
              />
            </div>
          ))}
        </div>

        {/* Rotation summary */}
        {(() => {
          if (!decks) return null
          const inRotation = decks.filter((d: any) => d.status === 'in_rotation')
          const needsCards = inRotation.filter((d: any) => d.completeness && d.completeness.resolved < d.completeness.total)
          if (inRotation.length === 0) return null
          return (
            <div className="mt-4 flex items-center gap-3 text-[length:var(--fs-sm)] text-muted-foreground">
              <span>{inRotation.length} {inRotation.length === 1 ? 'deck' : 'decks'} in rotation</span>
              {needsCards.length > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[length:var(--fs-xs)] font-medium transition-colors hover:bg-[rgba(228,75,74,0.1)]"
                  style={{ color: 'var(--signal-critical)' }}
                >
                  <AlertTriangle className="size-3" aria-hidden="true" />
                  {needsCards.length} {needsCards.length === 1 ? 'deck needs' : 'decks need'} cards
                </button>
              )}
            </div>
          )
        })()}
        </>
      ) : null}
      </div>{/* end scrollable content */}
      </div>{/* end max-width container */}
    </div>
  )
}
