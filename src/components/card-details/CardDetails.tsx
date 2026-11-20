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
import { useCardDetailsData } from './useCardDetailsData'
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
  const query = useCardDetailsData(deckId, cardId)
  const data = query.data
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
  const name = data?.cardName ?? card?.card_name ?? lastName
  const printingCount = data ? new Set(data.printings.map((p) => p.scryfallId)).size : null
  const tabs: ShellTab[] = [
    { id: 'overview', label: 'Overview', count: null },
    { id: 'printings', label: 'Printings', count: printingCount },
    { id: 'copies', label: 'Copies', count: data ? data.copies.length : null },
    { id: 'rulings', label: 'Rulings', count: data ? data.rulings.length : null },
  ]
  // Rail values (all from the details lookup; nothing guessed)
  const slotRows = data?.printings.filter((p) => p.isSlotPrinting) ?? []
  const slotRow = slotRows.find((p) => p.finish === (data?.slot.finish ?? 'nonfoil')) ?? slotRows[0]
  const railPrinting = slotRow ? `${setLabel(slotRow.setCode, slotRow.collectorNumber)}${finishSuffix(slotRow.finish)}` : setLabel(data?.slot.setCode, null)
  const railPrice = slotRow ? (slotRow.priceUsd == null ? '—' : formatPrice(slotRow.priceUsd)) : '—'
  const railLegal = data?.commanderLegality ? (LEGALITY[data.commanderLegality] ?? titleCase(data.commanderLegality)) : '—'
  const imageId = previewId ?? data?.slot.scryfallId ?? card?.scryfall_id ?? null
  const rarity = slotRow ? titleCase(slotRow.rarity) : null
  const subline = [data?.facts?.typeLine, rarity, data?.deckName].filter(Boolean).join(' · ')
  return (
    <CardDetailsShell
      name={name}
      manaCost={data?.facts?.manaCost}
      subline={subline}
      description={`Details for ${name} in this deck.`}
      imageId={imageId}
      railExtras={
        <>
          {card && <div><CardSlotBadge status={status} lifecycle={lifecycle} variant="badge" /></div>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[length:var(--fs-sm)] max-sm:grid-cols-[auto_auto] max-sm:text-[length:var(--fs-xs)]">
            <dt className="text-muted-foreground">Printing</dt>
            <dd className="text-right max-sm:text-left" data-testid="card-details-rail-printing">{railPrinting}</dd>
            <dt className="text-muted-foreground">Price</dt>
            <dd className="text-right max-sm:text-left">{railPrice}</dd>
            <dt className="text-muted-foreground">Commander</dt>
            <dd className="text-right max-sm:text-left">{railLegal}</dd>
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
      status={query.isPending ? 'loading' : query.isError || !data ? 'error' : 'ready'}
      onRetry={() => void query.refetch()}
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
