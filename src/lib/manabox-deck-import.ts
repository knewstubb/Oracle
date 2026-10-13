/**
 * ManaBox deck import — one deck per file (D-044, D-046).
 *
 * Every combined row carries an Original / Proxy / Unsleeved split (D-047
 * revised). Original and Proxy create brand-new copies sleeved into the deck;
 * Unsleeved creates a Planned slot with no copy. Basic lands can be converted
 * to generic, untracked slots (D-048). Existing owned copies are never pulled
 * in (D-047 revised).
 *
 * Contract: docs/oracle/contracts/manabox-import.md §7, §8, §10, §12.2, §15.2.
 *
 * NOTE: the write uses the existing `replace_deck_with_new_cards` RPC, which is
 * the only atomic deck+copy write available and which the contract says needs
 * no migration. That RPC records `user_copies.finish = 'nonfoil'` for the
 * copies it creates, so a foil CSV row's finish is not yet preserved on the
 * created copy. See the T-55 report (challenges to locked decisions).
 */

import { createAdminClient } from '@/lib/supabase'
import type { Json } from '@/types/supabase'
import { assertAtomicRpcCount, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'
import { isBasicLand, getBasicLandDefaultScryfallId } from '@/lib/basic-lands'
import { deriveDefaultCategory } from '@/lib/card-definition-resolver'
import { createVersionSnapshot } from '@/lib/deck-versions'
import type { NormalizedCard, NormalizedDeck } from '@/lib/deck-normalizer'
import type {
  ManaBoxDeckImportSummary,
  ManaBoxRowSplit,
  ManaBoxRowSplits,
  ManaBoxUnmatchedLine,
} from '../../docs/oracle/contracts/manabox-import.types'

export interface ManaBoxDeckCard extends NormalizedCard {
  finish?: 'nonfoil' | 'foil' | 'etched'
  /** True when the slot should become a generic basic land (D-048). */
  isGenericBasicLand?: boolean
  /** 1-based source index of the combined row (for rowSplits lookup). */
  sourceIndex?: number
  /** Inline split; takes precedence over `rowSplits`. */
  rowSplit?: ManaBoxRowSplit
}

export interface ManaBoxDeckImportOptions {
  deck: NormalizedDeck
  name: string
  format?: string
  /** Convert basic lands to generic, untracked slots. Default true (D-048). */
  convertBasicLandsToGeneric?: boolean
  /** Per-row split keyed by the combined row's 1-based source index. */
  rowSplits?: ManaBoxRowSplits
  userId: string
  unmatched?: ManaBoxUnmatchedLine[]
}

interface DeckCardInsertRow {
  card_id: number | null
  card_name: string
  printing_id: string | null
  scryfall_id: string | null
  set_code: string
  categories: string
  is_commander: boolean
  is_proxy: boolean
  is_maybeboard: boolean
}

/** One deck per file — a fresh numeric id for each import. */
function generateDeckId(): number {
  return (Date.now() % 2_000_000_000) + Math.floor(Math.random() * 1_000_000)
}

function resolveSplit(
  card: ManaBoxDeckCard,
  rowSplits?: ManaBoxRowSplits
): ManaBoxRowSplit {
  const requested = card.rowSplit ??
    (card.sourceIndex !== undefined ? rowSplits?.[card.sourceIndex] : undefined)

  if (
    requested &&
    Number.isInteger(requested.originalCount) &&
    Number.isInteger(requested.proxyCount) &&
    Number.isInteger(requested.unsleevedCount) &&
    requested.originalCount >= 0 &&
    requested.proxyCount >= 0 &&
    requested.unsleevedCount >= 0 &&
    requested.originalCount + requested.proxyCount + requested.unsleevedCount === card.quantity
  ) {
    return requested
  }

  return { originalCount: card.quantity, proxyCount: 0, unsleevedCount: 0 }
}

/**
 * Execute a ManaBox deck import. Creates exactly one deck and writes every
 * slot through a single atomic RPC.
 */
export async function importManaBoxDeck(
  options: ManaBoxDeckImportOptions
): Promise<ManaBoxDeckImportSummary> {
  const supabase = createAdminClient()
  const deckId = generateDeckId()
  const deckFormat = options.format || 'commander'
  const convertBasics = options.convertBasicLandsToGeneric ?? true

  const cards = options.deck.cards as ManaBoxDeckCard[]

  // 1. Upsert the deck row (commander chosen after import, D-046/D-052).
  const { error: deckErr } = await supabase.from('decks').upsert(
    {
      id: deckId,
      name: options.name || options.deck.name,
      commander_name: null,
      commander_scryfall_id: null,
      commander_id: null,
      colour_identity: options.deck.colourIdentity,
      card_count: options.deck.cardCount,
      is_active: false,
      format: deckFormat,
      source_url: '',
      source_platform: 'manabox',
      user_id: options.userId,
    },
    { onConflict: 'id' }
  )

  if (deckErr) {
    throw new Error(`Failed to create deck ${deckId}: ${deckErr.message}`)
  }

  // 2. Resolve type lines for category derivation (contract §7.3).
  const scryfallIds = [...new Set(cards.map((c) => c.scryfallId).filter(Boolean))]
  const typeLineByPrinting = new Map<string, string>()
  for (let i = 0; i < scryfallIds.length; i += 200) {
    const batch = scryfallIds.slice(i, i + 200)
    const { data } = await supabase
      .from('ref_printings')
      .select('scryfall_id, type_line')
      .in('scryfall_id', batch)
    for (const row of data ?? []) {
      if (row.type_line) typeLineByPrinting.set(row.scryfall_id, row.type_line)
    }
  }

  // 3. Upsert user_cards for every tracked (non-generic-basic) row.
  const trackedCards = cards.filter(
    (card) => !(convertBasics && isBasicLand(card.cardName))
  )
  const uniqueCards = new Map<string, string>()
  for (const card of trackedCards) {
    if (card.oracleId && !uniqueCards.has(card.oracleId)) {
      uniqueCards.set(card.oracleId, card.cardName)
    }
  }

  const cardIdByOracle = new Map<string, number>()
  if (uniqueCards.size > 0) {
    const rows = [...uniqueCards.entries()].map(([oracleId, cardName]) => ({
      oracle_id: oracleId,
      card_name: cardName,
      user_id: options.userId,
    }))
    const { data, error } = await supabase
      .from('user_cards')
      .upsert(rows, { onConflict: 'oracle_id,user_id' })
      .select('id, oracle_id')
    if (error) {
      throw new Error(`Failed to upsert user cards: ${error.message}`)
    }
    for (const row of data ?? []) {
      cardIdByOracle.set(row.oracle_id, row.id)
    }
  }

  // 4. Build the atomic insert payload.
  const insertRows: DeckCardInsertRow[] = []
  let assigned = 0
  let shortfall = 0

  for (const card of cards) {
    const typeLine = typeLineByPrinting.get(card.scryfallId) ?? card.typeLine ?? ''
    const category = deriveDefaultCategory(typeLine)
    const categories = JSON.stringify([category])
    const cardId = cardIdByOracle.get(card.oracleId) ?? null

    const isGenericBasic = convertBasics && isBasicLand(card.cardName)
    const printingId =
      card.scryfallId || getBasicLandDefaultScryfallId(card.cardName) || null

    if (isGenericBasic) {
      // Generic basics create no copies: planned slots only (D-048, §10.2).
      // `is_maybeboard` is the RPC's "planned, no copy" flag.
      for (let i = 0; i < card.quantity; i++) {
        insertRows.push({
          card_id: null,
          card_name: card.cardName,
          printing_id: printingId,
          scryfall_id: printingId,
          set_code: card.setCode,
          categories,
          is_commander: false,
          is_proxy: false,
          is_maybeboard: true,
        })
      }
      continue
    }

    if (!cardId) {
      throw new Error(`Missing card identity for "${card.cardName}"`)
    }

    const split = resolveSplit(card, options.rowSplits)
    const originalCount = split.originalCount
    const proxyCount = split.proxyCount
    const unsleevedCount = split.unsleevedCount

    for (let i = 0; i < originalCount; i++) {
      insertRows.push(ownedRow(card, cardId, categories, false))
      assigned++
    }
    for (let i = 0; i < proxyCount; i++) {
      insertRows.push(ownedRow(card, cardId, categories, true))
      assigned++
    }
    for (let i = 0; i < unsleevedCount; i++) {
      insertRows.push({
        card_id: null,
        card_name: card.cardName,
        printing_id: printingId,
        scryfall_id: printingId,
        set_code: card.setCode,
        categories,
        is_commander: false,
        is_proxy: false,
        is_maybeboard: true,
      })
      shortfall++
    }
  }

  // 5. One atomic write: new copies + linked slots + planned slots.
  const { data, error } = await supabase.rpc('replace_deck_with_new_cards', {
    p_deck_id: deckId,
    p_user_id: options.userId,
    p_rows: insertRows as unknown as Json,
  })

  if (error) {
    throw new Error(`Failed to write deck cards atomically: ${error.message}`)
  }

  const result = assertAtomicRpcSuccess(data, 'replace_deck_with_new_cards')
  assertAtomicRpcCount(
    result,
    'inserted_count',
    'replace_deck_with_new_cards',
    insertRows.length
  )

  // 6. Snapshot the imported version.
  await createVersionSnapshot(
    deckId,
    options.userId,
    'import',
    'Imported from ManaBox',
    options.name || options.deck.name
  )

  return {
    deckId,
    allocationSummary: {
      assigned,
      shortfall,
      errors: [],
      unmatched: options.unmatched ?? [],
    },
  }
}

function ownedRow(
  card: ManaBoxDeckCard,
  cardId: number,
  categories: string,
  isProxy: boolean
): DeckCardInsertRow {
  return {
    card_id: cardId,
    card_name: card.cardName,
    printing_id: card.scryfallId,
    scryfall_id: card.scryfallId,
    set_code: card.setCode,
    categories,
    is_commander: false,
    is_proxy: isProxy,
    is_maybeboard: false,
  }
}
