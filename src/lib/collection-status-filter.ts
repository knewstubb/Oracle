/**
 * Collection screen status filter (server side). The toolbar sends `status` (comma-separated: fullyPlaced,
 * partiallyAvailable, unplaced, overAllocated; shown as All in deck / Some in deck / None in deck / Short).
 * A card matches when its status is any of the chosen ones. Status uses the same counts the collection rows show:
 * owned = the user's copies of that kind (originals on the Collection screen), in deck = the deck slots those copies
 * fill (deck_cards.quantity), and the rule is computeStatus. A card with no copies of that kind has no status
 * and matches none of them.
 */
import { computeStatus, STATUS_FILTERS, type StatusFilter } from '@/lib/collection-filters'
import type { createAdminClient } from '@/lib/supabase'

type Client = ReturnType<typeof createAdminClient>

export class InvalidStatusFilter extends Error {}

/** null when no status was asked for. An unknown value throws InvalidStatusFilter (the route answers 400). */
export function parseStatusFilter(raw: string | null): Set<StatusFilter> | null {
  const parts = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const out = new Set<StatusFilter>()
  for (const p of parts) {
    if (!(STATUS_FILTERS as readonly string[]).includes(p)) throw new InvalidStatusFilter(`Unknown status: ${p}`)
    out.add(p as StatusFilter)
  }
  return out
}

const BATCH = 1000

/**
 * The ids of the user's cards whose status is one of `statuses`. Reads every copy of the given kind and the deck slots
 * they fill, in pages of 1000. A failed read throws, so the screen shows its error state, never an empty list.
 */
export async function loadCardIdsWithStatus(
  supabase: Client,
  userId: string,
  statuses: Set<StatusFilter>,
  isProxy: boolean
): Promise<Set<number>> {
  const cardOfCopy = new Map<number, number>()
  const owned = new Map<number, number>()
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await supabase
      .from('user_copies')
      .select('id, card_id')
      .eq('user_id', userId)
      .eq('is_proxy', isProxy)
      .order('id', { ascending: true })
      .range(from, from + BATCH - 1)
    if (error) throw error
    const rows = (data ?? []) as Array<{ id: number; card_id: number }>
    for (const r of rows) {
      cardOfCopy.set(r.id, r.card_id)
      owned.set(r.card_id, (owned.get(r.card_id) ?? 0) + 1)
    }
    if (rows.length < BATCH) break
  }
  const inDeck = new Map<number, number>()
  if (cardOfCopy.size > 0) {
    for (let from = 0; ; from += BATCH) {
      const { data, error } = await supabase
        .from('deck_cards')
        .select('id, copy_id, quantity')
        .eq('user_id', userId)
        .not('copy_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + BATCH - 1)
      if (error) throw error
      const rows = (data ?? []) as Array<{ copy_id: number | null; quantity: number | null }>
      for (const r of rows) {
        const cardId = r.copy_id === null ? undefined : cardOfCopy.get(r.copy_id)
        if (cardId === undefined) continue
        inDeck.set(cardId, (inDeck.get(cardId) ?? 0) + (r.quantity ?? 1))
      }
      if (rows.length < BATCH) break
    }
  }
  const out = new Set<number>()
  for (const [cardId, ownedQuantity] of owned) {
    if (statuses.has(computeStatus({ ownedQuantity, inUseCount: inDeck.get(cardId) ?? 0 }))) out.add(cardId)
  }
  return out
}
