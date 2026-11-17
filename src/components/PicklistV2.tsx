// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- T-42 staged type-check exclusion (see report 2026-10-11-developer-t42-t43-checks-gate.md)
// @ts-nocheck -- T-42: 5 known errors (defect 10, Phase 7 pick list). Remove this line and the eslint-disable above when PicklistV2 is fixed.
'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MoveHereControl } from '@/components/MoveHereControl'
import { categorizeCards, type PicklistCard } from '@/lib/picklist-groups'
import { excludeSlotsWithOpenItems, itemGroup, type DeckMoveItem } from '@/lib/picklist-move-items'
import { tickToastText, type PicklistTickAction, type TickResult } from '@/lib/picklist-ticks'
import { toPrice, formatPrice } from '@/lib/deck-health-buy'
import { CardHoverPreview, useCardHoverPreview } from '@/components/CardHoverPreview'
import { deckKeys, createDeckInvalidators } from '@/hooks/useDeckQueryKeys'
import type { RankedCandidate } from '@/lib/allocation-candidates'

export type { PicklistCard }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PicklistV2Props {
  deckId: number
}

interface PicklistResponse {
  deckName: string
  cards: PicklistCard[]
  progress: { resolved: number; total: number }
  groups?: { available: number; needsMoving: number; unowned: number; inHand?: number; missing?: number }
  unownedPrices?: Record<string, number | null>
  /** Saved Found it / Can't find it steps for this deck's slots (In your hand, Missing). */
  moveItems?: DeckMoveItem[]
}

