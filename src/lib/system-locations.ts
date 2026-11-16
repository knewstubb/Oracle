/**
 * In your hand / Missing lists for the two system places. Contract: know-where-cards-are.md (GET /api/locations/system).
 * Reads only. Card names are display only (D-003); every row is keyed by the real copy id.
 */
import type { SystemLocationsResponse } from '@/types/system-locations'
import { fetchStorageCopies } from '@/lib/storage/copies'
import type { SupabaseClient } from '@supabase/supabase-js'

export type SystemLocationsResponseWithDestinations = Omit<SystemLocationsResponse, 'inHand' | 'missing'> & {
  missing: { count: number; cards: Array<SystemLocationsResponse['missing']['cards'][number] & { lastSeenName: string | null; lookNext: Array<{ label: string; deckId: number | null; locationId: number | null }>; stepId: number | null }> }
  inHand: { count: number; cards: Array<SystemLocationsResponse['inHand']['cards'][number] & { destination: InHandDestination | null }> }
}
type Place = SystemLocationsResponse['missing']['cards'][number]['lastSeen']

interface CopyRow {
  id: number
  is_proxy: boolean
  in_hand: boolean
  missing: boolean
  missing_since: string | null
  user_cards: { card_name: string } | { card_name: string }[] | null
}
interface ItemRow {
  id: number
  state: string
  copy_id: number | null
  from_deck_id: number | null
  from_location_id: number | null
  to_deck_id?: number | null
  to_deck_card_id?: number | null
  to_location_id?: number | null
  looked_in?: Array<{ kind: 'deck' | 'location'; id: number }> | null
}

const nameOf = (r: CopyRow): string => (Array.isArray(r.user_cards) ? r.user_cards[0]?.card_name : r.user_cards?.card_name) ?? 'Unknown card'

/** Added to the contract shape: where an In your hand card is meant to go (its saved step's destination). */
export type InHandDestination =
  | { kind: 'deck'; deckId: number; deckCardId?: number; name: string }
  | { kind: 'location'; locationId: number; name: string }

const openItem = (items: readonly ItemRow[] | undefined): ItemRow | undefined =>
  [...(items ?? [])].filter((i) => i.state === 'found').sort((a, b) => b.id - a.id)[0]

/** The saved step that put a card on Missing (the latest one in that state), or undefined when there is none. */
export const missingItem = (items: readonly ItemRow[] | undefined): ItemRow | undefined =>
  [...(items ?? [])].filter((i) => i.state === 'missing').sort((a, b) => b.id - a.id)[0]

