'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveUserRefresh } from '@/hooks/useLiveRefresh'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { AlertCircle, ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DeckImportButton } from '@/components/DeckImportButton'
import { NewDeckModal } from '@/components/NewDeckModal'
import { DeckTile, StatusIcon, STATUS_BADGE } from '@/components/DeckTile'
import { FolderChip, NewFolderChip } from '@/components/FolderChip'
import { CreateFolderModal } from '@/components/CreateFolderModal'
import { usePageHeader } from '@/contexts/PageHeaderContext'
import { moveInOrder } from '@/lib/deck-order'
import { useSaveDeckOrder } from '@/hooks/useSaveDeckOrder'

interface Deck {
  id: number
  name: string
  commander_name: string
  commander_scryfall_id: string
  colour_identity: string
  card_count: number
  deck_type: string | null
  status: 'brewing' | 'assembling' | 'playable' // Automatic, from the sleeved cards
  conflictCount?: number
  sleevedCount?: number
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

interface DeckDetailsResponse {
  pips: Record<string, Record<string, number>>
  sleeved?: Record<string, number>
  unresolved: Record<string, { availableCount: number; claimedCount: number; unownedCount: number; failed: boolean }>
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

/** How the deck list is grouped. Remembered between visits. */
type DeckGroupBy = 'none' | 'status'
const DECK_GROUP_KEY = 'oracle:decks:groupBy'
/** Section order when grouped by status. */
const STATUS_SECTION_ORDER = ['playable', 'assembling', 'brewing'] as const

function readGroupBy(): DeckGroupBy {
  if (typeof window === 'undefined') return 'none'
  try {
    return localStorage.getItem(DECK_GROUP_KEY) === 'status' ? 'status' : 'none'
  } catch {
    return 'none'
  }
}

const LIVE_KEYS = [['decks'], ['connector', 'pending-count']] as const
export default function DashboardPage() {
  // Deck list updates by itself when Claude creates or changes a deck.
  useLiveUserRefresh(LIVE_KEYS)

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

  // Colour pips and the available/claimed/unowned counts arrive after the
  // tiles: they need the slowest lookups, so they load separately and fill in.
  const { data: detailsData } = useQuery<DeckDetailsResponse>({
    queryKey: ['decks', 'details'],
    queryFn: () => fetch('/api/decks/details').then(r => {
      if (!r.ok) throw new Error('Failed to load deck details')
      return r.json()
    }),
    enabled: data !== undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
  const decks = useMemo(
    () => data?.decks.map(d => {
      const pips = detailsData?.pips?.[d.id]
      // Once the details have arrived, a deck missing from `sleeved` has none sleeved.
      const sleevedCount = detailsData?.sleeved ? (detailsData.sleeved[d.id] ?? 0) : undefined
      if (!pips && sleevedCount === undefined) return d
      return {
        ...d,
        ...(sleevedCount !== undefined ? { sleevedCount } : {}),
        ...(pips ? { pipDistribution: pips } : {}),
      }
    }),
    [data, detailsData]
  )
  const folders = data?.folders ?? []
  const hasCollection = data?.hasCollection ?? false

  const total = decks?.length ?? 0

  // Don't show empty state until we've actually loaded data once
  // This prevents flashing empty state on refetch
  const hasNothingAtAll = !isLoading && data !== undefined && total === 0

  // Set page header at layout level
  usePageHeader({
    title: 'Decks',
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
  const [groupBy, setGroupBy] = useState<DeckGroupBy>(readGroupBy)
  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(new Set())

  const changeGroupBy = (value: DeckGroupBy) => {
    setGroupBy(value)
    try {
      localStorage.setItem(DECK_GROUP_KEY, value)
    } catch {
      // localStorage unavailable: the choice just isn't remembered
    }
  }
  const toggleStatusSection = (status: string) =>
    setCollapsedStatuses(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })

  // Filter decks by selected folder
  const filteredDecks = selectedFolderId !== null
    ? decks.filter(d => d.folder_id === selectedFolderId)
    : decks


  const total = filteredDecks.length
  const filterOn = selectedFolderId !== null
  const { saveOrder, saving } = useSaveDeckOrder()
  // Carrying a tile. `spot` is where a drop would land inside the carried deck's own group.
  const [drag, setDrag] = useState<{ id: number; group: string } | null>(null)
  const [spot, setSpot] = useState<{ group: string; beforeId: number | null } | null>(null)
  const [chipOver, setChipOver] = useState<string | null>(null) // name of the folder chip under the pointer
  const [refusal, setRefusal] = useState<{ kind: 'filter' } | { kind: 'group'; group: string } | null>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const nameOf = (id: number) => decks.find(d => d.id === id)?.name ?? 'deck'
  const groupKeyOf = (deck: Deck) => (groupBy === 'status' ? deck.status : 'all')
  const groupLabel = (g: string) => (g in STATUS_BADGE ? STATUS_BADGE[g as keyof typeof STATUS_BADGE].label : g)

  // The pointer label follows the carried tile.
  useEffect(() => {
    if (!drag) return
    const move = (e: DragEvent) => {
      const el = labelRef.current
      if (el) el.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 16}px)`
    }
    document.addEventListener('dragover', move)
    return () => document.removeEventListener('dragover', move)
  }, [drag])

  const dropLabel = !drag
    ? null
    : chipOver
      ? `File in ${chipOver}`
      : refusal?.kind === 'filter'
        ? 'Reordering is off while a folder is open'
        : refusal?.kind === 'group'
          ? `Not in ${groupLabel(refusal.group)}: status comes from a deck's cards`
          : spot
            ? spot.beforeId === null ? 'Move to the end' : `Move before ${nameOf(spot.beforeId)}`
            : null

  const endDrag = (e: React.DragEvent) => {
    // A drop the screen refused ends with no drop effect: say why (a grey message, nothing failed).
    if (e.dataTransfer.dropEffect === 'none' && refusal) {
      toast.info(
        refusal.kind === 'filter'
          ? 'Reordering is off while a folder is open. Show all decks to reorder.'
          : "Decks stay in their status group. Status comes from a deck's cards, so it can't be set by moving a tile.",
      )
    }
    setDrag(null)
    setSpot(null)
    setChipOver(null)
    setRefusal(null)
  }

  // Tiles of one group in the order shown, with the carried tile at the spot it would land in.
  const withSpot = (list: Deck[], group: string): Deck[] => {
    if (!drag || !spot || spot.group !== group || chipOver) return list
    const moved = list.find(d => d.id === drag.id)
    if (!moved) return list
    const rest = list.filter(d => d.id !== drag.id)
    const at = spot.beforeId === null ? rest.length : rest.findIndex(d => d.id === spot.beforeId)
    return at < 0 ? list : [...rest.slice(0, at), moved, ...rest.slice(at)]
  }

  const commitDrop = (list: Deck[]) => {
    if (!drag || !spot) return
    const next = moveInOrder(decks.map(d => d.id), list.map(d => d.id), drag.id, spot.beforeId)
    if (next) saveOrder(next)
  }

  // Drag handling for one group's tiles (the plain grid is one group).
  const zoneProps = (group: string, list: Deck[]) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!drag) return
      if (filterOn) return setRefusal({ kind: 'filter' })
      if (group !== drag.group) return setRefusal({ kind: 'group', group })
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setRefusal(null)
      // Pointer below the last row, on the grid itself: the very end.
      const last = e.currentTarget.querySelector('[data-deck-slot]:last-of-type')
      if (e.target === e.currentTarget && last && e.clientY > last.getBoundingClientRect().bottom && spot?.beforeId !== null) {
        setSpot({ group, beforeId: null })
      }
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSpot(null)
    },
    onDrop: (e: React.DragEvent) => {
      if (!drag || filterOn || group !== drag.group) return
      e.preventDefault()
      commitDrop(list)
    },
  })

  const tileDragOver = (e: React.DragEvent, deck: Deck, group: string, list: Deck[]) => {
    if (!drag || filterOn || group !== drag.group) return // the zone refuses
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    e.stopPropagation()
    setRefusal(null)
    if (deck.id === drag.id) return
    const rect = e.currentTarget.getBoundingClientRect()
    const rest = list.filter(d => d.id !== drag.id)
    const i = rest.findIndex(d => d.id === deck.id)
    const beforeId = e.clientX < rect.left + rect.width / 2 ? deck.id : rest[i + 1]?.id ?? null
    if (spot?.group !== group || spot.beforeId !== beforeId) setSpot({ group, beforeId })
  }

  // Compute deck counts per folder
  const folderCounts = new Map<number, number>()
  for (const deck of decks) {
    if (deck.folder_id) {
      folderCounts.set(deck.folder_id, (folderCounts.get(deck.folder_id) ?? 0) + 1)
    }
  }

  const renderDeckGrid = (deckList: Deck[], group: string) => (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: DECK_GRID_COLUMNS }}
      {...(groupBy === 'none' ? zoneProps(group, deckList) : {})}
    >
      {withSpot(deckList, group).map((deck) => {
        const carried = drag?.id === deck.id && !filterOn
        return (
          <div
            key={deck.id}
            data-deck-slot
            className="relative"
            onDragStart={() => setDrag({ id: deck.id, group: groupKeyOf(deck) })}
            onDragEnd={endDrag}
            onDragOver={(e) => tileDragOver(e, deck, group, deckList)}
          >
            <div className={carried ? 'opacity-0' : undefined} aria-hidden={carried || undefined}>
              <DeckTile
                id={deck.id}
                name={deck.name}
                commanderName={deck.commander_name}
                commanderScryfallId={deck.commander_scryfall_id}
                colourIdentity={parseColourIdentity(deck.colour_identity)}
                cardCount={deck.card_count}
                sleevedCount={deck.sleevedCount}
                status={deck.status}
                conflictCount={deck.conflictCount}
                format={deck.format}
                pipDistribution={deck.pipDistribution ?? undefined}
                hasBrew={deck.hasBrew}
                folderId={deck.folder_id}
                folders={folders}
                dragLocked={saving}
              />
            </div>
            {carried && (
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--accent-primary-text)] bg-[var(--accent-primary)]/10 text-[length:var(--fs-sm)] text-[var(--accent-primary-text)]"
              >
                Drop here
              </div>
            )}
          </div>
        )
      })}
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
                carrying={drag !== null}
                onDropTarget={(over) => {
                  setChipOver(over ? folder.name : null)
                  if (over) setRefusal(null)
                }}
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[length:var(--fs-xs)] font-medium uppercase tracking-wider text-muted-foreground">
            {selectedFolderId !== null
              ? folders.find(f => f.id === selectedFolderId)?.name ?? 'Folder'
              : 'All Decks'}
          </h2>
          {saving && (
            <span role="status" className="flex items-center gap-1.5 text-[length:var(--fs-xs)] text-[var(--text-secondary)]">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              Saving order…
            </span>
          )}
          <span className="flex-1" />
          {filterOn && (
            <span
              className="hidden text-[length:var(--fs-xs)] sm:inline"
              style={{ color: refusal?.kind === 'filter' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
              Reordering is off while a folder is open. Dropping on a folder chip still files a deck.
            </span>
          )}
          <select
            value={groupBy}
            onChange={(e) => changeGroupBy(e.target.value as DeckGroupBy)}
            className="h-8 rounded-lg border px-2 text-[length:var(--fs-sm)] font-medium text-muted-foreground"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-emphasis)',
            }}
            aria-label="Group by"
          >
            <option value="none">Group: None</option>
            <option value="status">Group: Status</option>
          </select>
        </div>
        {selectedFolderId !== null && (
          <button
            type="button"
            onClick={() => setSelectedFolderId(null)}
            className="mb-2 text-[length:var(--fs-xs)] text-[var(--accent-primary-text)] hover:underline"
          >
            ← Show all decks
          </button>
        )}
      </div>

      {/* One grid in the saved deck order, or one section per status (Playable, Assembling, Brewing) */}
      {total > 0 && groupBy === 'none' && renderDeckGrid(filteredDecks, 'all')}
      {total > 0 && groupBy === 'status' && (
        <div className="space-y-6">
          {STATUS_SECTION_ORDER.map((status) => {
            const sectionDecks = filteredDecks.filter(d => d.status === status)
            if (sectionDecks.length === 0) return null
            const badge = STATUS_BADGE[status]
            const collapsed = collapsedStatuses.has(status)
            const dragging = drag !== null && !filterOn
            const own = dragging && drag.group === status
            const other = dragging && drag.group !== status
            return (
              <section
                key={status}
                aria-label={badge.label}
                className={other ? 'opacity-45' : undefined}
                style={refusal?.kind === 'group' && refusal.group === status ? { outline: '2px solid var(--signal-warning)', outlineOffset: 4, borderRadius: 8 } : undefined}
                {...zoneProps(status, sectionDecks)}
              >
                <button
                  type="button"
                  onClick={() => toggleStatusSection(status)}
                  className="mb-3 flex w-full items-center gap-2 border-b px-1 py-2 text-left hover:opacity-80"
                  style={{ borderColor: collapsed ? 'transparent' : 'var(--border-default)' }}
                  aria-expanded={!collapsed}
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: badge.colour }}
                    aria-hidden="true"
                  >
                    <StatusIcon status={status} />
                  </span>
                  <span className="text-[length:var(--fs-sm)] font-medium uppercase tracking-wide text-muted-foreground">
                    {badge.label} ({sectionDecks.length})
                  </span>
                  {own && <span className="text-[length:var(--fs-xs)] normal-case text-[var(--text-secondary)]">Moving within {badge.label}</span>}
                  {other && <span className="text-[length:var(--fs-xs)] normal-case text-[var(--text-secondary)]">Can&apos;t drop here: a deck&apos;s status comes from its cards</span>}
                  <span className="flex-1" />
                  {collapsed ? (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                </button>
                {!collapsed && renderDeckGrid(sectionDecks, status)}
              </section>
            )
          })}
        </div>
      )}
      
      {total === 0 && selectedFolderId !== null && (
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">
          No decks in this folder yet.
        </p>
      )}

      {dropLabel && (
        <div
          ref={labelRef}
          role="presentation"
          className="pointer-events-none fixed left-0 top-0 z-50 max-w-xs rounded-md border border-[var(--border-emphasis)] bg-[var(--bg-card)] px-2 py-1 text-[length:var(--fs-xs)] text-foreground shadow-lg"
        >
          {dropLabel}
        </div>
      )}
      <CreateFolderModal open={createFolderOpen} onOpenChange={setCreateFolderOpen} />
    </div>
  )
}
