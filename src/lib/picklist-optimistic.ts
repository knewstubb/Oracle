/**
 * Optimistic view of a deck's Picklist: what the screen shows the moment a button is clicked, before the save
 * answers. Pure. Each function is safe to apply on data that already contains the saved result, so a re-read of
 * the server data that lands mid-save (or just after it) never shows a duplicate or flips the row back.
 */
import type { PicklistCard } from '@/lib/picklist-groups'
import type { DeckMoveItem } from '@/lib/picklist-move-items'
import type { PicklistTickAction } from '@/lib/picklist-ticks'

export interface OptimisticTick {
  action: PicklistTickAction
  copyId: number
  /** The planned slot of this deck the tick is for. */
  deckCardsId: number | null
  cardName: string
  isProxy: boolean
  /** Where the card was taken from; used when the row has no saved step yet. */
  from: DeckMoveItem['from']
}

interface DeckPicklistData {
  cards: PicklistCard[]
  progress: { resolved: number; total: number }
  moveItems?: DeckMoveItem[]
}

export function applyOptimisticTicks<T extends DeckPicklistData>(data: T, ticks: readonly OptimisticTick[]): T {
  if (ticks.length === 0) return data
  let items = [...(data.moveItems ?? [])]
  let cards = data.cards
  let resolved = data.progress.resolved
  for (const t of ticks) {
    const existing = items.find((i) => i.copyId === t.copyId)
    items = items.filter((i) => i.copyId !== t.copyId)
    if (t.action === 'placed') {
      const slot = cards.find((c) => c.deckCardsId === t.deckCardsId)
      if (slot && !slot.isResolved) {
        resolved += 1
        cards = cards.map((c) =>
          c === slot ? { ...c, isResolved: true, ownershipStatus: t.isProxy ? 'proxy' : 'original' } : c,
        )
      }
    } else {
      items.push({
        itemId: existing?.itemId ?? -t.copyId,
        state: t.action === 'found' ? 'found' : 'missing',
        copyId: t.copyId,
        deckCardsId: t.deckCardsId,
        cardName: t.cardName,
        isProxy: t.isProxy,
        from: existing?.from ?? t.from,
      })
    }
  }
  items.sort((a, b) => a.cardName.localeCompare(b.cardName) || a.itemId - b.itemId)
  return { ...data, cards, moveItems: items, progress: { ...data.progress, resolved } }
}
