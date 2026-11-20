/**
 * Loads everything the card details window needs in the collection context (read-only), keyed by oracle_id.
 * Any failed lookup throws, so the route answers 500 and never shows an empty answer as if it were true.
 */
import type { RefClient } from '@/lib/ref-card-text'
import { isCountableCard } from '@/lib/deck-list-data'
import type { MoveHereDeckState } from '@/lib/move-here'
import { getCardTags, supabaseTagReader } from '@/lib/card-tags-read'
import { shapePrintings, ownedKey, type PrintingFinishRow, type PrintingRow } from './printings'
import { deckInfos, fail, loadFacts, type CardFacts, type Ruling, type TagChip } from './load'
import { shapeCollectionCopies, collectionValue, cheapestPrice, type CollectionCopyRow, type CollectionCopyView } from './collection-copies'

export interface WaitingDeck {
  deckCardsId: number
  deckId: number
  deckName: string
  deckState: MoveHereDeckState
}

export interface CollectionCardDetails {
  oracleId: string
  cardName: string
  facts: CardFacts | null
  tags: TagChip[]
  printings: PrintingFinishRow[]
  copies: CollectionCopyView[]
  waitingDecks: WaitingDeck[]
  rulings: Ruling[]
  commanderLegality: string | null
  /** Copies that are not Missing (Proxies included). */
  ownedCount: number
  collectionValue: number | null
  cheapest: number | null
  /** A representative printing for the picture. */
  imageScryfallId: string | null
}

export async function loadCollectionCardDetails(supabase: RefClient, userId: string, oracleId: string): Promise<CollectionCardDetails> {
  const { data: cardRows, error: cErr } = await supabase.from('user_cards').select('id, card_name').eq('user_id', userId).eq('oracle_id', oracleId)
  if (cErr) fail('collection lookup', cErr)
  const userCards = (cardRows ?? []) as Array<{ id: number; card_name?: string | null }>
  const cardIds = userCards.map((c) => c.id)

  const { data: printingRows, error: pErr } = await supabase
    .from('ref_printings')
    .select('scryfall_id, name, set_code, set_name, collector_number, rarity, finishes, price_usd, price_usd_foil, released_at, image_uri_small, image_uri_normal, legality_commander')
    .eq('oracle_id', oracleId)
  if (pErr) fail('printings lookup', pErr)
  const printingList = (printingRows ?? []) as Array<PrintingRow & { name?: string; legality_commander?: string | null }>
  const cardName = userCards.find((c) => c.card_name)?.card_name ?? printingList.find((p) => p.name)?.name ?? 'Unknown card'

  const facts = await loadFacts(supabase, cardName)
  const tagRead = await getCardTags(supabaseTagReader(supabase), [oracleId])
  if (tagRead.status === 'error') fail('tags lookup', { message: 'tag read failed' })
  const tags: TagChip[] = (tagRead.byOracleId.get(oracleId) ?? []).map((t) => ({ key: t.key, displayName: t.name, kind: t.kind }))

  let copyRows: CollectionCopyRow[] = []
  if (cardIds.length > 0) {
    const { data, error } = await supabase
      .from('user_copies')
      .select('id, is_proxy, missing, condition, finish, printing_id, location_id, deck_cards!deck_cards_copy_id_fkey(id, deck_id)')
      .eq('user_id', userId)
      .in('card_id', cardIds)
    if (error) fail('copies lookup', error)
    copyRows = (data ?? []) as CollectionCopyRow[]
  }
  const locationIds = [...new Set(copyRows.filter((c) => c.location_id != null).map((c) => c.location_id as number))]
  const locationNames = new Map<number, string>()
  if (locationIds.length > 0) {
    const { data, error } = await supabase.from('user_locations').select('id, name').in('id', locationIds)
    if (error) fail('locations lookup', error)
    for (const l of (data ?? []) as Array<{ id: number; name: string }>) locationNames.set(l.id, l.name)
  }

  // Decks that plan this card without a copy sleeved: matched on the card name (front face for double-faced cards).
  const names = [...new Set([cardName, cardName.split(' // ')[0]])]
  const waitingRaw: Array<{ id: number; deck_id: number; categories: string | null }> = []
  for (const n of names) {
    const { data, error } = await supabase.from('deck_cards').select('id, deck_id, card_name, categories').eq('card_name', n).is('copy_id', null)
    if (error) fail('waiting decks lookup', error)
    for (const s of (data ?? []) as Array<{ id: number; deck_id: number; categories: string | null }>) {
      if (!waitingRaw.some((w) => w.id === s.id)) waitingRaw.push(s)
    }
  }
  const waitingSlots = waitingRaw.filter((s) => isCountableCard(s.categories))
  const deckIds = [...new Set([...copyRows.flatMap((c) => (c.deck_cards ?? []).map((d) => d.deck_id)), ...waitingSlots.map((s) => s.deck_id)])]
  // Only this user's decks: deckInfos reads decks by id, so filter the ids to the user's own first.
  let ownDeckIds = deckIds
  if (deckIds.length > 0) {
    const { data, error } = await supabase.from('decks').select('id').eq('user_id', userId).in('id', deckIds)
    if (error) fail('deck lookup', error)
    ownDeckIds = ((data ?? []) as Array<{ id: number }>).map((d) => d.id)
  }
  const decks = await deckInfos(supabase, ownDeckIds)
  const waitingDecks: WaitingDeck[] = waitingSlots
    .filter((s) => decks.has(s.deck_id))
    .map((s) => ({ deckCardsId: s.id, deckId: s.deck_id, deckName: decks.get(s.deck_id)!.name, deckState: decks.get(s.deck_id)!.state }))
    .sort((a, b) => a.deckName.localeCompare(b.deckName))

  const printingLookup = new Map(printingList.map((p) => [p.scryfall_id, p]))
  const copies = shapeCollectionCopies(copyRows, { decks, printings: printingLookup, locationNames })
  const owned = new Map<string, number>()
  for (const c of copyRows) {
    if (c.missing || c.is_proxy || !c.printing_id) continue
    const k = ownedKey(c.printing_id, c.finish)
    owned.set(k, (owned.get(k) ?? 0) + 1)
  }
  const printings = shapePrintings(printingList, { owned, slotScryfallId: null })

  const { data: rulingRows, error: rErr } = await supabase.from('ref_rulings').select('published_at, comment').eq('oracle_id', oracleId).order('published_at', { ascending: true })
  if (rErr) fail('rulings lookup', rErr)
  const rulings: Ruling[] = ((rulingRows ?? []) as Array<{ published_at: string; comment: string }>).map((r) => ({ publishedAt: r.published_at, comment: r.comment }))

  return {
    oracleId,
    cardName,
    facts,
    tags,
    printings,
    copies,
    waitingDecks,
    rulings,
    commanderLegality: printingList.find((p) => p.legality_commander)?.legality_commander ?? null,
    ownedCount: copies.filter((c) => c.state !== 'missing').length,
    collectionValue: collectionValue(copies),
    cheapest: cheapestPrice(printingList),
    imageScryfallId: copies.find((c) => c.printingId)?.printingId ?? printings[0]?.scryfallId ?? null,
  }
}
