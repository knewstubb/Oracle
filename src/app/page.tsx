'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DeckImportButton } from '@/components/DeckImportButton'
import { NewDeckModal } from '@/components/NewDeckModal'
import { DeckTile } from '@/components/DeckTile'
import { FolderChip, NewFolderChip } from '@/components/FolderChip'
import { CreateFolderModal } from '@/components/CreateFolderModal'
import { useOracleContext } from '@/contexts/OracleContext'
import { usePageHeader } from '@/contexts/PageHeaderContext'

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
  conflictCount?: number
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

function parseColourIdentity(ci: string | null | undefined): string[] {
  if (!ci) return []
  return ci.split(',').flatMap(s => s.trim().length === 1 ? [s.trim()] : s.trim().split(''))
}

/**
 * Deck grid track sizing.
 *
 * Tracks are counted from the deck tile's minimum width (DeckTile is
 * `aspect-[236/260]` and floors at 200px) and then grow with `1fr`, so:
 *   - the last column always ends flush with the content edge (a fixed max
 *     track size such as 280px leaves dead space on the right), and
 *   - tiles shrink rather than staying oversized when that shrink buys
 *     another column.
 *
 * `auto-fill` (not `auto-fit`) keeps tile size stable when a row is not full —
 * with fewer decks the empty tracks simply stay empty.
 */
const DECK_GRID_COLUMNS = 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))'

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
    staleTime: 5 * 60 * 1000, // 5 min — consider fresh
    gcTime: 60 * 60 * 1000, // 1 hour — keep in cache
    refetchOnWindowFocus: false, // Don't refetch on tab switch
  })

  const decks = data?.decks
  const folders = data?.folders ?? []
  const hasCollection = data?.hasCollection ?? false

  const total = decks?.length ?? 0
  const activeCount = decks?.filter(d => d.is_active).length ?? 0

  // Don't show empty state until we've actually loaded data once
  // This prevents flashing empty state on refetch
  const hasNothingAtAll = !isLoading && data !== undefined && total === 0

  // Set page header at layout level
  usePageHeader({
    title: 'Decks',
    subtitle: activeCount > 0 ? (
      <span>
        {activeCount} Active {activeCount === 1 ? 'deck' : 'decks'}
      </span>
    ) : undefined,
    actions: (
      <>
        <DeckImportButton />
        <NewDeckModal />
      </>
    ),
  })

  // Show loading state first
  if (isLoading) {
    return (
      <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
        <div className="mx-auto flex h-full w-full max-w-[var(--content-max-width)] flex-col">
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
      <div className="mx-auto flex h-full w-full max-w-[var(--content-max-width)] flex-col">
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
// Decks Section (grouped grid)
// ═══════════════════════════════════════════════════════════════════════════════

function DecksSection({ decks, folders }: { decks: Deck[]; folders: DeckFolder[] }) {
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)

  // Filter decks by selected folder
  const filteredDecks = selectedFolderId !== null
    ? decks.filter(d => d.folder_id === selectedFolderId)
    : decks

  const filteredActive = filteredDecks.filter(d => d.is_active)
  const filteredInactive = filteredDecks.filter(d => !d.is_active)

  const total = filteredDecks.length

  // Compute deck counts per folder
  const folderCounts = new Map<number, number>()
  for (const deck of decks) {
    if (deck.folder_id) {
      folderCounts.set(deck.folder_id, (folderCounts.get(deck.folder_id) ?? 0) + 1)
    }
  }

  const renderDeckGrid = (deckList: Deck[]) => (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: DECK_GRID_COLUMNS }}
    >
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
          conflictCount={deck.conflictCount}
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
          {/* Horizontally scrollable on mobile */}
          <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
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
        </div>
      )}

      {/* Show + New folder even when no folders exist */}
      {folders.length === 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-[length:var(--fs-xs)] font-medium uppercase tracking-wider text-muted-foreground">
            Folders
          </h2>
          <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
            <NewFolderChip onClick={() => setCreateFolderOpen(true)} />
            </div>
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
