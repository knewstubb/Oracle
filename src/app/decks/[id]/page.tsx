'use client'

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { AlertCircle, RefreshCw, ClipboardCopy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PersistentHeader } from '@/components/PersistentHeader'
import { LegalityBanner } from '@/components/LegalityBanner'
import { ActiveToggle } from '@/components/ActiveToggle'
import { DeleteDeckButton } from '@/components/DeleteDeckButton'
import { HealthStrip } from '@/components/HealthStrip'
import { CardsTab } from '@/components/CardsTab'
import { AnalysisTab } from '@/components/AnalysisTab'
import { CombosPanel } from '@/components/CombosPanel'
import { UpgradeTab } from '@/components/UpgradeTab'
import { StrategyTab } from '@/components/StrategyTab'
import { PicklistV2 } from '@/components/PicklistV2'
import { WorkbenchTab } from '@/components/WorkbenchTab'
import { VersionHistoryPanel } from '@/components/VersionHistoryPanel'
import { getFormatConfig } from '@/lib/format-config'
import { exportDeckAsText } from '@/lib/deck-export'
import { useOracle } from '@/contexts/OracleContext'
import { toast } from 'sonner'
import { CardGrid, type DeckCard } from '@/components/CardGrid'
import { deckKeys, createDeckInvalidators } from '@/hooks/useDeckQueryKeys'

interface Deck {
  id: number
  name: string
  commander_name: string
  commander_scryfall_id: string
  commander_id: string | null
  build_id: string | null
  colour_identity: string
  card_count: number
  deck_type: string | null
  precon_url: string | null
  bracket: string | null
  status: 'brewing' | 'in_rotation' | 'graveyard' // Legacy, being phased out
  is_active: boolean
  last_synced_at: string | null
  raw_json: string | null
  format: string | null
  // Commander metadata from ref_commanders
  salt_score: number | null
  edhrec_rank: number | null
  edhrec_deck_count: number | null
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
  const { setContext } = useOracle()

  // State for health pill → Cards tab scroll targeting
  const [scrollTarget, setScrollTarget] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('cards')

  // Parallax scroll effect for commander art background
  const [parallaxOffset, setParallaxOffset] = useState(0)

  // Handle scroll on any tab content for parallax
  const handleContentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    // Only track scroll on tab content panels (have overflow-y-auto)
    if (target.getAttribute('data-slot') === 'tabs-content' || target.classList.contains('overflow-y-auto')) {
      // Move background at 20% of scroll speed for smoother parallax
      // With scale(1.25), we have ~12.5% extra on each side = ~100px max shift
      const rawOffset = target.scrollTop * 0.2
      const maxOffset = 80 // Safe limit within the scaled image bounds
      setParallaxOffset(Math.min(rawOffset, maxOffset))
    }
  }, [])

  // Open pull list tab if ?tab=picklist query param present
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'picklist') {
      setActiveTab('picklist')
    }
  }, [searchParams])

  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery<DeckResponse>({
    queryKey: deckKeys.detail(deckId),
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
    queryKey: deckKeys.health(deckId),
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/health`)
      if (!res.ok) throw new Error('Failed to fetch health data')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!deckId,
  })

  // Set Oracle context when deck data loads
  useEffect(() => {
    if (data?.deck) {
      setContext({
        type: 'deck',
        deckId: data.deck.id,
        deckName: data.deck.name,
        commanderName: data.deck.commander_name,
      })
    }
  }, [data?.deck, setContext])

  // Fresh import: delayed refetch to pick up auto-assign results
  // Auto-assign runs fire-and-forget after import — this gives it time to complete
  useEffect(() => {
    const isFreshImport = searchParams.get('freshImport') === 'true'
    if (!isFreshImport) return

    const timer = setTimeout(() => {
      const { invalidateDeck } = createDeckInvalidators(queryClient)
      invalidateDeck(deckId)
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
      {/* Blurred commander art background with parallax */}
      {deck.commander_scryfall_id && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-full overflow-hidden"
          aria-hidden="true"
        >
          <img
            src={`https://cards.scryfall.io/art_crop/front/${deck.commander_scryfall_id.charAt(0)}/${deck.commander_scryfall_id.charAt(1)}/${deck.commander_scryfall_id}.jpg`}
            alt=""
            className="absolute inset-0 h-full w-full object-cover will-change-transform"
            style={{
              filter: 'blur(20px)',
              opacity: 0.4,
              transform: `scale(1.25) translateY(${parallaxOffset}px)`,
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
            <VersionHistoryPanel deckId={deck.id} deckName={deck.name} />
            <ActiveToggle deckId={deck.id} isActive={deck.is_active} />
            <DeleteDeckButton deckId={deck.id} deckName={deck.name} />
          </>
        }
      />

      {/* Legality Banner — shows if deck has illegal cards */}
      <LegalityBanner deckId={deck.id} />

      {/* Tabs + Content — scrolls independently beneath sticky header+health strip */}
      <Tabs
        defaultValue="cards"
        value={activeTab}
        onValueChange={(val) => {
          setActiveTab(val as string)
          setParallaxOffset(0) // Reset parallax when switching tabs
        }}
        className="flex min-h-0 flex-1 flex-col"
        onScrollCapture={handleContentScroll}
      >
        <div className="shrink-0 border-b border-border px-6">
          <div className="mx-auto max-w-[var(--content-max-width)]">
            <TabsList variant="line">
              <TabsTrigger value="cards">Cards</TabsTrigger>
              <TabsTrigger value="workbench">Workbench</TabsTrigger>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
              <TabsTrigger value="combos">Combos</TabsTrigger>
              <TabsTrigger value="upgrade">Upgrade</TabsTrigger>
              <TabsTrigger value="strategy">Strategy</TabsTrigger>
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

        <TabsContent value="workbench" className="min-h-0 flex-1 overflow-hidden">
          <WorkbenchTab
            deckId={deck.id}
            cards={cards}
            commanderName={deck.commander_name}
            commanderScryfallId={deck.commander_scryfall_id}
          />
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
              commanderId={deck.commander_id}
              buildId={deck.build_id}
              cards={cards}
            />
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
      />
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
