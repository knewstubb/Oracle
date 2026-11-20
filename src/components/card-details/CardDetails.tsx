'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CardSlotBadge } from '@/components/CardSlotBadge'
import { formatPrice } from '@/lib/collection-printing-utils'
import { CARD_DETAILS_LABELS as L } from '@/lib/card-details/labels'
import type { StructuredCategories } from '@/lib/categoryUtils'
import type { DeckCard } from '@/components/CardGrid'
import type { CardSlotStatus, DeckCardLifecycle } from '@/lib/card-status'
import { createDeckInvalidators } from '@/hooks/useDeckQueryKeys'
import { OverviewTab } from './OverviewTab'
import { PrintingsTab } from './PrintingsTab'
import { CopiesTab } from './CopiesTab'
import { RulingsTab } from './RulingsTab'
import { setLabel, finishSuffix, titleCase, LEGALITY } from './shared'
import { useDeckCollection, useDeckOverview, useDeckRulings } from './useCardDetailsData'
import { Skeleton } from '@/components/ui/skeleton'
import type { CardDetails as CardDetailsData } from '@/lib/card-details/load'
import { CardDetailsShell, useRememberedTab, type ShellTab } from './CardDetailsShell'

export { resetCardDetailsTabMemory } from './CardDetailsShell'
const PREVIEW_DELAY_MS = 150

export interface CardDetailsProps {
  deckId: number
  cardId: number
  card: DeckCard | undefined
  lastName: string
  status: CardSlotStatus
  lifecycle: DeckCardLifecycle
  availableCategories: string[]
  onSaveCategories: (cardId: number, categories: StructuredCategories) => Promise<unknown>
  onClose: () => void
}


