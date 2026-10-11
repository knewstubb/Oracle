/**
 * Reconcile — overused cards.
 *
 * A card is overused when more deck slots want an original copy of it than the
 * user owns originals of. Proxies never count: a slot filled by a proxy adds no
 * demand, and a proxy copy adds no supply. Basic lands (they are interchangeable),
 * Maybeboard cards and cards the user owns no original of are left out.
 */
import { createAdminClient } from '@/lib/supabase'
import { isBasicLand } from '@/lib/basic-lands'

const PAGE_SIZE = 1000

export interface OveruseSlot {
  cardName: string
  deckId: number
  scryfallId: string | null
  copyId: number | null
  ownershipStatus: string | null
  quantity: number | null
  categories: string | null
}

export interface OveruseDeck {
  deckId: number
  deckName: string
  isActive: boolean
}

export interface OveruseDeckEntry extends OveruseDeck {
  /** Slots in this deck that want an original of the card. */
  slots: number
  /** How many of those slots already have a copy placed in the deck. */
  sleeved: number
}

export interface OverusedCard {
  cardName: string
  scryfallId: string | null
  originalsOwned: number
  slotsWanting: number
  overBy: number
  decks: OveruseDeckEntry[]
}

export interface OveruseResult {
  cards: OverusedCard[]
}

function isMaybeboard(categories: string | null): boolean {
  return (categories ?? '').includes('Maybeboard')
}

export function buildOveruse(
  slots: readonly OveruseSlot[],
  decks: readonly OveruseDeck[],
  originalsByName: ReadonlyMap<string, number>
): OveruseResult {
  const deckById = new Map(decks.map((d) => [d.deckId, d]))
  const byCard = new Map<string, OverusedCard>()

  for (const slot of slots) {
    if (isMaybeboard(slot.categories)) continue
    if (isBasicLand(slot.cardName)) continue
    if (slot.ownershipStatus === 'proxy') continue

    const deck = deckById.get(slot.deckId)
    if (!deck) continue

    const quantity = Math.max(1, slot.quantity ?? 1)
    let card = byCard.get(slot.cardName)
    if (!card) {
      card = {
        cardName: slot.cardName,
        scryfallId: slot.scryfallId,
        originalsOwned: originalsByName.get(slot.cardName) ?? 0,
        slotsWanting: 0,
        overBy: 0,
        decks: [],
      }
      byCard.set(slot.cardName, card)
    }
    if (!card.scryfallId && slot.scryfallId) card.scryfallId = slot.scryfallId

    let entry = card.decks.find((d) => d.deckId === slot.deckId)
    if (!entry) {
      entry = { ...deck, slots: 0, sleeved: 0 }
      card.decks.push(entry)
    }
    entry.slots += quantity
    if (slot.copyId !== null) entry.sleeved += quantity
    card.slotsWanting += quantity
  }

  const cards: OverusedCard[] = []
  for (const card of byCard.values()) {
    if (card.originalsOwned < 1) continue
    card.overBy = card.slotsWanting - card.originalsOwned
    if (card.overBy <= 0) continue
    card.decks.sort((a, b) => a.deckName.localeCompare(b.deckName))
    cards.push(card)
  }

  cards.sort((a, b) => b.overBy - a.overBy || a.cardName.localeCompare(b.cardName))
  return { cards }
}

async function fetchAll<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string
): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await load(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`Failed to fetch ${label}: ${error.message}`)
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

export async function fetchOveruse(userId: string): Promise<OveruseResult> {
  const supabase = createAdminClient()

  const [deckRows, slotRows, cardRows, copyRows] = await Promise.all([
    fetchAll(
      (from, to) =>
        supabase.from('decks').select('id, name, is_active').eq('user_id', userId).order('id').range(from, to),
      'decks'
    ),
    fetchAll(
      (from, to) =>
        supabase
          .from('deck_cards')
          .select('card_name, deck_id, scryfall_id, copy_id, ownership_status, quantity, categories')
          .eq('user_id', userId)
          .order('id')
          .range(from, to),
      'deck cards'
    ),
    fetchAll(
      (from, to) =>
        supabase.from('user_cards').select('id, card_name').eq('user_id', userId).order('id').range(from, to),
      'cards'
    ),
    fetchAll(
      (from, to) =>
        supabase
          .from('user_copies')
          .select('id, card_id')
          .eq('user_id', userId)
          .eq('is_proxy', false)
          .order('id')
          .range(from, to),
      'copies'
    ),
  ])

  const nameByCardId = new Map(cardRows.map((c) => [c.id, c.card_name]))
  const originalsByName = new Map<string, number>()
  for (const copy of copyRows) {
    const name = nameByCardId.get(copy.card_id)
    if (name) originalsByName.set(name, (originalsByName.get(name) ?? 0) + 1)
  }

  const decks: OveruseDeck[] = deckRows.map((d) => ({
    deckId: d.id,
    deckName: d.name,
    isActive: d.is_active === true,
  }))

  const slots: OveruseSlot[] = slotRows.map((s) => ({
    cardName: s.card_name,
    deckId: s.deck_id,
    scryfallId: s.scryfall_id,
    copyId: s.copy_id,
    ownershipStatus: s.ownership_status,
    quantity: s.quantity,
    categories: s.categories,
  }))

  return buildOveruse(slots, decks, originalsByName)
}
