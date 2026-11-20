'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DeckPickerPopover, type ValidDeck } from '@/components/DeckPickerPopover'
import { formatPrice } from '@/lib/collection-printing-utils'
import { CARD_DETAILS_LABELS as L } from '@/lib/card-details/labels'
import { createDeckInvalidators } from '@/hooks/useDeckQueryKeys'
import { CardDetailsShell, useRememberedTab, type ShellTab } from './CardDetailsShell'
import { CollectionOverviewTab } from './CollectionOverviewTab'
import { CollectionPrintingsTab } from './CollectionPrintingsTab'
import { CollectionCopiesTab } from './CollectionCopiesTab'
import { RulingsTab } from './RulingsTab'
import { LEGALITY, titleCase } from './shared'
import { useCollectionCardDetailsData, useRefreshCollectionDetails } from './useCollectionCardDetailsData'

const PREVIEW_DELAY_MS = 150

export interface CollectionCardDetailsProps {
  oracleId: string
  /** The name from the Collection list, shown while the details load. */
  cardName: string
  isInstanceSelected: (copyId: number) => boolean
  onToggleInstance: (copyId: number) => void
  onClose: () => void
}

export function CollectionCardDetails({ oracleId, cardName, isInstanceSelected, onToggleInstance, onClose }: CollectionCardDetailsProps) {
  const query = useCollectionCardDetailsData(oracleId)
  const data = query.data
  const refresh = useRefreshCollectionDetails(oracleId)
  const queryClient = useQueryClient()
  const [tab, setTab] = useRememberedTab('collection')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onPreview = useCallback((id: string | null) => {
    clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(() => setPreviewId(id), id === null ? 0 : PREVIEW_DELAY_MS)
  }, [])
  useEffect(() => () => clearTimeout(previewTimer.current), [])

  const name = data?.cardName ?? cardName
  // "Add to a deck": decks whose colours fit, loaded when the picker opens.
  const [pickerOpened, setPickerOpened] = useState(false)
  const validDecks = useQuery<ValidDeck[]>({
    queryKey: ['valid-decks', name],
    queryFn: async () => {
      const res = await fetch(`/api/allocation/valid-decks?cardName=${encodeURIComponent(name)}`)
      if (!res.ok) throw new Error('valid decks failed')
      return res.json()
    },
    enabled: pickerOpened,
  })
  const addToDeck = async (deck: ValidDeck) => {
    try {
      const res = await fetch(`/api/decks/${deck.deckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardName: name }),
      })
      if (!res.ok) throw new Error('add failed')
      toast.success(`Added ${name} to ${deck.deckName} as Planned`)
      createDeckInvalidators(queryClient).invalidateDeck(deck.deckId)
      refresh()
    } catch {
      toast.error(`Couldn't add ${name} to ${deck.deckName}. Nothing was changed.`)
    }
  }

  const tabs: ShellTab[] = [
    { id: 'overview', label: 'Overview', count: null },
    { id: 'printings', label: 'Printings', count: data ? new Set(data.printings.map((p) => p.scryfallId)).size : null },
    { id: 'copies', label: 'Copies', count: data ? data.copies.length : null },
    { id: 'rulings', label: 'Rulings', count: data ? data.rulings.length : null },
  ]
  const legal = data?.commanderLegality ? (LEGALITY[data.commanderLegality] ?? titleCase(data.commanderLegality)) : '—'
  const owned = data?.ownedCount ?? 0
  return (
    <CardDetailsShell
      name={name}
      manaCost={data?.facts?.manaCost}
      subline={data?.facts?.typeLine ?? ''}
      description={`Details for ${name} in your collection.`}
      imageId={previewId ?? data?.imageScryfallId ?? null}
      railExtras={
        <>
          {data && (
            <div>
              <span data-testid="card-details-own-pill" className="inline-flex items-center rounded-full border border-[var(--border-emphasis)] px-2.5 py-0.5 text-[length:var(--fs-sm)] font-medium text-foreground">
                {L.youOwn(owned)}
              </span>
            </div>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[length:var(--fs-sm)] max-sm:grid-cols-[auto_auto] max-sm:text-[length:var(--fs-xs)]">
            <dt className="text-muted-foreground">Collection value</dt>
            <dd className="text-right max-sm:text-left" data-testid="card-details-rail-value">{data ? formatPrice(data.collectionValue) : '—'}</dd>
            <dt className="text-muted-foreground">Cheapest</dt>
            <dd className="text-right max-sm:text-left" data-testid="card-details-rail-cheapest">{data ? formatPrice(data.cheapest) : '—'}</dd>
            <dt className="text-muted-foreground">Commander</dt>
            <dd className="text-right max-sm:text-left">{legal}</dd>
          </dl>
        </>
      }
      actions={
        // "Add a copy" is hidden: no existing route adds one original copy of one card (see the slice 2 report).
        <DeckPickerPopover
          validDecks={validDecks.data ?? []}
          isLoading={validDecks.isFetching}
          onSelect={(d) => void addToDeck(d)}
          onOpenChange={(o) => { if (o) setPickerOpened(true) }}
        >
          <Button variant="outline" size="sm" className="max-sm:h-11">{L.addToDeck}</Button>
        </DeckPickerPopover>
      }
      tabs={tabs}
      tab={tab}
      onTab={setTab}
      status={query.isPending ? 'loading' : query.isError || !data ? 'error' : 'ready'}
      onRetry={() => void query.refetch()}
      onClose={onClose}
    >
      {data && (
        tab === 'overview' ? (
          <CollectionOverviewTab data={data} refresh={refresh} />
        ) : tab === 'printings' ? (
          <CollectionPrintingsTab data={data} onPreview={onPreview} />
        ) : tab === 'copies' ? (
          <CollectionCopiesTab data={data} refresh={refresh} isInstanceSelected={isInstanceSelected} onToggleInstance={onToggleInstance} onPreview={onPreview} />
        ) : (
          <RulingsTab data={data} />
        )
      )}
    </CardDetailsShell>
  )
}