export function CardDetails({ deckId, cardId, card, lastName, status, lifecycle, availableCategories, onSaveCategories, onClose }: CardDetailsProps) {
  const overviewQuery = useDeckOverview(deckId, cardId)
  const overview = overviewQuery.data
  // Printings, Copies and Rulings load after the Overview (it tells us the card), in the background.
  const noOracle = !!overview && !overview.oracleId
  const collectionQuery = useDeckCollection(deckId, cardId, overview?.oracleId, !!overview)
  const rulingsQuery = useDeckRulings(deckId, cardId, overview?.oracleId, !!overview)
  const collection = noOracle ? { printings: [], copies: [] } : collectionQuery.data
  const rulings = noOracle ? [] : rulingsQuery.data?.rulings
  const [tab, setTab] = useRememberedTab('deck')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const queryClient = useQueryClient()
  const onPreview = useCallback((id: string | null) => {
    clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(() => setPreviewId(id), id === null ? 0 : PREVIEW_DELAY_MS)
  }, [])
  useEffect(() => () => clearTimeout(previewTimer.current), [])
  const removeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/cards/${cardId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Remove failed')
    },
    onSuccess: () => {
      toast.success(`Removed ${card?.card_name ?? lastName}`)
      createDeckInvalidators(queryClient).invalidateDeck(deckId)
      onClose()
    },
  })
  const name = overview?.cardName ?? card?.card_name ?? lastName
  const printingCount = collection ? new Set(collection.printings.map((p) => p.scryfallId)).size : null
  // What each tab reads, as one object. A section that has not arrived is empty, and its tab shows a placeholder.
  const data: CardDetailsData | undefined = overview && {
    ...overview,
    printings: collection?.printings ?? overview.slotPrintings,
    copies: collection?.copies ?? [],
    rulings: rulings ?? [],
  }
  const tabs: ShellTab[] = [
    { id: 'overview', label: 'Overview', count: null },
    { id: 'printings', label: 'Printings', count: printingCount },
    { id: 'copies', label: 'Copies', count: collection ? collection.copies.length : null },
    { id: 'rulings', label: 'Rulings', count: rulings ? rulings.length : null },
  ]
  // Rail values (all from the details lookup; nothing guessed)
  const slotRows = overview?.slotPrintings ?? []
  const slotRow = slotRows.find((p) => p.finish === (overview?.slot.finish ?? 'nonfoil')) ?? slotRows[0]
  const railPrinting = slotRow ? `${setLabel(slotRow.setCode, slotRow.collectorNumber)}${finishSuffix(slotRow.finish)}` : setLabel(overview?.slot.setCode, null)
  const railPrice = slotRow ? (slotRow.priceUsd == null ? '—' : formatPrice(slotRow.priceUsd)) : '—'
  const railLegal = overview?.commanderLegality ? (LEGALITY[overview.commanderLegality] ?? titleCase(overview.commanderLegality)) : '—'
  const imageId = previewId ?? overview?.slot.scryfallId ?? card?.scryfall_id ?? null
  // Until the Overview arrives, the header uses what the deck list already knows about the card.
  const rarity = slotRow ? titleCase(slotRow.rarity) : overview ? null : card?.rarity ? titleCase(card.rarity) : null
  const typeLine = overview ? overview.facts?.typeLine : card?.type_line
  const subline = [typeLine, rarity, overview?.deckName].filter(Boolean).join(' · ')
  const railLoading = !overview && overviewQuery.isPending
  const railValue = (v: string) => (railLoading ? <Skeleton className="ml-auto inline-block h-4 w-16 align-middle" aria-hidden="true" /> : v)
  const activeQuery = overviewQuery.isSuccess && !noOracle && tab !== 'overview' ? (tab === 'rulings' ? rulingsQuery : collectionQuery) : overviewQuery
  const panelStatus = activeQuery.isError ? 'error' : activeQuery.isSuccess ? 'ready' : 'loading'
  return (
    <CardDetailsShell
      name={name}
      manaCost={overview ? overview.facts?.manaCost : card?.mana_cost}
      subline={subline}
      description={`Details for ${name} in this deck.`}
      imageId={imageId}
      railExtras={
        <>
          {card && <div><CardSlotBadge status={status} lifecycle={lifecycle} variant="badge" /></div>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[length:var(--fs-sm)] max-sm:grid-cols-[auto_auto] max-sm:text-[length:var(--fs-xs)]">
            <dt className="text-muted-foreground">Printing</dt>
            <dd className="text-right max-sm:text-left" data-testid="card-details-rail-printing">{railValue(railPrinting)}</dd>
            <dt className="text-muted-foreground">Price</dt>
            <dd className="text-right max-sm:text-left">{railValue(railPrice)}</dd>
            <dt className="text-muted-foreground">Commander</dt>
            <dd className="text-right max-sm:text-left">{railValue(railLegal)}</dd>
          </dl>
        </>
      }
      actions={
        card && (
          confirmRemove ? (
            <span className="flex items-center gap-1.5" role="group" aria-label="Confirm remove">
              <Button variant="destructive" size="sm" className="max-sm:h-11" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate()}>
                {removeMutation.isPending ? 'Removing…' : 'Remove'}
              </Button>
              <Button variant="outline" size="sm" className="max-sm:h-11" onClick={() => setConfirmRemove(false)}>Keep</Button>
            </span>
          ) : (
            <Button variant="outline" size="sm" className="max-sm:h-11" onClick={() => setConfirmRemove(true)}>{L.removeFromDeck}</Button>
          )
        )
      }
      notice={removeMutation.isError && <p role="alert" className="px-4 text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-critical)' }}>Couldn&apos;t remove the card. Nothing was changed.</p>}
      tabs={tabs}
      tab={tab}
      onTab={setTab}
      status={panelStatus}
      onRetry={() => void activeQuery.refetch()}
      onClose={onClose}
      override={
        !card ? (
          <div className="flex flex-col gap-3 p-4" data-testid="card-details-gone">
            <p>This card isn&apos;t in this deck any more.</p>
            <div><Button variant="outline" onClick={onClose}>Close</Button></div>
          </div>
        ) : undefined
      }
    >
      {data && card && (
        tab === 'overview' ? (
          <OverviewTab deckId={deckId} card={card} data={data} availableCategories={availableCategories} onSaveCategories={onSaveCategories} onGoToCopies={() => setTab('copies')} />
        ) : tab === 'printings' ? (
          <PrintingsTab deckId={deckId} cardId={cardId} data={data} onPreview={onPreview} />
        ) : tab === 'copies' ? (
          <CopiesTab deckId={deckId} cardId={cardId} data={data} />
        ) : (
          <RulingsTab data={data} />
        )
      )}
    </CardDetailsShell>
  )
}
