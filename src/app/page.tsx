'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DeckImportButton } from '@/components/DeckImportButton'
import { NewDeckModal } from '@/components/NewDeckModal'
import { DeckTile } from '@/components/DeckTile'
import { DeckStatusCard } from '@/components/DeckStatusCard'
import { FolderChip, NewFolderChip } from '@/components/FolderChip'
import { CreateFolderModal } from '@/components/CreateFolderModal'
import { PageHeader } from '@/components/PageHeader'
import { CardImage } from '@/components/CardImage'
import { useOracleContext } from '@/contexts/OracleContext'
import { toast } from 'sonner'

interface Deck {
  id: number
  name: string
  commander_name: string
  commander_scryfall_id: string
  colour_identity: string
  card_count: number
  deck_type: string | null
  status: 'brewing' | 'in_rotation' | 'graveyard' // Legacy, being phased out
  is_active: boolean
  completeness?: { resolved: number; total: number; availableCount?: number; claimedCount?: number; unownedCount?: number } | null
  format?: string | null
  pipDistribution?: Record<string, number> | null
  hasBrew?: boolean  // Has an active brew session
  folder_id?: number | null
}

interface DeckFolder {
  id: number
  name: string
  color: string | null
}

interface DecksResponse {
  decks: Deck[]
  folders: DeckFolder[]
  hasCollection: boolean
}

type ReadinessTier = 'green' | 'amber' | 'red'

function getReadinessTier(deck: Deck): ReadinessTier {
  const c = deck.completeness
  if (!c) return 'green'
  if (c.resolved === c.total) return 'green'
  if ((c.unownedCount ?? 0) > 0) return 'red'
  return 'amber'
}

function parseColourIdentity(ci: string | null | undefined): string[] {
  if (!ci) return []
  return ci.split(',').flatMap(s => s.trim().length === 1 ? [s.trim()] : s.trim().split(''))
}

