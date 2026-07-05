import { createAdminClient } from '@/lib/supabase'
import {
  fetchUserDecks,
  fetchDeck,
  fetchCollection,
  getCommanderCard,
  type ArchidektDeckFull,
} from './archidekt-client'

// ---------------------------------------------------------------------------
// syncCollection
// ---------------------------------------------------------------------------

export async function syncCollection(userId: string): Promise<number> {
  const supabase = createAdminClient()

  const entries = await fetchCollection()

  // Clear existing collection and re-insert
  const { error: deleteErr } = await supabase
    .from('collection')
    .delete()
    .neq('id', 0) // Supabase requires a filter for delete

  if (deleteErr) throw new Error(`Failed to clear collection: ${deleteErr.message}`)

  // Insert in batches
  const BATCH_SIZE = 500
  const rows = entries
    .filter((entry) => entry.card?.oracleCard)
    .map((entry) => ({
      card_name: entry.card.oracleCard.name,
      scryfall_id: entry.card.uid,
      set_code: entry.card.edition?.editioncode ?? '',
      quantity: entry.quantity,
      foil: entry.foil,
      user_id: userId,
    }))

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error: insertErr } = await supabase
      .from('collection')
      .insert(batch)

    if (insertErr) throw new Error(`Failed to insert collection batch at offset ${i}: ${insertErr.message}`)
  }

  return entries.length
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  imported: number
  errors: string[]
  collectionCount?: number
}

// ---------------------------------------------------------------------------
// syncNewDecksOnly
// ---------------------------------------------------------------------------

/**
 * Only imports decks that don't already exist in Oracle's `decks` table.
 * Previously-imported decks are never re-fetched or overwritten.
 * Collection sync continues unchanged.
 */
export async function syncNewDecksOnly(userId: string): Promise<SyncResult> {
  const supabase = createAdminClient()

  const archidektDecks = await fetchUserDecks()

  const { data: existingRows, error: existingErr } = await supabase
    .from('decks')
    .select('id')

  if (existingErr) throw new Error(`Failed to fetch existing deck ids: ${existingErr.message}`)

  const existingIds = new Set((existingRows || []).map((r) => r.id))
  const newDecks = archidektDecks.filter((d) => !existingIds.has(d.id))
  const results: SyncResult = { imported: 0, errors: [] }

  for (const summary of newDecks) {
    try {
      const deck = await fetchDeck(summary.id)
      await importDeck(deck, userId)
      results.imported++
    } catch (err) {
      results.errors.push(`${summary.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Collection sync continues as before
  try {
    results.collectionCount = await syncCollection(userId)
  } catch (err) {
    results.errors.push(`Collection: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Build sets lookup from all synced data
  try {
    await syncSetsFromDecks()
  } catch {
    // Non-critical — set names are cosmetic
  }

  return results
}

// ---------------------------------------------------------------------------
// syncSetsFromDecks
// ---------------------------------------------------------------------------

/** Extract set code → name mappings from deck raw_json and upsert into sets table */
async function syncSetsFromDecks(): Promise<void> {
  const supabase = createAdminClient()

  const { data: rows, error } = await supabase
    .from('decks')
    .select('raw_json')
    .not('raw_json', 'is', null)

  if (error) throw new Error(`Failed to fetch deck raw_json for sets sync: ${error.message}`)

  const seen = new Set<string>()
  const setsToUpsert: Array<{ code: string; name: string }> = []

  for (const row of rows || []) {
    try {
      const deck = JSON.parse(row.raw_json) as ArchidektDeckFull
      for (const entry of deck.cards) {
        const edition = entry.card?.edition
        if (edition?.editioncode && edition?.editionname && !seen.has(edition.editioncode)) {
          seen.add(edition.editioncode)
          setsToUpsert.push({ code: edition.editioncode, name: edition.editionname })
        }
      }
    } catch {
      // Skip malformed JSON
    }
  }

  if (setsToUpsert.length > 0) {
    // Upsert in batches
    const BATCH_SIZE = 500
    for (let i = 0; i < setsToUpsert.length; i += BATCH_SIZE) {
      const batch = setsToUpsert.slice(i, i + BATCH_SIZE)
      const { error: upsertErr } = await supabase
        .from('sets')
        .upsert(batch, { onConflict: 'code' })

      if (upsertErr) {
        console.warn(`[sync] Failed to upsert sets batch at offset ${i}:`, upsertErr.message)
      }
    }
  }
}

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

  // Clear existing cards for this deck
  const { error: deleteErr } = await supabase
    .from('deck_cards')
    .delete()
    .eq('deck_id', deck.id)

  if (deleteErr) throw new Error(`Failed to clear deck_cards for deck ${deck.id}: ${deleteErr.message}`)

  // Insert cards in batches
  const cardRows = deck.cards
    .filter((entry) => entry.card?.oracleCard)
    .map((entry) => {
      const oracle = entry.card.oracleCard
      const isCommander = entry.categories.includes('Commander')
      const label = entry.label || ''
      const tags = label && !label.startsWith(',')
        ? JSON.stringify([{ name: label.split(',')[0], color: label.split(',').slice(1).join(',') }])
        : '[]'

      return {
        deck_id: deck.id,
        card_name: oracle.name,
        scryfall_id: entry.card.uid,
        set_code: entry.card.edition?.editioncode ?? '',
        quantity: entry.quantity,
        categories: JSON.stringify(entry.categories),
        tags,
        is_commander: isCommander,
        user_id: userId,
      }
    })

  const BATCH_SIZE = 500
  for (let i = 0; i < cardRows.length; i += BATCH_SIZE) {
    const batch = cardRows.slice(i, i + BATCH_SIZE)
    const { error: insertErr } = await supabase
      .from('deck_cards')
      .insert(batch)

    if (insertErr) throw new Error(`Failed to insert deck_cards batch at offset ${i}: ${insertErr.message}`)
  }
}
