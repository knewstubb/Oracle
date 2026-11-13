/**
 * GET /api/import/destinations
 *
 * The places the "Put these cards in" picker can offer (contract section 4c): Unsorted, the user's boxes and
 * binders, and (only once slice I2 is switched on) their decks with an "N empty slots" hint.
 * Never offered: Missing, In your hand, and the hidden per-deck location rows (type 'deck').
 * Read only. A failure answers 500 so the screen can say "could not load" and keep Unsorted usable (D-030).
 */
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { DECK_DESTINATION_ENABLED } from '@/lib/import-destination'
import { countEmptySlots, destinationDeckStatus, type DestinationSlotRow } from '@/lib/import-destinations-list'
import type { DestinationsResponse } from '../../../../../docs/oracle/contracts/know-where-cards-are.types'

const PAGE = 1000

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id
  const supabase = createAdminClient()

  try {
    const { data: locations, error: locErr } = await supabase
      .from('user_locations')
      .select('id, name, is_default')
      .eq('user_id', userId)
      .eq('type', 'storage')
      .order('sort_order', { ascending: true })
    if (locErr) throw new Error(locErr.message)

    const unsortedRow = (locations ?? []).find((l) => l.is_default)
    const boxes = (locations ?? []).filter((l) => !l.is_default)

    const storage: DestinationsResponse['storage'] = []
    for (const box of boxes) {
      const { count, error } = await supabase
        .from('user_copies')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('location_id', box.id)
      if (error) throw new Error(error.message)
      storage.push({ locationId: box.id, name: box.name, copyCount: count ?? 0 })
    }

    const decks: DestinationsResponse['decks'] = []
    if (DECK_DESTINATION_ENABLED) {
      const { data: deckRows, error: deckErr } = await supabase
        .from('decks')
        .select('id, name, format')
        .eq('user_id', userId)
        .order('name', { ascending: true })
      if (deckErr) throw new Error(deckErr.message)

      const slotsByDeck = new Map<number, DestinationSlotRow[]>()
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('deck_cards')
          .select('deck_id, copy_id, is_generic, generic_sleeved, categories')
          .eq('user_id', userId)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) throw new Error(error.message)
        for (const row of data ?? []) {
          const list = slotsByDeck.get(row.deck_id) ?? []
          list.push(row)
          slotsByDeck.set(row.deck_id, list)
        }
        if ((data ?? []).length < PAGE) break
      }

      for (const deck of deckRows ?? []) {
        const slots = slotsByDeck.get(deck.id) ?? []
        decks.push({
          deckId: deck.id,
          name: deck.name,
          format: deck.format,
          emptySlots: countEmptySlots(slots),
          status: destinationDeckStatus(slots, deck.format),
        })
      }
    }

    // 0 = the Unsorted location is not created yet; the insert function creates it on the first import.
    const body: DestinationsResponse = { unsorted: { locationId: unsortedRow?.id ?? 0 }, storage, decks }
    return Response.json(body)
  } catch (err) {
    console.error('[import destinations GET]', err)
    return Response.json({ error: 'failed', message: 'Could not load destinations' }, { status: 500 })
  }
}
