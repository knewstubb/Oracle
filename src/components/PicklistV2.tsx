'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import { CardHoverPreview, useCardHoverPreview } from '@/components/CardHoverPreview'
import type { RankedCandidate } from '@/lib/allocation-candidates'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PicklistV2Props {
  deckId: number
}

export interface PicklistCard {
  deckCardsId: number
  cardName: string
  isResolved: boolean
  physicalCopyId: number | null
  ownershipStatus: string | null
  candidates: RankedCandidate[]
}

interface PicklistResponse {
  deckName: string
  cards: PicklistCard[]
  progress: { resolved: number; total: number }
}

// ---------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------

interface AvailableGroup {
  location: string
  items: Array<{ card: PicklistCard; candidate: RankedCandidate }>
}

interface ClaimedGroup {
  deckName: string
  deckStatus: string
  items: Array<{ card: PicklistCard; candidate: RankedCandidate }>
}

interface UnownedItem {
  card: PicklistCard
}

function categorizeCards(cards: PicklistCard[], currentDeckId: number) {
  const available: AvailableGroup[] = []
  const claimed: ClaimedGroup[] = []
  const unowned: UnownedItem[] = []

  const availableMap = new Map<string, AvailableGroup>()
  const claimedMap = new Map<string, ClaimedGroup>()
  const seen = new Set<number>() // track which deckCardsIds we've already placed

  for (const card of cards) {
    if (card.isResolved) continue

    // Filter out candidates assigned to the current deck (self-reference)
    const candidates = card.candidates.filter(c => !c.entry.assignedTo || c.entry.assignedTo.deckId !== currentDeckId)
    if (candidates.length === 0 || candidates[0].tier === 5) {
      // Unowned — no copies exist
      unowned.push({ card })
      continue
    }

    // Check for available (free in storage) candidates first
    const freeCandidate = candidates.find(c => !c.entry.assignedTo)
    if (freeCandidate && !seen.has(card.deckCardsId)) {
      const location = freeCandidate.entry.storageLocationName || 'Unsorted'
      if (!availableMap.has(location)) {
        const group: AvailableGroup = { location, items: [] }
        availableMap.set(location, group)
        available.push(group)
      }
      availableMap.get(location)!.items.push({ card, candidate: freeCandidate })
      seen.add(card.deckCardsId)
      continue
    }

    // Otherwise check for claimed (in another deck) candidates
    const claimedCandidate = candidates.find(c => c.entry.assignedTo)
    if (claimedCandidate && !seen.has(card.deckCardsId)) {
      const assignment = claimedCandidate.entry.assignedTo!
      const key = String(assignment.deckId)
      if (!claimedMap.has(key)) {
        const group: ClaimedGroup = { deckName: assignment.deckName, deckStatus: assignment.deckStatus, items: [] }
        claimedMap.set(key, group)
        claimed.push(group)
      }
      claimedMap.get(key)!.items.push({ card, candidate: claimedCandidate })
      seen.add(card.deckCardsId)
      continue
    }

    // Fallback: unowned
    if (!seen.has(card.deckCardsId)) {
      unowned.push({ card })
      seen.add(card.deckCardsId)
    }
  }

  // Sort: items alphabetically within each group, groups alphabetically by location/deck name
  for (const group of available) {
    group.items.sort((a, b) => a.card.cardName.localeCompare(b.card.cardName))
  }
  available.sort((a, b) => a.location.localeCompare(b.location))

  for (const group of claimed) {
    group.items.sort((a, b) => a.card.cardName.localeCompare(b.card.cardName))
  }
  claimed.sort((a, b) => a.deckName.localeCompare(b.deckName))

  unowned.sort((a, b) => a.card.cardName.localeCompare(b.card.cardName))

  return { available, claimed, unowned }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PicklistV2({ deckId }: PicklistV2Props) {
  const queryClient = useQueryClient()
  const [loadingRows, setLoadingRows] = useState<Set<number>>(new Set())
  const [tier4Pending, setTier4Pending] = useState<{ card: PicklistCard; candidate: RankedCandidate } | null>(null)
  const [tier4Loading, setTier4Loading] = useState(false)

  const { data: picklist, isLoading } = useQuery<PicklistResponse>({
    queryKey: ['picklist', deckId],
    queryFn: () => fetch(`/api/decks/${deckId}/picklist`).then(r => {
      if (!r.ok) throw new Error('Failed to load picklist')
      return r.json()
    }),
    staleTime: 30 * 1000,
  })

  const { available, claimed, unowned } = useMemo(() => {
    if (!picklist) return { available: [], claimed: [], unowned: [] }
    const unresolvedCards = picklist.cards.filter(c => !c.isResolved)
    return categorizeCards(unresolvedCards, deckId)
  }, [picklist])

  // Search state + filtered results
  const [searchQuery, setSearchQuery] = useState('')

  const { filteredAvailable, filteredClaimed, filteredUnowned } = useMemo(() => {
    if (!searchQuery.trim()) {
      return { filteredAvailable: available, filteredClaimed: claimed, filteredUnowned: unowned }
    }
    const q = searchQuery.toLowerCase()
    const filteredAvailable = available
      .map(group => ({ ...group, items: group.items.filter(i => i.card.cardName.toLowerCase().includes(q)) }))
      .filter(group => group.items.length > 0)
    const filteredClaimed = claimed
      .map(group => ({ ...group, items: group.items.filter(i => i.card.cardName.toLowerCase().includes(q)) }))
      .filter(group => group.items.length > 0)
    const filteredUnowned = unowned.filter(i => i.card.cardName.toLowerCase().includes(q))
    return { filteredAvailable, filteredClaimed, filteredUnowned }
  }, [available, claimed, unowned, searchQuery])

  // Assign mutation (tier 1-3)
  const assignMutation = useMutation({
    mutationFn: async (body: { deckCardsId: number; physicalCopyId: number; tier?: number }) => {
      const res = await fetch('/api/allocation/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Assignment failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
      queryClient.invalidateQueries({ queryKey: ['picklist', String(deckId)] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'card-statuses'] })
    },
  })

  // Claim from deck mutation (tier 4)
  const claimMutation = useMutation({
    mutationFn: async (body: { deckCardsId: number; physicalCopyId: number }) => {
      const res = await fetch('/api/allocation/claim-from-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Claim failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
      queryClient.invalidateQueries({ queryKey: ['picklist', String(deckId)] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'card-statuses'] })
    },
  })

  // Proxy mutation
  const proxyMutation = useMutation({
    mutationFn: async (body: { deckCardsId: number; cardName: string }) => {
      // Look up card_definition_id
      const actionRes = await fetch(`/api/decks/${deckId}/card-actions/${encodeURIComponent(body.cardName)}`)
      if (!actionRes.ok) throw new Error('Failed to look up card')
      const actionData = await actionRes.json()
      if (!actionData.cardDefinitionId) throw new Error('Card definition not found')

      const res = await fetch('/api/allocation/add-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckCardsId: body.deckCardsId, cardDefinitionId: actionData.cardDefinitionId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Proxy failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
      queryClient.invalidateQueries({ queryKey: ['picklist', String(deckId)] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'card-statuses'] })
    },
  })

  const handleClaim = useCallback((card: PicklistCard, candidate: RankedCandidate) => {
    if (candidate.entry.assignedTo) {
      // Tier 4: confirm
      if (candidate.entry.assignedTo.deckStatus === 'in_rotation') {
        setTier4Pending({ card, candidate })
        return
      }
      // Tier 3 (brewing/graveyard): instant
      claimMutation.mutate({ deckCardsId: card.deckCardsId, physicalCopyId: candidate.entry.physicalCopyId })
      toast.success(`Claimed ${card.cardName}`)
    } else {
      // Available: assign
      assignMutation.mutate({ deckCardsId: card.deckCardsId, physicalCopyId: candidate.entry.physicalCopyId })
      toast.success(`Filled ${card.cardName}`)
    }
  }, [assignMutation, claimMutation])

  const handleProxy = useCallback((card: PicklistCard) => {
    proxyMutation.mutate({ deckCardsId: card.deckCardsId, cardName: card.cardName })
    toast.success(`Adding proxy for ${card.cardName}`)
  }, [proxyMutation])

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Skeleton progress bar */}
        <div className="rounded-lg border border-white/[0.08] px-4 py-3" style={{ backgroundColor: 'rgba(26,26,30,0.5)' }}>
          <div className="mb-2 flex items-center justify-between">
            <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-48 animate-pulse rounded bg-white/[0.06]" />
          </div>
          <div className="h-2 w-full animate-pulse rounded-full bg-white/[0.06]" />
        </div>
        {/* Skeleton columns */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((col) => (
            <div key={col} className="space-y-3">
              <div className="h-5 w-24 animate-pulse rounded bg-white/[0.06]" />
              <div className="rounded-lg border border-white/[0.08] p-3 space-y-2" style={{ backgroundColor: 'rgba(26,26,30,0.5)' }}>
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="flex items-center gap-2">
                    <div className="h-8 w-6 animate-pulse rounded bg-white/[0.06]" />
                    <div className="h-4 flex-1 animate-pulse rounded bg-white/[0.06]" />
                    <div className="h-6 w-14 animate-pulse rounded bg-white/[0.06]" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const isPending = assignMutation.isPending || claimMutation.isPending || proxyMutation.isPending

  // Empty deck — no cards at all
  if (picklist && picklist.progress.total === 0) {
    return (
      <div
        className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-lg text-center"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
      >
        <p className="text-[length:var(--fs-lg)] font-medium text-foreground">No cards in this deck yet</p>
        <p className="max-w-sm text-[length:var(--fs-sm)] text-muted-foreground">
          Import cards from a URL or paste a list to start building your picklist.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Progress bar */}
      {picklist && (
        <PicklistProgress cards={picklist.cards} progress={picklist.progress} />
      )}

      {/* Search input */}
      <div className="relative mb-4 max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder="Search cards..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 w-full rounded-lg border bg-transparent pl-8 pr-8 text-[length:var(--fs-sm)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
          style={{ borderColor: 'var(--border-emphasis)' }}
          aria-label="Search picklist cards"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Column headers */}
      <div className="mb-4 hidden md:grid md:grid-cols-3 gap-4">
        <h2 className="text-[length:var(--fs-md)] font-semibold text-foreground">In storage</h2>
        <h2 className="text-[length:var(--fs-md)] font-semibold text-foreground">In decks</h2>
        <h2 className="text-[length:var(--fs-md)] font-semibold text-foreground">Unowned</h2>
      </div>

      {/* Three columns (desktop) / stacked sections (mobile) */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-3 md:gap-4 md:items-start">
        {/* Available column */}
        <div className="flex flex-col gap-3">
          <h2 className="text-[length:var(--fs-md)] font-semibold text-foreground md:hidden">In storage</h2>
          {filteredAvailable.length === 0 ? (
            <EmptyColumn message="No cards in storage" />
          ) : (
            filteredAvailable.map((group) => (
              <GroupSection
                key={group.location}
                title={`${group.location.toUpperCase()} (${group.items.length})`}
              >
                {group.items.map(({ card, candidate }) => (
                  <CardRow
                    key={card.deckCardsId}
                    cardName={card.cardName}
                    isProxy={candidate.entry.isProxy}
                    subtitle={candidate.entry.isProxy ? 'Proxy' : 'Original'}
                    scryfallPrintingId={candidate.entry.scryfallPrintingId}
                    action={
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => handleClaim(card, candidate)}
                        className="hover:bg-[rgba(29,158,117,0.15)] hover:scale-105 transition-all"
                        style={{ color: 'rgba(29,158,117,0.7)', borderColor: 'rgba(29,158,117,0.5)' }}
                      >
                        Claim
                      </Button>
                    }
                  />
                ))}
              </GroupSection>
            ))
          )}
        </div>

        {/* Claimed column */}
        <div className="flex flex-col gap-3">
          <h2 className="text-[length:var(--fs-md)] font-semibold text-foreground md:hidden">In decks</h2>
          {filteredClaimed.length === 0 ? (
            <EmptyColumn message="No cards in decks" />
          ) : (
            filteredClaimed.map((group) => (
              <GroupSection
                key={group.deckName}
                title={`${group.deckName.toUpperCase()} (${group.items.length})`}
                subtitle={formatDeckStatus(group.deckStatus)}
              >
                {group.items.map(({ card, candidate }) => (
                  <CardRow
                    key={card.deckCardsId}
                    cardName={card.cardName}
                    isProxy={candidate.entry.isProxy}
                    subtitle={candidate.entry.isProxy ? 'Proxy' : 'Original'}
                    scryfallPrintingId={candidate.entry.scryfallPrintingId}
                    action={
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => handleClaim(card, candidate)}
                        className="hover:bg-[rgba(245,136,11,0.15)] hover:scale-105 transition-all" style={{ color: '#F5880B', borderColor: '#F5880B' }}
                      >
                        Claim
                      </Button>
                    }
                  />
                ))}
              </GroupSection>
            ))
          )}
        </div>

        {/* Unowned column */}
        <div className="flex flex-col gap-3">
          <h2 className="text-[length:var(--fs-md)] font-semibold text-foreground md:hidden">Unowned</h2>
          {filteredUnowned.length === 0 ? (
            <EmptyColumn message="Nothing unowned" />
          ) : (
            <GroupSection title={`UNOWNED (${filteredUnowned.length})`}>
              {filteredUnowned.map(({ card }) => (
                <CardRow
                  key={card.deckCardsId}
                  cardName={card.cardName}
                  isProxy={false}
                  subtitle=""
                  scryfallPrintingId={null}
                  action={
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => handleProxy(card)}
                      className="hover:bg-[rgba(29,158,117,0.15)] hover:scale-105 transition-all" style={{ color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' }}
                    >
                      Proxy
                    </Button>
                  }
                />
              ))}
            </GroupSection>
          )}
        </div>
      </div>

      {/* Tier 4 confirmation modal */}
      <ConfirmationModal
        open={tier4Pending !== null}
        onConfirm={async () => {
          if (!tier4Pending) return
          setTier4Loading(true)
          try {
            await claimMutation.mutateAsync({
              deckCardsId: tier4Pending.card.deckCardsId,
              physicalCopyId: tier4Pending.candidate.entry.physicalCopyId,
            })
            toast.success(`Claimed ${tier4Pending.card.cardName}`)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Claim failed')
          } finally {
            setTier4Loading(false)
            setTier4Pending(null)
          }
        }}
        onCancel={() => setTier4Pending(null)}
        title="Claim from In Rotation deck?"
        description={
          tier4Pending
            ? `This copy is currently in ${tier4Pending.candidate.entry.assignedTo?.deckName ?? 'another deck'}. Removing it will make that deck incomplete. Continue?`
            : undefined
        }
        confirmLabel="Claim"
        isLoading={tier4Loading}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GroupSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border border-white/[0.08]"
      style={{ backgroundColor: 'rgba(26,26,30,0.5)' }}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--border-default)' }}>
        <span className="text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {subtitle && (
          <span className="text-[length:var(--fs-xs)] text-muted-foreground/50">
            · {subtitle}
          </span>
        )}
      </div>
      <div className="flex flex-col py-1">
        {children}
      </div>
    </div>
  )
}

