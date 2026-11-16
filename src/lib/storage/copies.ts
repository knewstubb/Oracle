/**
 * Helpers for the Storage pages. Supabase returns at most 1000 rows per
 * request, so everything here pages explicitly.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const PAGE_SIZE = 1000

export interface StorageCopy {
  physicalCopyId: number
  cardName: string
  setName: string
  condition: string | null
  isFoil: boolean
  isProxy: boolean
  scryfallPrintingId: string | null
}

interface CopyRow {
  id: number
  printing_id: string | null
  finish: string | null
  is_proxy: boolean | null
  condition: string | null
  user_cards: { card_name: string } | { card_name: string }[] | null
  deck_cards?: { id: number }[] | null
}

/** Exact count of copies in a storage location (no row cap). */
export async function countCopiesInLocation(
  supabase: SupabaseClient,
  userId: string,
  locationId: number
): Promise<number> {
  const { count, error } = await supabase
    .from('user_copies')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('location_id', locationId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

/** Fetch copies (paged past 1000 rows) for a location, or unsorted when locationId is null. */
export async function fetchStorageCopies(
  supabase: SupabaseClient,
  userId: string,
  locationId: number | null
): Promise<StorageCopy[]> {
  const rows: CopyRow[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let q = supabase
      .from('user_copies')
      .select(
        'id, printing_id, finish, is_proxy, condition, user_cards!user_copies_card_id_fkey(card_name), deck_cards!deck_cards_copy_id_fkey(id)'
      )
      .eq('user_id', userId)
    // Unsorted is real storage only: a copy that is Missing or In your hand has no location but is not in Unsorted.
    q = locationId === null
      ? q.is('location_id', null).eq('missing', false).eq('in_hand', false)
      : q.eq('location_id', locationId)
    const { data, error } = await q
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...(data as unknown as CopyRow[]))
    if (data.length < PAGE_SIZE) break
  }

  // Unsorted = no location AND not assigned to a deck
  const kept = locationId === null ? rows.filter((r) => !r.deck_cards || r.deck_cards.length === 0) : rows

  const printingIds = [...new Set(kept.map((r) => r.printing_id).filter((x): x is string => !!x))]
  const setNames = new Map<string, string>()
  for (let i = 0; i < printingIds.length; i += 200) {
    const { data } = await supabase
      .from('ref_printings')
      .select('scryfall_id, set_name')
      .in('scryfall_id', printingIds.slice(i, i + 200))
    for (const p of data ?? []) setNames.set(p.scryfall_id, p.set_name ?? '')
  }

  return kept.map((r) => {
    const card = Array.isArray(r.user_cards) ? r.user_cards[0] : r.user_cards
    return {
      physicalCopyId: r.id,
      cardName: card?.card_name ?? 'Unknown card',
      setName: (r.printing_id && setNames.get(r.printing_id)) || '',
      condition: r.condition,
      isFoil: r.finish === 'foil' || r.finish === 'etched',
      isProxy: !!r.is_proxy,
      scryfallPrintingId: r.printing_id,
    }
  })
}
