'use client'

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PersistentHeader } from '@/components/PersistentHeader'
import { StatusControl } from '@/components/StatusControl'
import { DeleteDeckButton } from '@/components/DeleteDeckButton'
import { AllocateToggle } from '@/components/AllocateToggle'
import { HealthStrip } from '@/components/HealthStrip'
import { DraftBanner } from '@/components/DraftBanner'
import { CardsTab } from '@/components/CardsTab'
import { AnalysisTab } from '@/components/AnalysisTab'
import { CombosPanel } from '@/components/CombosPanel'
import { UpgradeTab } from '@/components/UpgradeTab'
import { StrategyTab } from '@/components/StrategyTab'
import { CardGrid, type DeckCard } from '@/components/CardGrid'
import { DebriefPanel } from '@/components/DebriefPanel'

interface Deck {
  id: number
  name: string
  commander_name: string
  commander_scryfall_id: string
  colour_identity: string
  card_count: number
  deck_type: string | null
  precon_url: string | null
  bracket: string | null
  status: 'brew' | 'boxed' | 'archived'
  allocate: boolean
  last_synced_at: string | null
  raw_json: string | null
}

interface DeckResponse {
  deck: Deck
  cards: DeckCard[]
  brewSessionId: number | null
}

function parsePrimaryCategory(raw: string | null | undefined): string {
  if (!raw) return 'Other'
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string')
      return parsed[0].replace(/\(top\)|\(bottom\)/gi, '').trim()
  } catch { /* */ }
  return raw.split(',')[0]?.trim().replace(/\(top\)|\(bottom\)/gi, '') || 'Other'
}

export default function DeckViewPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const deckId = params.id

  // State for health pill → Cards tab scroll targeting
  const [scrollTarget, setScrollTarget] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('cards')
  const [showDebrief, setShowDebrief] = useState(false)

  // Auto-open debrief overlay if ?debrief=true query param present
  useEffect(() => {
    if (searchParams.get('debrief') === 'true') {
      setShowDebrief(true)
    }
  }, [searchParams])

  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery<DeckResponse>({
    queryKey: ['decks', deckId],
    queryFn: () =>
      fetch(`/api/decks/${deckId}`).then((r) => {
        if (!r.ok) throw new Error('Failed to load deck')
        return r.json()
      }),
    staleTime: 5 * 60 * 1000,
    enabled: !!deckId,
  })

  // Health data query — deduped with HealthStrip's internal fetch by TanStack Query
  const { data: healthData } = useQuery({
    queryKey: ['decks', deckId, 'health'],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/health`)
      if (!res.ok) throw new Error('Failed to fetch health data')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!deckId,
  })

  // Fresh import: delayed refetch to pick up auto-assign results
  // Auto-assign runs fire-and-forget after import — this gives it time to complete
  useEffect(() => {
    const isFreshImport = searchParams.get('freshImport') === 'true'
    if (!isFreshImport) return

    const timer = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'health'] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'picklist'] })
    }, 3000)

    return () => clearTimeout(timer)
  }, [deckId, searchParams, queryClient])

  // HealthStrip pill click → switch to Cards tab and scroll to category
  const handlePillClick = useCallback((category: string) => {
    setActiveTab('cards')
    setScrollTarget(category)
  }, [])

  if (isLoading) {
    return <DeckViewSkeleton />
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1280px] px-6 py-6">
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-[length:var(--fs-md)] text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            Couldn&apos;t load deck. {(error as Error).message}
          </span>
          <Button variant="destructive" size="sm" onClick={() => refetch()}>
            <RefreshCw className="size-3.5" aria-hidden="true" data-icon="inline-start" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { deck, cards, brewSessionId } = data

  // Filter out Maybeboard/Sideboard for counts
  const activeCards = cards.filter(c => {
    const primary = parsePrimaryCategory(c.categories)
    return primary !== 'Maybeboard' && primary !== 'Sideboard'
  })
  const totalCards = activeCards.reduce((sum, c) => sum + (c.quantity || 1), 0)
  const proxyCount = activeCards.filter(c => c.allocation_role === 'proxy').reduce((sum, c) => sum + (c.quantity || 1), 0)

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
      {/* Persistent Header — sticky at top */}
      <PersistentHeader
        deck={deck}
        totalCards={totalCards}
        proxyCount={proxyCount}
        onDebriefClick={() => setShowDebrief(true)}
        actions={
          <>
            <AllocateToggle deckId={deck.id} deckStatus={deck.status as any} allocate={deck.allocate ?? false} />
            <StatusControl deckId={deck.id} currentStatus={deck.status as any} allocate={deck.allocate ?? false} />
            {(deck.status === 'brew' || deck.status === 'archived') && (
              <DeleteDeckButton deckId={deck.id} deckName={deck.name} />
            )}
          </>
        }
      />

      {/* Health Strip — sticky below header */}
      <HealthStrip
        deckId={deck.id}
        onPillClick={handlePillClick}
      />

      {/* Draft Banner — shown only for brew decks */}
      {deck.status === 'brew' && (
        <DraftBanner
          deckId={deck.id}
          deckName={deck.name}
          cardCount={totalCards}
          brewSessionId={brewSessionId}
          status={deck.status}
          onDeleted={() => router.push('/')}
        />
      )}

      {/* Tabs + Content — scrolls independently beneath sticky header+health strip */}
      <Tabs
        defaultValue="cards"
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as string)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b border-border px-6">
          <div className="mx-auto max-w-[1280px]">
            <TabsList variant="line">
              <TabsTrigger value="cards">Cards</TabsTrigger>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
              <TabsTrigger value="combos">Combos</TabsTrigger>
              <TabsTrigger value="upgrade">Upgrade</TabsTrigger>
              <TabsTrigger value="strategy">Strategy</TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="cards" className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-[1080px]">
            <CardsTab
              cards={cards}
              deckId={deck.id}
              healthCategories={healthData?.categories}
              scrollToCategory={scrollTarget}
            />
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-[1080px]">
            <AnalysisTab
              cards={cards}
              deckId={deck.id}
              bracket={deck.bracket}
            />
          </div>
        </TabsContent>

        <TabsContent value="combos" className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <CombosPanel deckId={deck.id} />
        </TabsContent>

        <TabsContent value="upgrade" className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <UpgradeTab deckId={deck.id} />
        </TabsContent>

        <TabsContent value="strategy" className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-[720px]">
            <StrategyTab
              deckId={deck.id}
              deckType={deck.deck_type}
              commanderName={deck.commander_name}
              cards={cards}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Debrief overlay */}
      {showDebrief && (
        <DebriefPanel
          deckId={deck.id}
          commanderName={deck.commander_name}
          onClose={() => setShowDebrief(false)}
        />
      )}
    </div>
  )
}

function DeckViewSkeleton() {
  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
      <header className="shrink-0 border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-[1280px] items-center gap-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
      </header>
      <div className="flex items-center gap-2 px-6 py-2">
        <Skeleton className="h-7 w-20 rounded-md" />
        <Skeleton className="h-7 w-20 rounded-md" />
        <Skeleton className="h-7 w-24 rounded-md" />
        <Skeleton className="h-7 w-20 rounded-md" />
        <Skeleton className="h-7 w-24 rounded-md" />
      </div>
      <div className="flex-1 px-6 py-6">
        <div className="mx-auto max-w-[960px]">
          <CardGrid cards={[]} isLoading />
        </div>
      </div>
    </div>
  )
}