function CardRow({
  cardName,
  isProxy,
  subtitle,
  scryfallPrintingId,
  action,
}: {
  cardName: string
  isProxy: boolean
  subtitle: string
  scryfallPrintingId: string | null
  action: React.ReactNode
}) {
  const { triggerProps, previewProps } = useCardHoverPreview({
    scryfallId: scryfallPrintingId,
    cardName,
  })

  const thumbUrl = scryfallPrintingId
    ? `https://cards.scryfall.io/small/front/${scryfallPrintingId.charAt(0)}/${scryfallPrintingId.charAt(1)}/${scryfallPrintingId}.jpg`
    : `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}&format=image&version=small`

  return (
    <div
      className="group/row flex items-center gap-2 px-3 py-1.5 border-b border-[rgba(255,255,255,0.04)] last:border-b-0 transition-colors hover:bg-white/[0.04]"
      {...triggerProps}
    >
      {/* Thumbnail */}
      <div className="shrink-0">
        <img src={thumbUrl} alt="" loading="lazy" className="h-[32px] w-[23px] rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
      </div>

      {/* Card info */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--fs-sm)] text-foreground">{cardName}</span>
        <span className="inline-flex items-center text-[length:var(--fs-xs)] text-muted-foreground">
          <span
            className="material-symbols-outlined inline-flex items-center justify-center mr-1"
            style={{ fontSize: '10px', fontVariationSettings: "'FILL' 1, 'wght' 400, 'opsz' 20", color: isProxy ? '#489ADE' : 'var(--signal-success)' }}
            aria-hidden="true"
          >
            {isProxy ? 'comedy_mask' : 'circle'}
          </span>
          {subtitle || (isProxy ? 'Proxy' : 'Original')}
        </span>
      </div>

      {/* Action */}
      {action}

      {/* Card preview — above/below row */}
      <CardHoverPreview {...previewProps} />
    </div>
  )
}

