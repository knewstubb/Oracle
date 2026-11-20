/**
 * Loads everything the card details window needs in the collection context (read-only), keyed by oracle_id.
 * Any failed lookup throws, so the route answers 500 and never shows an empty answer as if it were true.
 */
import type { RefClient } from '@/lib/ref-card-text'
import { isCountableCard } from '@/lib/deck-list-data'
import type { MoveHereDeckState } from '@/lib/move-here'
import { getCardTags, supabaseTagReader } from '@/lib/card-tags-read'
import { shapePrintings, type PrintingFinishRow } from './printings'
import {
  buildDeckInfos, fail, loadFacts, loadPrintingRows, loadRulings, ownedCounts, readCopyRows, readDeckSlots, readLocationNames,
  type CardFacts, type DeckRow, type Ruling, type TagChip,
} from './load'
import { shapeCollectionCopies, collectionValue, cheapestPrice, type CollectionCopyRow, type CollectionCopyView } from './collection-copies'

export interface WaitingDeck {
  deckCardsId: number
  deckId: number
  deckName: string
  deckState: MoveHereDeckState
}

/** Everything except rulings, which the window loads separately. */
export type CollectionMainDetails = Omit<CollectionCardDetails, 'rulings'>

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

/**
 * Everything the window shows except rulings. Reads that do not depend on each other run together: the copies, the
 * printings, the Tags and the user's decks first; then the facts, the waiting decks and the locations; then the slots.
 */
export async function loadCollectionMain(supabase: RefClient, userId: string, oracleId: string): Promise<CollectionMainDetails> {
  const [copyRows, printingList, tagRead, ownDecksRes] = await Promise.all([
    readCopyRows<CollectionCopyRow & { user_cards?: { card_name?: string | null } | null }>(supabase, userId, oracleId),
    loadPrintingRows(supabase, oracleId),
    getCardTags(supabaseTagReader(supabase), [oracleId]),
    supabase.from('decks').select('id, name, format').eq('user_id', userId),
  ])
  if (tagRead.status === 'error') fail('tags lookup', { message: 'tag read failed' })
  if (ownDecksRes.error) fail('deck lookup', ownDecksRes.error)
  const tags: TagChip[] = (tagRead.byOracleId.get(oracleId) ?? []).map((t) => ({ key: t.key, displayName: t.name, kind: t.kind }))
  const ownDecks = (ownDecksRes.data ?? []) as DeckRow[]
  const ownDeckIds = new Set(ownDecks.map((d) => d.id))
  const cardName = copyRows.find((c) => c.user_cards?.card_name)?.user_cards?.card_name ?? printingList.find((p) => p.name)?.name ?? 'Unknown card'

  // Decks that plan this card without a copy sleeved: matched on the card name (front face for double-faced cards).
  const names = [...new Set([cardName, cardName.split(' // ')[0]])]
  const locationIds = [...new Set(copyRows.filter((c) => c.location_id != null).map((c) => c.location_id as number))]
  // The slots of the decks that hold a copy are read at the same time as the waiting decks are found.
  const copyDeckIds = [...new Set(copyRows.flatMap((c) => (c.deck_cards ?? []).map((d) => d.deck_id)))].filter((id) => ownDeckIds.has(id))
  const [facts, waitingResults, locationNames, copyDeckSlots] = await Promise.all([
    loadFacts(supabase, cardName),
    Promise.all(names.map((n) => supabase.from('deck_cards').select('id, deck_id, card_name, categories').eq('card_name', n).is('copy_id', null))),
    readLocationNames(supabase, locationIds),
    readDeckSlots(supabase, copyDeckIds),
  ])
  const waitingRaw: Array<{ id: number; deck_id: number; categories: string | null }> = []
  for (const { data, error } of waitingResults) {
    if (error) fail('waiting decks lookup', error)
    for (const s of (data ?? []) as Array<{ id: number; deck_id: number; categories: string | null }>) {
      if (!waitingRaw.some((w) => w.id === s.id)) waitingRaw.push(s)
    }
  }
  const waitingSlots = waitingRaw.filter((s) => isCountableCard(s.categories) && ownDeckIds.has(s.deck_id))
  // Only decks that wait for the card and hold none of its copies need a further read.
  const extraDeckIds = [...new Set(waitingSlots.map((s) => s.deck_id))].filter((id) => !copyDeckIds.includes(id))
  const extraSlots = await readDeckSlots(supabase, extraDeckIds)
  const deckIds = [...copyDeckIds, ...extraDeckIds]
  const decks = buildDeckInfos(ownDecks.filter((d) => deckIds.includes(d.id)), [...copyDeckSlots, ...extraSlots])
  const waitingDecks: WaitingDeck[] = waitingSlots
    .filter((s) => decks.has(s.deck_id))
    .map((s) => ({ deckCardsId: s.id, deckId: s.deck_id, deckName: decks.get(s.deck_id)!.name, deckState: decks.get(s.deck_id)!.state }))
    .sort((a, b) => a.deckName.localeCompare(b.deckName))

  const printingLookup = new Map(printingList.map((p) => [p.scryfall_id, p]))
  const copies = shapeCollectionCopies(copyRows, { decks, printings: printingLookup, locationNames })
  const printings = shapePrintings(printingList, { owned: ownedCounts(copyRows), slotScryfallId: null })

  return {
    oracleId,
    cardName,
    facts,
    tags,
    printings,
    copies,
    waitingDecks,
    commanderLegality: printingList.find((p) => p.legality_commander)?.legality_commander ?? null,
    ownedCount: copies.filter((c) => c.state !== 'missing').length,
    collectionValue: collectionValue(copies),
    cheapest: cheapestPrice(printingList),
    imageScryfallId: copies.find((c) => c.printingId)?.printingId ?? printings[0]?.scryfallId ?? null,
  }
}

export async function loadCollectionRulings(supabase: RefClient, oracleId: string): Promise<Ruling[]> {
  return loadRulings(supabase, oracleId)
}

/** Everything in one answer (the original shape). The window itself loads the main part and the rulings separately. */
export async function loadCollectionCardDetails(supabase: RefClient, userId: string, oracleId: string): Promise<CollectionCardDetails> {
  const [main, rulings] = await Promise.all([loadCollectionMain(supabase, userId, oracleId), loadRulings(supabase, oracleId)])
  return { ...main, rulings }
}