/** Where a Missing card was last seen: the place its latest saved step took it from (null when there is no record). */
export function lastSeenFrom(items: readonly ItemRow[]): Place {
  const latest = [...items].filter((i) => i.from_deck_id !== null || i.from_location_id !== null).sort((a, b) => b.id - a.id)[0]
  if (!latest) return null
  return latest.from_deck_id !== null
    ? { kind: 'deck', deckId: latest.from_deck_id }
    : { kind: 'location', locationId: latest.from_location_id as number }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the new columns/tables are not in the generated types yet */
export async function loadSystemLocations(client: SupabaseClient, userId: string): Promise<SystemLocationsResponseWithDestinations> {
  const db = client as any
  const { data: copies, error } = await db
    .from('user_copies')
    .select('id, is_proxy, in_hand, missing, missing_since, user_cards!user_copies_card_id_fkey(card_name)')
    .eq('user_id', userId)
    .or('in_hand.eq.true,missing.eq.true')
  if (error) throw new Error(`system places lookup failed: ${error.message}`)
  const rows = ((copies ?? []) as CopyRow[]).sort((a, b) => nameOf(a).localeCompare(nameOf(b)) || a.id - b.id)
  const ids = rows.map((r) => r.id)

  let items: ItemRow[] = []
  if (ids.length > 0) {
    const { data, error: itemErr } = await db
      .from('move_items')
      .select('id, state, copy_id, from_deck_id, from_location_id, to_deck_id, to_deck_card_id, to_location_id, looked_in')
      .eq('user_id', userId)
      .in('copy_id', ids)
    if (itemErr) throw new Error(`saved steps lookup failed: ${itemErr.message}`)
    items = (data ?? []) as ItemRow[]
  }
  const itemsByCopy = new Map<number, ItemRow[]>()
  for (const i of items) itemsByCopy.set(i.copy_id as number, [...(itemsByCopy.get(i.copy_id as number) ?? []), i])

  const deckIds = [...new Set(items.flatMap((i) => [i.to_deck_id, i.from_deck_id]).filter((v): v is number => !!v))]
  const locIds = [...new Set(items.flatMap((i) => [i.to_location_id, i.from_location_id]).filter((v): v is number => !!v))]
  const deckNames = new Map<number, string>()
  const locNames = new Map<number, string>()
  if (deckIds.length > 0) {
    const { data } = await db.from('decks').select('id, name').eq('user_id', userId).in('id', deckIds)
    for (const d of (data ?? []) as Array<{ id: number; name: string }>) deckNames.set(d.id, d.name)
  }
  if (locIds.length > 0) {
    const { data } = await db.from('user_locations').select('id, name').eq('user_id', userId).in('id', locIds)
    for (const l of (data ?? []) as Array<{ id: number; name: string }>) locNames.set(l.id, l.name)
  }
  const destinationOf = (i: ItemRow | undefined): InHandDestination | null =>
    !i ? null
    : i.to_deck_id ? { kind: 'deck', deckId: i.to_deck_id, deckCardId: i.to_deck_card_id ?? undefined, name: deckNames.get(i.to_deck_id) ?? 'a deck' }
    : i.to_location_id ? { kind: 'location', locationId: i.to_location_id, name: locNames.get(i.to_location_id) ?? 'a box' }
    : null

  const placeName = (p: Place): string | null =>
    !p ? null : p.kind === 'deck' ? (deckNames.get(p.deckId) ?? 'a deck') : (locNames.get(p.locationId) ?? 'a box')
  const inHand = rows.filter((r) => r.in_hand).map((r) => ({
    copyId: r.id,
    cardName: nameOf(r),
    isProxy: r.is_proxy,
    openItemId: openItem(itemsByCopy.get(r.id))?.id ?? null,
    destination: destinationOf(openItem(itemsByCopy.get(r.id))),
  }))
  // Where to look next (read only): other decks that list the same card, then Unsorted. Nothing is saved.
  const missingNames = [...new Set(rows.filter((r) => r.missing).map(nameOf))]
  const decksByCard = new Map<string, Array<{ deckId: number; name: string }>>()
  if (missingNames.length > 0) {
    const { data: dc } = await db.from('deck_cards').select('card_name, deck_id').in('card_name', missingNames)
    const listed = (dc ?? []) as Array<{ card_name: string; deck_id: number }>
    const ids = [...new Set(listed.map((d) => d.deck_id))]
    const { data: ds } = ids.length > 0 ? await db.from('decks').select('id, name').eq('user_id', userId).in('id', ids) : { data: [] }
    const nameById = new Map(((ds ?? []) as Array<{ id: number; name: string }>).map((d) => [d.id, d.name]))
    for (const d of listed) {
      const n = nameById.get(d.deck_id)
      if (n === undefined) continue
      const list = decksByCard.get(d.card_name) ?? []
      if (!list.some((x) => x.deckId === d.deck_id)) list.push({ deckId: d.deck_id, name: n })
      decksByCard.set(d.card_name, list)
    }
  }
  const { data: unsortedRow } = await db
    .from('user_locations').select('id').eq('user_id', userId).eq('is_default', true).eq('type', 'storage').maybeSingle()
  const unsortedId = (unsortedRow as { id: number } | null)?.id ?? null
  const missing = rows.filter((r) => r.missing).map((r) => {
    const step = missingItem(itemsByCopy.get(r.id))
    const checked = step?.looked_in ?? []
    const next = [
      ...(decksByCard.get(nameOf(r)) ?? []).map((d) => ({ label: d.name, deckId: d.deckId as number | null, locationId: null as number | null })),
      { label: 'Unsorted', deckId: null as number | null, locationId: unsortedId },
    ].filter((n) => !checked.some((c) => (n.deckId !== null ? c.kind === 'deck' && c.id === n.deckId : n.locationId !== null && c.kind === 'location' && c.id === n.locationId)))
    return {
    copyId: r.id,
    cardName: nameOf(r),
    isProxy: r.is_proxy,
    since: r.missing_since ?? '',
    lastSeen: lastSeenFrom(itemsByCopy.get(r.id) ?? []),
    lastSeenName: placeName(lastSeenFrom(itemsByCopy.get(r.id) ?? [])),
    lookNext: next,
    stepId: step?.id ?? null,
  }})

  const unsortedCount = (await fetchStorageCopies(client, userId, null)).length

  return {
    inHand: { count: inHand.length, cards: inHand },
    missing: { count: missing.length, cards: missing },
    unsorted: { count: unsortedCount, locationId: unsortedId ?? 0 },
  }
}