export default function DashboardPage() {
  // Set Oracle context for this page
  useOracleContext({ type: 'deck-list' })

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
  const folders = data?.folders ?? []
  const hasCollection = data?.hasCollection ?? false

  const total = decks?.length ?? 0
  const activeCount = decks?.filter(d => d.is_active).length ?? 0
  const inactiveCount = total - activeCount
  const readyCount = decks?.filter(d =>
    d.is_active && getReadinessTier(d) === 'green'
  ).length ?? 0

  // Don't show empty state until we've actually loaded data once
  // This prevents flashing empty state on refetch
  const hasNothingAtAll = !isLoading && data !== undefined && total === 0

  // Show loading state first
  if (isLoading) {
    return (
      <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
        <div className="mx-auto flex h-full w-full max-w-[var(--content-max-width)] flex-col">
          <PageHeader title="Decks" />
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="space-y-8">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 rounded-xl" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Empty state
  if (hasNothingAtAll) {
    return (
      <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
        <div className="mx-auto flex h-full w-full max-w-[var(--content-max-width)] flex-col">
          <PageHeader title="Decks" />
          <div className="flex flex-1 flex-col items-center justify-center px-5 py-24 text-center">
            {hasCollection ? (
              // User has collection but no decks — focus on deck creation
              <>
                <h2 className="text-[length:var(--fs-xl)] font-medium text-foreground mb-2">
                  No decks yet
                </h2>
                <p className="mb-8 max-w-md text-[length:var(--fs-md)] text-muted-foreground">
                  Start building your first deck
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <NewDeckModal variant="primary" />
                  <DeckImportButton variant="secondary" />
                </div>
              </>
            ) : (
              // New user — focus on collection import
              <>
                <h2 className="text-[length:var(--fs-xl)] font-medium text-foreground mb-2">
                  Welcome to The Oracle
                </h2>
                <p className="mb-6 max-w-md text-[length:var(--fs-md)] text-muted-foreground">
                  Track your physical MTG collection at the individual-card level.
                </p>
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[length:var(--fs-md)] font-medium text-white transition-colors"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  Bring your collection over
                </Link>
                <p className="mt-2 text-[length:var(--fs-xs)] text-muted-foreground">
                  Import from Archidekt or Moxfield
                </p>
                <div className="mt-6 flex items-center gap-4 text-[length:var(--fs-sm)] text-muted-foreground">
                  <DeckImportButton />
                  <NewDeckModal />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
      <div className="flex h-full w-full flex-col">
        <PageHeader
          title="Decks"
          subtitle={activeCount > 0 ? (
            <span>
              {readyCount} of {activeCount} Active {activeCount === 1 ? 'deck' : 'decks'} ready to play
            </span>
          ) : undefined}
          actions={
            <>
              <DeckImportButton />
              <NewDeckModal />
            </>
          }
        />

        {/* Single scrollable content area */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
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
            <div className="space-y-8">
              {/* Dashboard skeleton */}
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              </div>
              {/* Decks grid skeleton */}
              <div className="pt-8">
                <Skeleton className="h-6 w-32 mb-6" />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="w-[236px] h-[260px] overflow-hidden rounded-2xl bg-[#1A1A1A]">
                      <Skeleton className="h-[161px] w-full rounded-none" />
                      <div className="px-3 pt-4 pb-2 space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-24 mt-3" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* ═══ Deck Status Section ═══ */}
              <DeckStatusSection decks={decks ?? []} />

              {/* ═══ Decks Section ═══ */}
              <DecksSection decks={decks ?? []} folders={folders} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Deck Status Section (Ready to Play + Needs Attention)
// ═══════════════════════════════════════════════════════════════════════════════

function getStatusMessage(deck: Deck): string {
  const c = deck.completeness
  if (!c || c.resolved === c.total) return 'Ready'
  
  const unowned = c.unownedCount ?? 0
  const available = c.availableCount ?? 0
  const claimed = c.claimedCount ?? 0
  
  // Red tier: has unowned cards (may also have pullable cards)
  if (unowned > 0) {
    const parts: string[] = []
    if (available > 0) parts.push(`${available} in storage`)
    if (claimed > 0) parts.push(`${claimed} in other decks`)
    parts.push(`${unowned} to buy`)
    return parts.join(', ')
  }
  
  // Amber tier: all owned, but some need pulling
  if (available > 0 && claimed > 0) {
    return `${available} in storage, ${claimed} in other decks`
  }
  if (available > 0) {
    return `${available} in storage`
  }
  if (claimed > 0) {
    return `${claimed} in other decks`
  }
  
  return 'Ready'
}

function DeckStatusSection({ decks }: { decks: Deck[] }) {
  const queryClient = useQueryClient()
  const activeDecks = decks.filter(d => d.is_active)
  const inactiveDecks = decks.filter(d => !d.is_active)

  const activateMutation = useMutation({
    mutationFn: async (deckId: number) => {
      const res = await fetch(`/api/decks/${deckId}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to activate deck')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      toast.success('Deck marked as Active')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to activate')
    },
  })

  // No Active decks but Inactive exists
  if (activeDecks.length === 0) {
    if (inactiveDecks.length > 0) {
      return (
        <div className="space-y-8">
          <div>
            <h2 className="mb-3 text-[length:var(--fs-xs)] font-medium uppercase tracking-wider text-muted-foreground">
              Ready to Play
            </h2>
            <p className="mb-4 text-[length:var(--fs-sm)] text-muted-foreground">
              No Active decks yet. Mark a deck as Active to start tracking:
            </p>
            <div className="space-y-2">
              {inactiveDecks.slice(0, 5).map((deck) => (
                <div
                  key={deck.id}
                  className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--border-default)] px-3 py-2.5"
                >
                  <div className="size-8 shrink-0 overflow-hidden rounded">
                    <CardImage
                      scryfallId={deck.commander_scryfall_id}
                      alt=""
                      width={32}
                      height={32}
                      artCrop
                      noPreview
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[length:var(--fs-md)] font-medium text-foreground">{deck.name}</p>
                    <p className="truncate text-[length:var(--fs-xs)] text-muted-foreground">{deck.commander_name}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => activateMutation.mutate(deck.id)}
                    disabled={activateMutation.isPending}
                    className="shrink-0 text-[length:var(--fs-xs)]"
                  >
                    Mark Active
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-8">
        <div>
          <h2 className="mb-3 text-[length:var(--fs-xs)] font-medium uppercase tracking-wider text-muted-foreground">
            Ready to Play
          </h2>
          <p className="text-[length:var(--fs-sm)] text-muted-foreground">
            No decks ready yet — import or brew a deck to get started
          </p>
        </div>
      </div>
    )
  }

  // Categorize active decks by tier
  const readyDecks = activeDecks.filter(d => getReadinessTier(d) === 'green')
  const attentionDecks = activeDecks.filter(d => getReadinessTier(d) !== 'green')
    .sort((a, b) => {
      // Sort by tier (amber before red), then by name
      const tierA = getReadinessTier(a)
      const tierB = getReadinessTier(b)
      if (tierA !== tierB) return tierA === 'amber' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  return (
    <div className="space-y-8">
      {/* Ready to Play */}
      <div>
        <h2 className="mb-3 text-[length:var(--fs-xs)] font-medium uppercase tracking-wider text-muted-foreground">
          Ready to Play
        </h2>
        {readyDecks.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {readyDecks.map((deck) => (
              <DeckStatusCard
                key={deck.id}
                id={deck.id}
                name={deck.name}
                commanderName={deck.commander_name}
                commanderScryfallId={deck.commander_scryfall_id}
                colourIdentity={parseColourIdentity(deck.colour_identity)}
                tier="green"
                message={getStatusMessage(deck)}
              />
            ))}
          </div>
        ) : (
          <p className="text-[length:var(--fs-sm)] text-muted-foreground">
            No decks ready — see Needs Attention
          </p>
        )}
      </div>

      {/* Needs Attention */}
      {attentionDecks.length > 0 && (
        <div>
          <h2 className="mb-3 text-[length:var(--fs-xs)] font-medium uppercase tracking-wider text-muted-foreground">
            Needs Attention
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {attentionDecks.map((deck) => {
              const tier = getReadinessTier(deck)
              return (
                <DeckStatusCard
                  key={deck.id}
                  id={deck.id}
                  name={deck.name}
                  commanderName={deck.commander_name}
                  commanderScryfallId={deck.commander_scryfall_id}
                  colourIdentity={parseColourIdentity(deck.colour_identity)}
                  tier={tier}
                  message={getStatusMessage(deck)}
                  href={tier === 'amber' ? `/decks/${deck.id}?tab=picklist` : undefined}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Decks Section (grouped grid)
// ═══════════════════════════════════════════════════════════════════════════════

function DecksSection({ decks, folders }: { decks: Deck[]; folders: DeckFolder[] }) {
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  
  const activeDecks = decks.filter(d => d.is_active)
  const inactiveDecks = decks.filter(d => !d.is_active)

  // Filter decks by selected folder
  const filteredDecks = selectedFolderId !== null
    ? decks.filter(d => d.folder_id === selectedFolderId)
    : decks

  const filteredActive = filteredDecks.filter(d => d.is_active)
  const filteredInactive = filteredDecks.filter(d => !d.is_active)

  const total = filteredDecks.length
  const activeCount = filteredActive.length
  const inactiveCount = filteredInactive.length

  // Compute deck counts per folder
  const folderCounts = new Map<number, number>()
  for (const deck of decks) {
    if (deck.folder_id) {
      folderCounts.set(deck.folder_id, (folderCounts.get(deck.folder_id) ?? 0) + 1)
    }
  }

  const renderDeckGrid = (deckList: Deck[]) => (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
      {deckList.map((deck) => (
        <DeckTile
          key={deck.id}
          id={deck.id}
          name={deck.name}
          commanderName={deck.commander_name}
          commanderScryfallId={deck.commander_scryfall_id}
          colourIdentity={parseColourIdentity(deck.colour_identity)}
          cardCount={deck.card_count}
          isActive={deck.is_active}
          completeness={deck.completeness}
          format={deck.format}
          pipDistribution={deck.pipDistribution}
          hasBrew={deck.hasBrew}
          folderId={deck.folder_id}
          folders={folders}
        />
      ))}
    </div>
  )

  return (
    <div className="pt-4 border-t border-[var(--border-subtle)]">
      {/* Folders section */}
      {folders.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-[length:var(--fs-xs)] font-medium uppercase tracking-wider text-muted-foreground">
            Folders
          </h2>
          <div className="flex flex-wrap gap-2">
            {folders.map((folder) => (
              <FolderChip
                key={folder.id}
                id={folder.id}
                name={folder.name}
                count={folderCounts.get(folder.id) ?? 0}
                color={folder.color}
                isSelected={selectedFolderId === folder.id}
                onClick={() => setSelectedFolderId(
                  selectedFolderId === folder.id ? null : folder.id
                )}
              />
            ))}
            <NewFolderChip onClick={() => setCreateFolderOpen(true)} />
          </div>
        </div>
      )}

      {/* Show + New folder even when no folders exist */}
      {folders.length === 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-[length:var(--fs-xs)] font-medium uppercase tracking-wider text-muted-foreground">
            Folders
          </h2>
          <div className="flex flex-wrap gap-2">
            <NewFolderChip onClick={() => setCreateFolderOpen(true)} />
          </div>
        </div>
      )}

      {/* Decks header */}
      <div className="mb-4">
        <h2 className="mb-3 text-[length:var(--fs-xs)] font-medium uppercase tracking-wider text-muted-foreground">
          {selectedFolderId !== null 
            ? folders.find(f => f.id === selectedFolderId)?.name ?? 'Folder'
            : 'All Decks'}
        </h2>
        {selectedFolderId !== null && (
          <button
            type="button"
            onClick={() => setSelectedFolderId(null)}
            className="mb-2 text-[length:var(--fs-xs)] text-[var(--accent-primary)] hover:underline"
          >
            ← Show all decks
          </button>
        )}
      </div>

      {/* All decks in one grid — Active decks are sorted first by the API */}
      {total > 0 && renderDeckGrid([...filteredActive, ...filteredInactive])}
      
      {total === 0 && selectedFolderId !== null && (
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">
          No decks in this folder yet.
        </p>
      )}

      <CreateFolderModal open={createFolderOpen} onOpenChange={setCreateFolderOpen} />
    </div>
  )
}
