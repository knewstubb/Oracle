/**
 * Picklist saved steps for one deck: cards the owner has picked up (In your hand) or could not find (Missing) for a
 * planned slot of this deck. Contract: docs/oracle/contracts/know-where-cards-are.md sections 4 and 4b.
 *
 * The pure part decides which planned slots are left to the normal grouping; the loader reads the saved steps.
 */

/** One saved step that belongs to a slot of this deck. */
export interface DeckMoveItem {
  itemId: number
  /** found = the card is In your hand; missing = the copy is flagged Missing. */
  state: 'found' | 'missing'
  copyId: number
  /** The planned slot this step is for (null if the step has no slot). */
  deckCardsId: number | null
  cardName: string
  isProxy: boolean
  /** Where it was picked up from: another deck (needs moving) or a box (available). */
  from: { kind: 'deck'; deckId: number; name: string } | { kind: 'box'; name: string } | null
}

/** Slots with a saved step are shown as In your hand / Missing rows, not as Available / Needs moving / Unowned. */
export function excludeSlotsWithOpenItems<T extends { deckCardsId: number }>(cards: readonly T[], items: readonly DeckMoveItem[]): T[] {
  const taken = new Set(items.map((i) => i.deckCardsId).filter((v): v is number => v !== null))
  return cards.filter((c) => !taken.has(c.deckCardsId))
}

/** Which group an In your hand / Missing row sits in: where it came from decides (spec 20.4). */
export function itemGroup(item: DeckMoveItem): 'available' | 'needsMoving' {
  return item.from?.kind === 'deck' ? 'needsMoving' : 'available'
}

interface ItemRow {
  id: number
  state: string
  copy_id: number | null
  to_deck_card_id: number | null
  card_name: string
  from_deck_id: number | null
  from_location_id: number | null
}
interface CopyRow { id: number; is_proxy: boolean; missing: boolean; in_hand: boolean }

/* eslint-disable @typescript-eslint/no-explicit-any -- the new tables are not in the generated types yet */
type Db = { from: (table: string) => any }
/**
 * Open saved steps whose planned destination is this deck. A step only counts while the copy is still in that state
 * (In your hand for found, Missing for missing), so a stale step never shows.
 */
export async function loadDeckMoveItems(client: unknown, userId: string, deckId: number): Promise<DeckMoveItem[]> {
  const db = client as Db
  const { data: items, error } = await db
    .from('move_items')
    .select('id, state, copy_id, to_deck_card_id, card_name, from_deck_id, from_location_id')
    .eq('user_id', userId)
    .eq('to_deck_id', deckId)
    .in('state', ['found', 'missing'])
  if (error) throw new Error(`move items lookup failed: ${error.message}`)
  const rows = ((items ?? []) as ItemRow[]).filter((r) => r.copy_id !== null)
  if (rows.length === 0) return []

  const copyIds = rows.map((r) => r.copy_id as number)
  const { data: copies, error: copyErr } = await db
    .from('user_copies')
    .select('id, is_proxy, missing, in_hand')
    .eq('user_id', userId)
    .in('id', copyIds)
  if (copyErr) throw new Error(`copy lookup failed: ${copyErr.message}`)
  const copyById = new Map(((copies ?? []) as CopyRow[]).map((c) => [c.id, c]))

  const deckIds = [...new Set(rows.map((r) => r.from_deck_id).filter((v): v is number => v !== null))]
  const locIds = [...new Set(rows.map((r) => r.from_location_id).filter((v): v is number => v !== null))]
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

  const out: DeckMoveItem[] = []
  for (const r of rows) {
    const copy = copyById.get(r.copy_id as number)
    if (!copy) continue
    if (r.state === 'found' && !copy.in_hand) continue
    if (r.state === 'missing' && !copy.missing) continue
    out.push({
      itemId: r.id,
      state: r.state as 'found' | 'missing',
      copyId: r.copy_id as number,
      deckCardsId: r.to_deck_card_id,
      cardName: r.card_name,
      isProxy: copy.is_proxy,
      from:
        r.from_deck_id !== null
          ? { kind: 'deck', deckId: r.from_deck_id, name: deckNames.get(r.from_deck_id) ?? `Deck ${r.from_deck_id}` }
          : r.from_location_id !== null
            ? { kind: 'box', name: locNames.get(r.from_location_id) ?? 'a box' }
            : null,
    })
  }
  return out.sort((a, b) => a.cardName.localeCompare(b.cardName) || a.itemId - b.itemId)
}