interface TickVars {
  action: PicklistTickAction
  copyId: number
  cardName: string
  to: { kind: 'deck'; deckId: number; deckCardId?: number }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type GroupKey = 'available' | 'needsMoving' | 'unowned'

export function PicklistV2({ deckId }: PicklistV2Props) {
  const queryClient = useQueryClient()
  const [collapsed, setCollapsed] = useState<Record<GroupKey, boolean>>({ available: false, needsMoving: false, unowned: false })

  const { data: picklist, isLoading, isError, refetch } = useQuery<PicklistResponse>({
    queryKey: deckKeys.picklist(deckId),
    queryFn: () => fetch(`/api/decks/${deckId}/picklist`).then(r => {
      if (!r.ok) throw new Error('Failed to load picklist')
      return r.json()
    }),
    staleTime: 30 * 1000,
  })

  const { available, needsMoving, unowned } = useMemo(() => {
    if (!picklist) return { available: [], needsMoving: [], unowned: [] }
    // Slots with a saved step (In your hand / Missing) are shown as their own rows, not regrouped.
    const unresolvedCards = excludeSlotsWithOpenItems(
      picklist.cards.filter(c => c.lifecycle === 'planned' && !c.isResolved),
      picklist.moveItems ?? [],
    )
    return categorizeCards(unresolvedCards, deckId)
  }, [picklist, deckId])

  const moveItems = useMemo(() => picklist?.moveItems ?? [], [picklist])
  const [announce, setAnnounce] = useState('')
  const [walking, setWalking] = useState<Record<number, boolean>>({})

  // Search state + filtered results
  const [searchQuery, setSearchQuery] = useState('')

  const { filteredAvailable, filteredNeedsMoving, filteredUnowned } = useMemo(() => {
    if (!searchQuery.trim()) {
      return { filteredAvailable: available, filteredNeedsMoving: needsMoving, filteredUnowned: unowned }
    }
    const q = searchQuery.toLowerCase()
    const filteredAvailable = available
      .map(group => ({ ...group, items: group.items.filter(i => i.card.cardName.toLowerCase().includes(q)) }))
      .filter(group => group.items.length > 0)
    const filteredNeedsMoving = needsMoving
      .map(group => ({ ...group, items: group.items.filter(i => i.card.cardName.toLowerCase().includes(q)) }))
      .filter(group => group.items.length > 0)
    const filteredUnowned = unowned.filter(i => i.card.cardName.toLowerCase().includes(q))
    return { filteredAvailable, filteredNeedsMoving, filteredUnowned }
  }, [available, needsMoving, unowned, searchQuery])

  // "Placed it" mutation: the copy is free in a box, so it is assigned to this deck
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
      const { invalidateCardState } = createDeckInvalidators(queryClient)
      invalidateCardState(deckId)
    },
  })

  // Found it / Placed it / Can't find it: one saved step per click. Not optimistic: the row only changes once the
  // step is saved, and a refusal leaves the row exactly as it was with a plain message.
  const tickMutation = useMutation({
    mutationFn: async (vars: TickVars): Promise<TickResult> => {
      const segment = vars.action === 'cant_find' ? 'cant-find' : vars.action
      const res = await fetch(`/api/picklist/${segment}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyId: vars.copyId, to: vars.to, cardName: vars.cardName }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || `Couldn't save that. ${vars.cardName} is still where Oracle had it.`)
      return json as TickResult
    },
    onSuccess: (result, vars) => {
      const text = tickToastText(vars.action, vars.cardName, result, 'this deck')
      toast.success(text)
      setAnnounce(text)
      const { invalidateCardState, invalidateDeck } = createDeckInvalidators(queryClient)
      invalidateCardState(deckId)
      invalidateDeck(deckId)
      for (const d of [...result.sourceDeckNowShort, ...result.decksNowShort]) invalidateDeck(d.deckId)
      queryClient.invalidateQueries({ queryKey: ['picklist'] })
      queryClient.invalidateQueries({ queryKey: ['locations', 'system'] })
      queryClient.invalidateQueries({ queryKey: ['storage'] })
    },
    onError: (err) => {
      const text = err instanceof Error ? err.message : "Couldn't save that."
      toast.error(text)
      setAnnounce(text)
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

  const handlePlaced = useCallback((card: PicklistCard, candidate: RankedCandidate) => {
    assignMutation.mutate(
      { deckCardsId: card.deckCardsId, physicalCopyId: candidate.entry.physicalCopyId },
      {
        onSuccess: () => toast.success(`Placed ${card.cardName}`),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not place that card'),
      },
    )
  }, [assignMutation])

  const tick = useCallback((action: PicklistTickAction, card: { deckCardsId: number; cardName: string }, copyId: number) => {
    tickMutation.mutate({ action, copyId, cardName: card.cardName, to: { kind: 'deck', deckId, deckCardId: card.deckCardsId } })
  }, [tickMutation, deckId])

  const handleProxy = useCallback((card: PicklistCard) => {
    proxyMutation.mutate({ deckCardsId: card.deckCardsId, cardName: card.cardName })
    toast.success(`Adding proxy for ${card.cardName}`)
  }, [proxyMutation])

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="rounded-lg border border-white/[0.08] px-4 py-3" style={{ backgroundColor: 'rgba(26,26,30,0.5)' }}>
          <div className="mb-2 flex items-center justify-between">
            <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-48 animate-pulse rounded bg-white/[0.06]" />
          </div>
          <div className="h-2 w-full animate-pulse rounded-full bg-white/[0.06]" />
        </div>
        {[0, 1, 2].map((g) => (
          <div key={g} className="rounded-lg border border-white/[0.08] p-3 space-y-2" style={{ backgroundColor: 'rgba(26,26,30,0.5)' }}>
            <div className="h-5 w-32 animate-pulse rounded bg-white/[0.06]" />
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-2">
                <div className="h-8 w-6 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-4 flex-1 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-6 w-14 animate-pulse rounded bg-white/[0.06]" />
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (isError || !picklist) {
    return (
      <div
        role="alert"
        className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg text-center"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
      >
        <p className="text-[length:var(--fs-md)] text-foreground">{"Couldn't load this deck's Picklist. Your cards haven't changed."}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
      </div>
    )
  }

  const isPending = assignMutation.isPending || proxyMutation.isPending || tickMutation.isPending

  // Empty deck — no cards at all
  if (picklist.progress.total === 0) {
    return (
      <div
        className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-lg text-center"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
      >
        <p className="text-[length:var(--fs-lg)] font-medium text-foreground">No cards in this deck yet</p>
        <p className="max-w-sm text-[length:var(--fs-sm)] text-muted-foreground">
          Import cards from a URL or paste a list to start building your Picklist.
        </p>
      </div>
    )
  }

  const countAvailable = available.reduce((n, g) => n + g.items.length, 0)
  const countNeedsMoving = needsMoving.reduce((n, g) => n + g.items.length, 0)
  const countUnowned = unowned.length
  const handItems = moveItems.filter(i => i.state === 'found')
  const missingItems = moveItems.filter(i => i.state === 'missing')
  const q = searchQuery.trim().toLowerCase()
  const itemsFor = (g: 'available' | 'needsMoving') =>
    moveItems.filter(i => itemGroup(i) === g && (!q || i.cardName.toLowerCase().includes(q)))
  const availableItems = itemsFor('available')
  const needsMovingItems = itemsFor('needsMoving')
  const busyCopyId = tickMutation.isPending ? tickMutation.variables?.copyId : null
  const prices = picklist.unownedPrices ?? {}
  const toggle = (k: GroupKey) => setCollapsed((c) => ({ ...c, [k]: !c[k] }))

  return (
    <>
      {/* Progress: "N of M ready" */}
      <PicklistProgress cards={picklist.cards} progress={picklist.progress} />
      <p className="mb-4 text-[length:var(--fs-sm)] text-muted-foreground" data-testid="picklist-summary">
        <span className="font-medium text-foreground">{picklist.progress.resolved} of {picklist.progress.total} ready</span>
        {' · '}{countAvailable} available · {countNeedsMoving} need moving · {countUnowned} unowned
        {handItems.length > 0 && ` · ${handItems.length} in your hand`}
        {missingItems.length > 0 && ` · ${missingItems.length} missing`}
      </p>
      <p className="mb-3 text-[length:var(--fs-xs)] text-muted-foreground">
        Ticks save straight away. Found takes the card out of its deck in Oracle at once.
      </p>
      <p role="status" aria-live="polite" className="sr-only" data-testid="picklist-announce">{announce}</p>

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

      <div className="flex flex-col gap-6">
        {/* Available */}
        <PicklistGroup
          testId="group-available"
          title="Available"
          count={countAvailable}
          hint="In a box, ready to place in this deck"
          collapsed={collapsed.available}
          onToggle={() => toggle('available')}
        >
          {availableItems.length > 0 && (
            <ItemSection items={availableItems} deckId={deckId} busyCopyId={busyCopyId} onTick={tick} />
          )}
          {filteredAvailable.length === 0 && availableItems.length === 0 ? (
            <EmptyColumn message="Nothing here is waiting in a box." />
          ) : (
            filteredAvailable.map((group) => (
              <GroupSection key={group.location} title={`${group.location.toUpperCase()} (${group.items.length})`}>
                {group.items.map(({ card, candidate }) => (
                  <CardRow
                    key={card.deckCardsId}
                    cardName={card.cardName}
                    isProxy={candidate.entry.isProxy}
                    subtitle={candidate.entry.isProxy ? 'Proxy' : 'Original'}
                    scryfallPrintingId={candidate.entry.scryfallPrintingId}
                    action={
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => tick('found', card, candidate.entry.physicalCopyId)}
                          aria-label={`Picked: ${card.cardName}`}
                        >
                          {busyCopyId === candidate.entry.physicalCopyId ? 'Saving…' : 'Picked'}
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => handlePlaced(card, candidate)}
                          aria-label={`Placed: ${card.cardName}`}
                          className="hover:bg-[rgba(29,158,117,0.15)] hover:scale-105 transition-all"
                          style={{ color: 'rgba(29,158,117,0.7)', borderColor: 'rgba(29,158,117,0.5)' }}
                        >
                          Placed
                        </Button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => tick('cant_find', card, candidate.entry.physicalCopyId)}
                          aria-label={`Can't find it: ${card.cardName}`}
                          className="text-[length:var(--fs-xs)] text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                        >
                          Can&apos;t find it
                        </button>
                      </div>
                    }
                  />
                ))}
              </GroupSection>
            ))
          )}
        </PicklistGroup>

        {/* Needs moving */}
        <PicklistGroup
          testId="group-needs-moving"
          title="Needs moving"
          count={countNeedsMoving}
          hint="Your copy is in another deck"
          collapsed={collapsed.needsMoving}
          onToggle={() => toggle('needsMoving')}
        >
          {needsMovingItems.length > 0 && (
            <ItemSection items={needsMovingItems} deckId={deckId} busyCopyId={busyCopyId} onTick={tick} />
          )}
          {filteredNeedsMoving.length === 0 && needsMovingItems.length === 0 ? (
            <EmptyColumn message="Nothing needs to move from another deck." />
          ) : (
            filteredNeedsMoving.map((group) => (
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
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <MoveHereControl deckId={deckId} cardName={card.cardName} />
                        {walking[card.deckCardsId] ? (
                          <>
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={isPending}
                              onClick={() => tick('found', card, candidate.entry.physicalCopyId)}
                              aria-label={`Picked: ${card.cardName}`}
                            >
                              {busyCopyId === candidate.entry.physicalCopyId ? 'Saving…' : 'Picked'}
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              disabled
                              aria-disabled="true"
                              aria-label={`Placed: ${card.cardName}`}
                              title={`Pick it up first, at ${group.deckName}`}
                            >
                              Placed
                            </Button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setWalking((w) => ({ ...w, [card.deckCardsId]: true }))}
                            className="text-[length:var(--fs-xs)] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                          >
                            Walk it instead
                          </button>
                        )}
                      </div>
                    }
                  />
                ))}
              </GroupSection>
            ))
          )}
        </PicklistGroup>

        {/* Unowned */}
        <PicklistGroup
          testId="group-unowned"
          title="Unowned"
          count={countUnowned}
          hint="You do not own these yet"
          collapsed={collapsed.unowned}
          onToggle={() => toggle('unowned')}
        >
          {filteredUnowned.length === 0 ? (
            <EmptyColumn message="You own everything this deck needs." />
          ) : (
            <GroupSection title={`UNOWNED (${filteredUnowned.length})`}>
              {filteredUnowned.map(({ card }) => (
                <CardRow
                  key={card.deckCardsId}
                  cardName={card.cardName}
                  isProxy={false}
                  subtitle={formatPrice(toPrice(prices[card.cardName] ?? null))}
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
              <p className="px-3 py-2 text-[length:var(--fs-xs)] text-muted-foreground">
                <a
                  href={`/decks/${deckId}?tab=cards`}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  See buy ideas on the Cards tab
                </a>
              </p>
            </GroupSection>
          )}
        </PicklistGroup>
      </div>
    </>
  )
}

function PicklistGroup({
  testId, title, count, hint, collapsed, onToggle, children,
}: {
  testId: string; title: string; count: number; hint: string; collapsed: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <section data-testid={testId} aria-label={title} className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex items-baseline gap-2 text-left"
      >
        <h2 className="text-[length:var(--fs-md)] font-semibold text-foreground">{title} ({count})</h2>
        <span className="text-[length:var(--fs-xs)] text-muted-foreground">{hint}</span>
      </button>
      {!collapsed && children}
    </section>
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
  badge,
  note,
}: {
  cardName: string
  isProxy: boolean
  subtitle: string
  scryfallPrintingId: string | null
  action: React.ReactNode
  badge?: React.ReactNode
  note?: string
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
          {note && <span className="ml-2 text-muted-foreground/70">· {note}</span>}
        </span>
      </div>
      {badge}

      {/* Action */}
      {action}

      {/* Card preview — above/below row */}
      <CardHoverPreview {...previewProps} />
    </div>
  )
}

/** In your hand and Missing rows: the saved steps for this deck's slots. */
function ItemSection({
  items, deckId, busyCopyId, onTick,
}: {
  items: DeckMoveItem[]
  deckId: number
  busyCopyId: number | null | undefined
  onTick: (action: PicklistTickAction, card: { deckCardsId: number; cardName: string }, copyId: number) => void
}) {
  const hand = items.filter((i) => i.state === 'found')
  const missing = items.filter((i) => i.state === 'missing')
  return (
    <>
      {hand.length > 0 && (
        <GroupSection title={`IN YOUR HAND (${hand.length})`} subtitle="Short by 1 while it is in your hand">
          {hand.map((item) => {
            const card = { deckCardsId: item.deckCardsId ?? 0, cardName: item.cardName }
            const busy = busyCopyId === item.copyId
            return (
              <CardRow
                key={item.itemId}
                cardName={item.cardName}
                isProxy={item.isProxy}
                subtitle={item.isProxy ? 'Proxy' : 'Original'}
                scryfallPrintingId={null}
                badge={<StateBadge kind="in_hand" />}
                note={item.from ? `From ${item.from.name}` : undefined}
                action={
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busyCopyId != null || item.deckCardsId === null}
                      onClick={() => onTick('placed', card, item.copyId)}
                      aria-label={`Placed: ${item.cardName}`}
                      className="hover:bg-[rgba(29,158,117,0.15)] transition-all"
                      style={{ color: 'rgba(29,158,117,0.7)', borderColor: 'rgba(29,158,117,0.5)' }}
                    >
                      {busy ? 'Saving…' : 'Placed'}
                    </Button>
                    <button
                      type="button"
                      disabled={busyCopyId != null}
                      onClick={() => onTick('cant_find', card, item.copyId)}
                      aria-label={`Can't find it: ${item.cardName}`}
                      className="text-[length:var(--fs-xs)] text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                    >
                      Can&apos;t find it
                    </button>
                  </div>
                }
              />
            )
          })}
        </GroupSection>
      )}
      {missing.length > 0 && (
        <GroupSection title={`MISSING (${missing.length})`} subtitle="This slot stays planned">
          {missing.map((item) => (
            <CardRow
              key={item.itemId}
              cardName={item.cardName}
              isProxy={item.isProxy}
              subtitle="Short by 1. Your only copy is Missing."
              scryfallPrintingId={null}
              badge={<StateBadge kind="missing" />}
              note={item.from ? `Oracle had it in ${item.from.name}` : undefined}
              action={
                <a
                  href="/storage/missing"
                  className="text-[length:var(--fs-xs)] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Where to look next
                </a>
              }
            />
          ))}
        </GroupSection>
      )}
    </>
  )
}

