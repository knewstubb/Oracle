'use client'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CardImage } from '@/components/CardImage'
import { CardSlotBadge } from '@/components/CardSlotBadge'
import { ManaCost } from '@/components/ManaCost'
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
import { setLabel, finishSuffix, titleCase } from './shared'
import { useCardDetailsData } from './useCardDetailsData'

type Context = 'deck'
type TabId = 'overview' | 'printings' | 'copies' | 'rulings'

/** The last tab used in each context, kept for the browser session. */
const lastTab: Partial<Record<Context, TabId>> = {}
/** For tests: forget the remembered tabs. */
export function resetCardDetailsTabMemory() {
  delete lastTab.deck
}
function rememberTab(context: Context, tab: TabId) {
  lastTab[context] = tab
}

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

const LEGALITY: Record<string, string> = { legal: 'Legal', not_legal: 'Not legal', banned: 'Banned', restricted: 'Restricted' }

export function CardDetails({ deckId, cardId, card, lastName, status, lifecycle, availableCategories, onSaveCategories, onClose }: CardDetailsProps) {
  const context: Context = 'deck'
  const uid = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const query = useCardDetailsData(deckId, cardId)
  const data = query.data
  const [tab, setTabState] = useState<TabId>(lastTab[context] ?? 'overview')
  const setTab = (t: TabId) => { rememberTab(context, t); setTabState(t) }
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
  const tabs: Array<{ id: TabId; label: string; count: number | null }> = [
    { id: 'overview', label: 'Overview', count: null },
    { id: 'printings', label: 'Printings', count: printingCount },
    { id: 'copies', label: 'Copies', count: data ? data.copies.length : null },
    { id: 'rulings', label: 'Rulings', count: data ? data.rulings.length : null },
  ]

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === tab)
    let next = i
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    else return
    e.preventDefault()
    setTab(tabs[next].id)
    document.getElementById(`${uid}-tab-${tabs[next].id}`)?.focus()
  }

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
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        showCloseButton={false}
        initialFocus={closeRef}
        data-testid="card-details"
        className="flex flex-col gap-0 overflow-hidden p-0 max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:grid sm:h-[min(600px,calc(100dvh-2rem))] sm:w-[min(1080px,calc(100vw-2rem))] sm:max-w-none sm:grid-cols-[252px_minmax(0,1fr)]"
      >
        {/* Rail: a column on desktop, a header strip on a phone */}
        <aside className="flex shrink-0 items-center gap-3 border-b border-[var(--border-default)] p-3 sm:flex-col sm:items-stretch sm:gap-4 sm:overflow-auto sm:border-r sm:border-b-0 sm:p-5" data-testid="card-details-rail">
          <div className="w-16 shrink-0 overflow-hidden sm:mx-auto sm:w-[212px] [&_[role=img]]:!h-auto [&_[role=img]]:!w-full [&_[role=img]]:aspect-[5/7]">
            <CardImage scryfallId={imageId} alt={name} width={212} height={296} noPreview className="aspect-[5/7] w-full rounded-lg" />
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:gap-3">
            {card && <div><CardSlotBadge status={status} lifecycle={lifecycle} variant="badge" /></div>}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[length:var(--fs-sm)] max-sm:grid-cols-[auto_auto] max-sm:text-[length:var(--fs-xs)]">
              <dt className="text-muted-foreground">Printing</dt>
              <dd className="text-right max-sm:text-left" data-testid="card-details-rail-printing">{railPrinting}</dd>
              <dt className="text-muted-foreground">Price</dt>
              <dd className="text-right max-sm:text-left">{railPrice}</dd>
              <dt className="text-muted-foreground">Commander</dt>
              <dd className="text-right max-sm:text-left">{railLegal}</dd>
            </dl>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-start gap-2 px-4 pt-4 max-sm:px-3 max-sm:pt-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <DialogTitle className="truncate text-[length:var(--fs-xl)] font-semibold">{name}</DialogTitle>
                {data?.facts?.manaCost && <ManaCost cost={data.facts.manaCost} />}
              </div>
              {subline && <p className="mt-0.5 text-[length:var(--fs-sm)] text-muted-foreground">{subline}</p>}
            </div>
            {card && (
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
            )}
            <DialogClose ref={closeRef} render={<Button variant="outline" size="icon" className="max-sm:size-11" aria-label="Close card details" />}>
              <span aria-hidden="true">✕</span>
            </DialogClose>
          </header>
          <DialogDescription className="sr-only">Details for {name} in this deck.</DialogDescription>
          {removeMutation.isError && <p role="alert" className="px-4 text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-critical)' }}>Couldn&apos;t remove the card. Nothing was changed.</p>}

          {!card ? (
            <div className="flex flex-col gap-3 p-4" data-testid="card-details-gone">
              <p>This card isn&apos;t in this deck any more.</p>
              <div><Button variant="outline" onClick={onClose}>Close</Button></div>
            </div>
          ) : (
            <>
              <div role="tablist" aria-label="Card details" onKeyDown={onTabKey} className="mt-3 flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border-default)] px-4 max-sm:px-3">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    id={`${uid}-tab-${t.id}`}
                    role="tab"
                    type="button"
                    aria-selected={tab === t.id}
                    aria-controls={`${uid}-panel-${t.id}`}
                    tabIndex={tab === t.id ? 0 : -1}
                    onClick={() => setTab(t.id)}
                    className={`shrink-0 border-b-2 px-3 py-2 text-[length:var(--fs-sm)] max-sm:min-h-11 ${tab === t.id ? 'border-[var(--text-primary)] font-medium' : 'border-transparent text-muted-foreground'}`}
                  >
                    {t.label}
                    {t.count != null && <span className="ml-1 text-[length:var(--fs-xs)] text-muted-foreground">{t.count}</span>}
                  </button>
                ))}
              </div>
              <div
                role="tabpanel"
                id={`${uid}-panel-${tab}`}
                aria-labelledby={`${uid}-tab-${tab}`}
                className="flex min-h-0 flex-1 flex-col"
                data-testid={`card-details-panel-${tab}`}
              >
                {query.isPending ? (
                  <div role="status" className="p-4">
                    <span className="sr-only">Loading details for {name}</span>
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : query.isError || !data ? (
                  <p className="p-4 text-[length:var(--fs-sm)]">
                    Couldn&apos;t load details for {name}. Nothing has changed.
                    <Button variant="link" size="sm" className="ml-2 max-sm:h-11" onClick={() => void query.refetch()}>Try again</Button>
                  </p>
                ) : tab === 'overview' ? (
                  <OverviewTab deckId={deckId} card={card} data={data} availableCategories={availableCategories} onSaveCategories={onSaveCategories} onGoToCopies={() => setTab('copies')} />
                ) : tab === 'printings' ? (
                  <PrintingsTab deckId={deckId} cardId={cardId} data={data} onPreview={onPreview} />
                ) : tab === 'copies' ? (
                  <CopiesTab deckId={deckId} cardId={cardId} data={data} />
                ) : (
                  <RulingsTab data={data} />
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
