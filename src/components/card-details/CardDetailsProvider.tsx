'use client'
/**
 * The card details modal is hosted above the card list because changing a category moves the card to another
 * group, which unmounts the row that opened it. Rows ask the host to open it with open(cardId, cardName).
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { StructuredCategories } from '@/lib/categoryUtils'
import type { DeckCard } from '@/components/CardGrid'
import type { CardSlotStatus, DeckCardLifecycle } from '@/lib/card-status'
import { CardDetails } from './CardDetails'
import { prefetchDeckOverview } from './useCardDetailsData'

interface CardDetailsApi {
  /** The name is kept so the modal can still say which card it was if the card leaves the deck. */
  open: (cardId: number, cardName: string) => void
  /** Start reading the Overview before the click (hover or focus on a card name). */
  prefetch: (cardId: number) => void
}
const CardDetailsContext = createContext<CardDetailsApi | null>(null)

/** Null outside a card list that hosts the modal (the row then keeps its old behaviour). */
export function useCardDetails(): CardDetailsApi | null {
  return useContext(CardDetailsContext)
}

export interface CardDetailsProviderProps {
  deckId: number
  /** The deck's live cards. The modal reads its card from here, so an edit shows at once. */
  cards: DeckCard[]
  statusMap: Map<number, CardSlotStatus>
  lifecycleMap: Map<number, DeckCardLifecycle>
  availableCategories: string[]
  /** The list's existing category save. Rejects when the save fails. */
  onSaveCategories: (cardId: number, categories: StructuredCategories) => Promise<unknown>
  children: ReactNode
}

export function CardDetailsProvider({ deckId, cards, statusMap, lifecycleMap, availableCategories, onSaveCategories, children }: CardDetailsProviderProps) {
  const [opened, setOpened] = useState<{ id: number; name: string } | null>(null)
  const queryClient = useQueryClient()
  const api = useMemo<CardDetailsApi>(
    () => ({ open: (id, name) => setOpened({ id, name }), prefetch: (id) => prefetchDeckOverview(queryClient, deckId, id) }),
    [queryClient, deckId],
  )
  const openId = opened?.id ?? null
  const card = openId == null ? undefined : cards.find((c) => c.id === openId)
  return (
    <CardDetailsContext.Provider value={api}>
      {children}
      {openId != null && (
        <CardDetails
          deckId={deckId}
          cardId={openId}
          card={card}
          lastName={opened?.name ?? ''}
          status={(statusMap.get(openId) === 'generic_land' ? 'original' : statusMap.get(openId)) ?? 'available'}
          lifecycle={lifecycleMap.get(openId) ?? 'planned'}
          availableCategories={availableCategories}
          onSaveCategories={onSaveCategories}
          onClose={() => setOpened(null)}
        />
      )}
    </CardDetailsContext.Provider>
  )
}