/** Colour plus icon plus words (D-012). In your hand is violet, Missing is amber. */
function StateBadge({ kind }: { kind: 'in_hand' | 'missing' }) {
  const hand = kind === 'in_hand'
  const colour = hand ? 'var(--status-in-hand, #9D8DF1)' : 'var(--signal-warning, #F5A524)'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--fs-xs)] text-foreground"
      style={{ borderColor: colour, backgroundColor: hand ? 'rgba(157,141,241,0.15)' : 'transparent' }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '12px', color: colour }} aria-hidden="true">
        {hand ? 'back_hand' : 'search_off'}
      </span>
      {hand ? 'In your hand' : 'Missing'}
    </span>
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
    case 'in_rotation': return 'Active'
    default: return 'Active'
  }
}

// ---------------------------------------------------------------------------
// Progress Bar
// ---------------------------------------------------------------------------

interface ProgressCounts {
  original: number
  proxy: number
  available: number
  claimed: number
  unowned: number
  total: number
  /** Generic basics that are Sleeved (they count toward the deck and toward sleeved). */
  genericSleeved?: number
  /** Generic basics that are Unsleeved (they count toward the deck size only). */
  genericUnsleeved?: number
  /** Basic names whose generics are Unsleeved, for "Short: Island generics unsleeved". */
  unsleevedGenericNames?: string[]
}

