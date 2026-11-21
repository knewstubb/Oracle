'use client'

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DeckViewSkeleton } from '@/components/DeckViewSkeleton'
import { cardStatusesQueryOptions } from '@/lib/deck-card-statuses-query'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { findCommanderCards } from '@/lib/commander-card-flag'
import { LegalityBanner } from '@/components/LegalityBanner'
import { BuildSelector } from '@/components/BuildSelector'
import { DeckRail } from '@/components/deck-rail/DeckRail'
import { DeckMenu } from '@/components/deck-rail/DeckMenu'
import { CardsTab } from '@/components/CardsTab'
import { AnalysisTab } from '@/components/AnalysisTab'
import { CombosPanel } from '@/components/CombosPanel'
import { UpgradeTab } from '@/components/UpgradeTab'
import { StrategyTab } from '@/components/StrategyTab'
import { PicklistV2 } from '@/components/PicklistV2'
import { WorkbenchTab } from '@/components/WorkbenchTab'
import { VersionHistoryPanel } from '@/components/VersionHistoryPanel'
import { StrategyBlock } from '@/components/deck-strategy/StrategyBlock'
import { DeckSettingsHost } from '@/components/deck-strategy/DeckSettingsHost'
import { LiveChangeNote } from '@/components/LiveChangeNote'
import { useLiveDeckRefresh } from '@/hooks/useLiveRefresh'
import { getFormatConfig } from '@/lib/format-config'
import { useOracle } from '@/contexts/OracleContext'
import { useDeckHoverPreload } from '@/hooks/useDeckHoverPreload'
import type { DeckCard } from '@/components/CardGrid'
import { deckKeys, createDeckInvalidators } from '@/hooks/useDeckQueryKeys'
import { isSecondCommander, parseCommandZoneRole } from '@/lib/command-zone'
import type { RailCommanderRow } from '@/components/deck-rail/RailCommander'
import { ImportResultLine } from '@/components/manabox-import/ImportResult'

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

  const [activeTab, setActiveTab] = useState<string>('cards')
  // The Strategy window's "See in History" opens the same Version History window the History button opens.
  const [historyOpen, setHistoryOpen] = useState(false)

  // Parallax scroll effect for commander art background
  const [parallaxOffset, setParallaxOffset] = useState(0)

  // Handle scroll on any tab content for parallax
  const handleContentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    // Only track scroll on tab content panels (have overflow-y-auto)
    if (target.getAttribute('data-slot') === 'tabs-content' || target.classList.contains('overflow-y-auto')) {
      // Move background at 8% of scroll speed for very subtle continuous parallax
      // With scale(1.5), we have ~25% extra on each side = ~200px max shift
      const rawOffset = target.scrollTop * 0.08
      const maxOffset = 150 // Safe limit within the scaled image bounds
      setParallaxOffset(Math.min(rawOffset, maxOffset))
    }
  }, [])

  // Open pull list tab if ?tab=picklist query param present. Adjust during
  // render (React's recommended alternative to a state-setting effect).
  const tabParam = searchParams.get('tab')
  const [prevTabParam, setPrevTabParam] = useState(tabParam)
  if (tabParam !== prevTabParam) {
    setPrevTabParam(tabParam)
    if (tabParam === 'picklist') {
      setActiveTab('picklist')
    }
  }

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

  // Card statuses are prefetched in parallel with the deck (CardsTab reads the same cache
  // entry) so status icons and the progress bar render with real data on first paint.
  const { isLoading: isStatusLoading } = useQuery({
    ...cardStatusesQueryOptions(deckId),
    enabled: !!deckId,
  })

  // Live refresh: while this deck is open and the tab is visible, notice when Claude changed it and refetch quietly.
  const live = useLiveDeckRefresh(deckId ? Number(deckId) : undefined)
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

  // Quietly preload hover-preview images in the background so the first hover is instant.
  useDeckHoverPreload(deckId, data?.cards)

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

  // Read import summary placed by the import flow before navigation.
  const [importSummary, setImportSummary] = useState<{
    inserted: number
    skipped: number
    basics: number
    proxies: number
    unsleeved: number
    unmatched: import('../../../../docs/oracle/contracts/manabox-import.types').ManaBoxUnmatchedLine[]
  } | null>(() => {
    if (typeof window === 'undefined') return null
    if (new URLSearchParams(window.location.search).get('freshImport') !== 'true') return null
    try {
      const raw = sessionStorage.getItem('manabox-import-summary')
      if (!raw) return null
      sessionStorage.removeItem('manabox-import-summary')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  if (isLoading || (isStatusLoading && !error)) {
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
  const totalValue = activeCards.reduce((sum, c) => sum + ((c.price_usd ?? 0) * (c.quantity || 1)), 0)

  const commanderCards = findCommanderCards(cards, deck.commander_name)
  const hasCommanderFormat = getFormatConfig(deck.format).hasCommander
  const commanders: RailCommanderRow[] = !hasCommanderFormat
    ? []
    : commanderCards.length > 0
      ? commanderCards.map((c) => ({
          name: c.card_name,
          // Per-commander identity from the card library; a lone commander falls back to the deck's stored identity.
          colourIdentity: c.color_identity ?? (commanderCards.length === 1 ? deck.colour_identity : null),
          role: isSecondCommander(c) ? parseCommandZoneRole(c.command_zone_role) : null,
        }))
      : deck.commander_name
        ? [{ name: deck.commander_name, colourIdentity: deck.colour_identity, role: null }]
        : []
  return (
    <div className="@container relative h-full overflow-y-auto @[800px]:overflow-hidden">
      {/* Blurred commander art background with parallax — hidden on mobile */}
      {deck.commander_scryfall_id && (
        <div
          className="pointer-events-none fixed inset-0 z-0 hidden overflow-hidden sm:block"
          aria-hidden="true"
          data-page-art
        >
          <img
            src={`https://cards.scryfall.io/art_crop/front/${deck.commander_scryfall_id.charAt(0)}/${deck.commander_scryfall_id.charAt(1)}/${deck.commander_scryfall_id}.jpg`}
            alt=""
            className="absolute inset-0 h-full w-full object-cover will-change-transform"
            style={{
              filter: 'blur(20px)',
              opacity: 0.4,
              transform: `scale(1.5) translateY(${parallaxOffset}px)`,
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

      {/* All page content — sits above the art layer. Narrow: one scrolling column. Wide: rail beside the workspace. */}
      <div className="relative z-10 flex min-h-full flex-col @[800px]:h-full @[800px]:flex-row">
      <DeckSettingsHost deckId={deck.id} deckName={deck.name} cards={activeCards} onSeeHistory={() => setHistoryOpen(true)}>
      <DeckRail
        deck={{
          id: deck.id,
          name: deck.name,
          commander_scryfall_id: deck.commander_scryfall_id,
          colour_identity: deck.colour_identity,
          deck_type: deck.deck_type,
          is_precon_mod: deck.deck_type === 'Precon Mod',
        }}
        commanders={commanders}
        cards={activeCards}
        totalCards={totalCards}
        deckSize={getFormatConfig(deck.format).deckSize}
        allCards={cards}
        secondCommanderScryfallId={commanderCards.find((c) => c.scryfall_id && c.scryfall_id !== deck.commander_scryfall_id)?.scryfall_id}
        totalValue={totalValue}
        strategySlot={<StrategyBlock deckId={deck.id} />}
      />
      </DeckSettingsHost>
      <div className="flex min-w-0 flex-1 flex-col @[800px]:min-h-0">
      {/* Fresh import result line */}
      {importSummary && (
        <div className="mx-auto max-w-[var(--content-max-width)] px-6 pt-2">
          <ImportResultLine
            inserted={importSummary.inserted}
            skipped={importSummary.skipped}
            basics={importSummary.basics}
            proxies={importSummary.proxies}
            unsleeved={importSummary.unsleeved}
            unmatched={importSummary.unmatched}
            onDismiss={() => setImportSummary(null)}
          />
        </div>
      )}

      {/* Legality Banner — shows if deck has illegal cards */}
      <LegalityBanner deckId={deck.id} />


      {/* Tabs + Content — scrolls independently beside the rail */}
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
          <div className="mx-auto flex max-w-[var(--content-max-width)] items-center gap-2">
            {/* Tab list with horizontally scrollable wrapper on mobile. The active-tab underline
                sits 5px below the list, so the wrapper pads/offsets 8px to contain it (otherwise
                overflow-x-auto forces a vertical scrollbar). */}
            <div className="-mb-2 min-w-0 flex-1 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsList variant="line" className="w-max">
                <TabsTrigger value="cards">Cards</TabsTrigger>
                <TabsTrigger value="picklist">Picklist</TabsTrigger>
                {/* Non-essential tabs hidden on mobile */}
                <TabsTrigger value="workbench" className="hidden sm:inline-flex">Workbench</TabsTrigger>
                <TabsTrigger value="analysis" className="hidden sm:inline-flex">Analysis</TabsTrigger>
                <TabsTrigger value="combos" className="hidden sm:inline-flex">Combos</TabsTrigger>
                <TabsTrigger value="upgrade" className="hidden sm:inline-flex">Upgrade</TabsTrigger>
                <TabsTrigger value="strategy" className="hidden sm:inline-flex">Strategy</TabsTrigger>
              </TabsList>
            </div>
            {(!deck.format || deck.format === 'commander') && <BuildSelector deckId={deck.id} />}
            <DeckMenu deckId={deck.id} deckName={deck.name} cards={cards} onOpenHistory={() => setHistoryOpen(true)} />
          </div>
        </div>

        <TabsContent value="cards" className="min-h-0 flex-1 px-6 py-6 @[800px]:overflow-y-auto">
          <div className="mx-auto max-w-[var(--content-max-width)]">
            <CardsTab
              cards={cards}
              deckId={deck.id}
              maxCopies={getFormatConfig(deck.deck_type).maxCopies}
              commanderName={deck.commander_name}
              showCommandZone={getFormatConfig(deck.format).hasCommander}
              deckTarget={getFormatConfig(deck.format).deckSize}
            />
          </div>
        </TabsContent>

        <TabsContent value="workbench" className="min-h-0 flex-1 @[800px]:overflow-hidden">
          <WorkbenchTab
            deckId={deck.id}
            cards={cards}
            commanderName={deck.commander_name}
            commanderScryfallId={deck.commander_scryfall_id}
          />
        </TabsContent>

        <TabsContent value="analysis" className="min-h-0 flex-1 px-6 py-6 @[800px]:overflow-y-auto">
          <div className="mx-auto max-w-[var(--content-max-width)]">
            <AnalysisTab
              cards={cards}
              deckId={deck.id}
              bracket={deck.bracket}
            />
          </div>
        </TabsContent>

        <TabsContent value="combos" className="min-h-0 flex-1 px-6 py-6 @[800px]:overflow-y-auto">
          <CombosPanel deckId={deck.id} />
        </TabsContent>

        <TabsContent value="upgrade" className="min-h-0 flex-1 px-6 py-6 @[800px]:overflow-y-auto">
          <UpgradeTab deckId={deck.id} />
        </TabsContent>

        <TabsContent value="strategy" className="min-h-0 flex-1 px-6 py-6 @[800px]:overflow-y-auto">
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

        <TabsContent value="picklist" className="min-h-0 flex-1 px-6 py-6 @[800px]:overflow-y-auto">
          <div className="mx-auto max-w-[var(--content-max-width)]">
            <PicklistV2 deckId={deck.id} />
          </div>
        </TabsContent>
      </Tabs>

      </div>{/* end workspace */}
      <VersionHistoryPanel hideTrigger deckId={deck.id} deckName={deck.name} open={historyOpen} onOpenChange={setHistoryOpen} />
      <LiveChangeNote note={live.note} onSeeHistory={() => { live.dismissNote(); setHistoryOpen(true) }} />
      </div>{/* end content wrapper (z-10) */}
    </div>
  )
}
