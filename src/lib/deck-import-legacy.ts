import { createAdminClient } from '@/lib/supabase'
import {
  getCommanderCard,
  type ArchidektDeckFull,
} from './archidekt-client'
import {
  diffDeckCards,
  applyDeckCardsDiff,
  type ExistingDeckCardRow,
  type IncomingCard,
} from '@/lib/deck-cards-diff'

// ---------------------------------------------------------------------------
// importDeck
// ---------------------------------------------------------------------------

/** Import a single deck from Archidekt into Oracle's DB (upsert deck + clear/re-insert cards). */
export async function importDeck(deck: ArchidektDeckFull, userId: string): Promise<void> {
  const supabase = createAdminClient()

  const commander = getCommanderCard(deck)
  const commanderOracle = commander?.card?.oracleCard

  // Map color names to WUBRG letters correctly (Blue→U, Black→B)
  const COLOUR_NAME_TO_LETTER: Record<string, string> = {
    white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G',
    w: 'W', u: 'U', b: 'B', r: 'R', g: 'G',
  }
  const colourIdentity = (commanderOracle?.colorIdentity ?? [])
    .map((c) => {
      const lower = c.toLowerCase()
      if (c.length === 1 && 'WUBRG'.includes(c.toUpperCase())) return c.toUpperCase()
      return COLOUR_NAME_TO_LETTER[lower] ?? ''
    })
    .filter((c) => c !== '')
    .join('')

  const now = new Date().toISOString()

  // Upsert deck
  const { error: deckErr } = await supabase
    .from('decks')
    .upsert(
      {
        id: deck.id,
        name: deck.name,
        commander_name: commanderOracle?.name ?? null,
        commander_scryfall_id: commander?.card?.uid ?? null,
        colour_identity: colourIdentity,
        card_count: deck.cards.filter(
          (c) => !c.categories.includes('Maybeboard') && !c.categories.includes('Sideboard')
        ).length,
        last_synced_at: now,
        raw_json: JSON.stringify(deck),
        user_id: userId,
      },
      { onConflict: 'id' }
    )

  if (deckErr) throw new Error(`Failed to upsert deck ${deck.id}: ${deckErr.message}`)

  // ─── Fetch existing deck_cards (paginated — may exceed 1000 rows) ──────
  const PAGE_SIZE = 1000
  const existingRows: ExistingDeckCardRow[] = []
  let offset = 0

  while (true) {
    const { data, error: fetchErr } = await supabase
      .from('deck_cards')
      .select('id, deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id, physical_copy_id, ownership_status, proxy_of_deck_id, dead_weight_flag, dead_weight_reason')
      .eq('deck_id', deck.id)
      .range(offset, offset + PAGE_SIZE - 1)

    if (fetchErr) throw new Error(`Failed to fetch deck_cards for deck ${deck.id}: ${fetchErr.message}`)
    if (!data || data.length === 0) break
    existingRows.push(...(data as unknown as ExistingDeckCardRow[]))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  // ─── Build incoming card list from deck.cards ────────────────────────────
  const incomingCards: IncomingCard[] = deck.cards
    .filter((entry) => entry.card?.oracleCard)
    .map((entry) => {
      const oracle = entry.card.oracleCard
      const isCommander = entry.categories.includes('Commander')

      return {
        card_name: oracle.name,
        scryfall_id: entry.card.uid,
        set_code: entry.card.edition?.editioncode ?? '',
        quantity: entry.quantity,
        categories: JSON.stringify(entry.categories),
        is_commander: isCommander,
      }
    })

  // ─── Compute diff and apply transactionally ──────────────────────────────
  const diff = diffDeckCards(existingRows, incomingCards)
  await applyDeckCardsDiff(deck.id, diff, userId)
}