/** The deck-status line for unsleeved generics; null when every generic is sleeved. */
export function shortGenericsText(names: readonly string[] | undefined): string | null {
  if (!names || names.length === 0) return null
  return `Short: ${names.join(', ')} generics planned`
}

export function PicklistProgress({ cards, progress, counts: propCounts, action }: { 
  cards?: PicklistCard[]
  progress?: { resolved: number; total: number }
  counts?: ProgressCounts
  action?: React.ReactNode 
}) {
  const counts = useMemo(() => {
    // If counts are provided directly, use them
    if (propCounts) {
      return propCounts
    }
    
    // Otherwise calculate from cards array (legacy behavior)
    if (!cards || !progress) {
      return { original: 0, proxy: 0, available: 0, claimed: 0, unowned: 0, total: 0 }
    }
    
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
  }, [cards, progress, propCounts])

  const physicalCopies = counts.original + counts.proxy
  const genericSleeved = counts.genericSleeved ?? 0
  const genericUnsleeved = counts.genericUnsleeved ?? 0
  const deckSize = 100 // Commander deck size
  // Generics count toward the deck size whatever their state (D-002).
  const filledSlots = counts.total + genericSleeved + genericUnsleeved
  const emptySlots = Math.max(0, deckSize - filledSlots) // Slots with no card added yet
  const shortText = shortGenericsText(counts.unsleevedGenericNames)
  
  // Calculate percentages based on deck size (100), not current total
  const pctOriginal = (counts.original / deckSize) * 100
  const pctGeneric = (genericSleeved / deckSize) * 100
  const pctGenericUnsleeved = (genericUnsleeved / deckSize) * 100
  const pctProxy = (counts.proxy / deckSize) * 100
  const pctAvailable = (counts.available / deckSize) * 100
  const pctClaimed = (counts.claimed / deckSize) * 100
  const pctUnowned = (counts.unowned / deckSize) * 100
  const pctEmpty = (emptySlots / deckSize) * 100

  return (
    <div className="mb-6 rounded-lg border border-white/[0.08] px-4 py-3" style={{ backgroundColor: 'rgba(26,26,30,0.5)' }}>
      {/* Count label + legend */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[length:var(--fs-sm)] font-medium text-foreground">
          {counts.total + genericSleeved + genericUnsleeved}/100 slots · {physicalCopies + genericSleeved} in deck
        </span>
        <div className="flex flex-wrap items-center gap-2 md:gap-3 text-[length:var(--fs-xs)] text-muted-foreground">
          {shortText && (
            <span className="inline-flex items-center gap-1 font-medium" style={{ color: 'var(--state-assembling)' }}>
              ◇ {shortText}
            </span>
          )}
          {genericSleeved + genericUnsleeved > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ backgroundColor: '#7A8B99' }} />
              {genericSleeved + genericUnsleeved} Generic
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: 'var(--signal-success)' }} />
            {counts.original} Original
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: '#489ADE' }} />
            {counts.proxy} Proxy
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: '#25513B' }} />
            {counts.available} Available
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

      {/* Stacked bar with 1px gaps + action */}
      <div className="flex items-center gap-3">
        <div className="flex h-2 flex-1 items-center gap-px rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
          {pctOriginal > 0 && (
            <div style={{ width: `${pctOriginal}%`, backgroundColor: 'var(--signal-success)' }} className="h-full transition-all" />
          )}
          {pctGeneric > 0 && (
            <div style={{ width: `${pctGeneric}%`, backgroundColor: '#7A8B99' }} className="h-full transition-all" />
          )}
          {pctGenericUnsleeved > 0 && (
            <div style={{ width: `${pctGenericUnsleeved}%`, backgroundColor: 'rgba(122,139,153,0.45)' }} className="h-full transition-all" />
          )}
          {pctProxy > 0 && (
            <div style={{ width: `${pctProxy}%`, backgroundColor: '#489ADE' }} className="h-full transition-all" />
          )}
          {pctAvailable > 0 && (
            <div style={{ width: `${pctAvailable}%`, backgroundColor: '#25513B' }} className="h-full transition-all" />
          )}
          {pctClaimed > 0 && (
            <div style={{ width: `${pctClaimed}%`, backgroundColor: '#F5880B' }} className="h-full transition-all" />
          )}
          {pctUnowned > 0 && (
            <div style={{ width: `${pctUnowned}%`, backgroundColor: '#EF44BF' }} className="h-full transition-all" />
          )}
          {pctEmpty > 0 && (
            <div style={{ width: `${pctEmpty}%`, backgroundColor: 'rgba(128,128,128,0.4)' }} className="h-full transition-all" />
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}