function EmptyColumn({ message }: { message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-white/[0.08] px-4 py-8"
      style={{ backgroundColor: 'rgba(26,26,30,0.3)' }}
    >
      <span className="text-[length:var(--fs-sm)] text-muted-foreground/50">{message}</span>
    </div>
  )
}

function formatDeckStatus(status: string): string {
  switch (status) {
    case 'brewing': return 'Brewing'
    case 'in_rotation': return 'In Rotation'
    case 'graveyard': return 'Graveyard'
    default: return status
  }
}

// ---------------------------------------------------------------------------
// Progress Bar
// ---------------------------------------------------------------------------

export function PicklistProgress({ cards, progress, action }: { cards: PicklistCard[]; progress: { resolved: number; total: number }; action?: React.ReactNode }) {
  const counts = useMemo(() => {
    let original = 0
    let proxy = 0
    let available = 0
    let claimed = 0
    let unowned = 0

    for (const card of cards) {
      if (card.isResolved) {
        if (card.ownershipStatus === 'proxy') proxy++
        else original++
      } else {
        const candidates = card.candidates
        if (candidates.length === 0 || candidates[0].tier === 5) {
          unowned++
        } else {
          const hasFree = candidates.some(c => !c.entry.assignedTo)
          if (hasFree) {
            available++
          } else {
            claimed++
          }
        }
      }
    }

    // Add basic lands (in progress.resolved but not in cards array) to original
    const landsCount = progress.resolved - (original + proxy)
    if (landsCount > 0) original += landsCount

    return { original, proxy, available, claimed, unowned, total: progress.total }
  }, [cards, progress])

  const resolved = counts.original + counts.proxy
  const pctOriginal = (counts.original / counts.total) * 100
  const pctProxy = (counts.proxy / counts.total) * 100
  const pctAvailable = (counts.available / counts.total) * 100
  const pctClaimed = (counts.claimed / counts.total) * 100
  const pctUnowned = (counts.unowned / counts.total) * 100

  return (
    <div className="mb-6 rounded-lg border border-white/[0.08] px-4 py-3" style={{ backgroundColor: 'rgba(26,26,30,0.5)' }}>
      {/* Count label + legend */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[length:var(--fs-sm)] font-medium text-foreground">
          {resolved}/{counts.total} Cards filled
        </span>
        <div className="flex flex-wrap items-center gap-2 md:gap-3 text-[length:var(--fs-xs)] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: 'var(--signal-success)' }} />
            {counts.original} Original
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: '#489ADE' }} />
            {counts.proxy} Proxy
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />
            {counts.available} In storage
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: '#F5880B' }} />
            {counts.claimed} In decks
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: '#EF44BF' }} />
            {counts.unowned} Unowned
          </span>
        </div>
      </div>

      {/* Stacked bar + action */}
      <div className="flex items-center gap-3">
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
          {pctOriginal > 0 && (
            <div style={{ width: `${pctOriginal}%`, backgroundColor: 'var(--signal-success)' }} className="transition-all" />
          )}
          {pctProxy > 0 && (
            <div style={{ width: `${pctProxy}%`, backgroundColor: '#489ADE' }} className="transition-all" />
          )}
          {pctAvailable > 0 && (
            <div style={{ width: `${pctAvailable}%`, backgroundColor: 'rgba(255,255,255,0.12)' }} className="transition-all" />
          )}
          {pctClaimed > 0 && (
            <div style={{ width: `${pctClaimed}%`, backgroundColor: '#F5880B' }} className="transition-all" />
          )}
          {pctUnowned > 0 && (
            <div style={{ width: `${pctUnowned}%`, backgroundColor: '#EF44BF' }} className="transition-all" />
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}
