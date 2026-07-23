'use client'

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { AlertCircle, RefreshCw, ClipboardCopy } from 'lucide-react'
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
import { PicklistV2 } from '@/components/PicklistV2'
import { GoldfishTab } from '@/components/GoldfishTab'
import { getFormatConfig } from '@/lib/format-config'
import { exportDeckAsText } from '@/lib/deck-export'
import { toast } from 'sonner'
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
  status: 'brewing' | 'in_rotation' | 'graveyard'
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
    // Open pull list tab if ?tab=picklist query param present
    const tabParam = searchParams.get('tab')
    if (tabParam === 'picklist') {
      setActiveTab('picklist')
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
      <div className="mx-auto max-w-[var(--content-max-width)] px-6 py-6">
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
  const totalValue = activeCards.reduce((sum, c) => sum + ((c.price_usd ?? 0) * (c.quantity || 1)), 0)

  return (
    <div className="relative flex h-full flex-col">
      {/* Blurred commander art background */}
      {deck.commander_scryfall_id && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-full overflow-hidden"
          aria-hidden="true"
        >
          <img
            src={`https://cards.scryfall.io/art_crop/front/${deck.commander_scryfall_id.charAt(0)}/${deck.commander_scryfall_id.charAt(1)}/${deck.commander_scryfall_id}.jpg`}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              filter: 'blur(20px)',
              opacity: 0.4,
              transform: 'scale(1.1)',
            }}
          />
          {/* Gradient fade — more visible at top, fades out toward bottom */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to bottom, transparent 30%, var(--bg-canvas) 90%)',
            }}
          />
        </div>
      )}

      {/* All page content — sits above the art layer */}
      <div className="relative z-10 flex h-full flex-col">

      {/* Persistent Header — sticky at top */}
      <PersistentHeader
        deck={deck}
        totalCards={totalCards}
        proxyCount={proxyCount}
        totalValue={totalValue}
        onDebriefClick={() => setShowDebrief(true)}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const text = exportDeckAsText(cards)
                navigator.clipboard.writeText(text).then(
                  () => toast.success('Decklist copied to clipboard'),
                  () => toast.error('Failed to copy')
                )
              }}
              className="text-[length:var(--fs-md)]"
              aria-label="Copy decklist to clipboard"
            >
              <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <AllocateToggle deckId={deck.id} deckStatus={deck.status as any} allocate={deck.allocate ?? false} />
            <StatusControl deckId={deck.id} currentStatus={deck.status as any} allocate={deck.allocate ?? false} cardCount={deck.card_count ?? 0} format={deck.format ?? 'commander'} />
            {(deck.status === 'brewing' || deck.status === 'in_rotation' || deck.status === 'graveyard') && (
              <DeleteDeckButton deckId={deck.id} deckName={deck.name} />
            )}
          </>
        }
      />

      {/* Draft Banner — shown only for brew decks */}
      {deck.status === 'brewing' && (
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
          <div className="mx-auto max-w-[var(--content-max-width)]">
            <TabsList variant="line">
              <TabsTrigger value="cards">Cards</TabsTrigger>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
              <TabsTrigger value="combos">Combos</TabsTrigger>
              <TabsTrigger value="upgrade">Upgrade</TabsTrigger>
              <TabsTrigger value="strategy">Strategy</TabsTrigger>
              <TabsTrigger value="goldfish">Goldfish</TabsTrigger>
              <TabsTrigger value="picklist">Pull List</TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="cards" className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-[var(--content-max-width)]">
            <CardsTab
              cards={cards}
              deckId={deck.id}
              healthCategories={healthData?.categories}
              scrollToCategory={scrollTarget}
              onViewPicklist={() => setActiveTab('picklist')}
              maxCopies={getFormatConfig(deck.deck_type).maxCopies}
            />
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-[var(--content-max-width)]">
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
          <div className="mx-auto max-w-[var(--content-max-width)]">
            <StrategyTab
              deckId={deck.id}
              deckType={deck.deck_type}
              commanderName={deck.commander_name}
              cards={cards}
            />
          </div>
        </TabsContent>

        <TabsContent value="goldfish" className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-[var(--content-max-width)]">
            <GoldfishTab cards={cards} />
          </div>
        </TabsContent>

        <TabsContent value="picklist" className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-[var(--content-max-width)]">
            <PicklistV2 deckId={deck.id} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Health Strip — bottom of page */}
      <HealthStrip
        deckId={deck.id}
        onPillClick={handlePillClick}
      />

      {/* Debrief overlay */}
      {showDebrief && (
        <DebriefPanel
          deckId={deck.id}
          commanderName={deck.commander_name}
          onClose={() => setShowDebrief(false)}
        />
      )}
      </div>{/* end content wrapper (z-10) */}
    </div>
  )
}

function DeckViewSkeleton() {
  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
      <header className="shrink-0 border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-[var(--content-max-width)] items-center gap-4">
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
        <div className="mx-auto max-w-[var(--content-max-width)]">
          <CardGrid cards={[]} isLoading />
        </div>
      </div>
    </div>
  )
}
