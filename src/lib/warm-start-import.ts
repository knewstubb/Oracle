/**
 * Warm-Start Bulk Import — Archidekt Collection + Deck List
 *
 * Phase 1: Backend functions for:
 * 1. Fetching and committing the full collection (card_definitions + physical_copies)
 * 2. Fetching the user's deck list with card counts
 *
 * The collection MUST be fully committed before any deck resolution runs.
 * This module does NOT resolve deck allocations — that's Phase 2.
 */

import { createAdminClient } from '@/lib/supabase'
import {
  fetchCollection,
  fetchUserDecks,
  type ArchidektCollectionEntry,
  type ArchidektDeckSummary,
} from '@/lib/archidekt-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollectionImportResult {
  totalEntries: number
  cardDefinitionsCreated: number
  physicalCopiesCreated: number
  errors: string[]
  durationMs: number
}

export interface DeckListEntry {
  id: number
  name: string
  cardCount: number // from the deck summary (0 if unavailable from list endpoint)
  isPrivate: boolean
}

export interface DeckListResult {
  decks: DeckListEntry[]
  errors: string[]
}

// ---------------------------------------------------------------------------
// Collection Import
// ---------------------------------------------------------------------------

/**
 * Fetch the user's full Archidekt collection and commit it to the database.
 *
 * Steps:
 * 1. Call fetchCollection() (paginated, gets all entries)
 * 2. For each entry, resolve card_definition (oracle_id from the API data)
 * 3. Create physical_copies rows (one per quantity unit)
 * 4. Return summary
 *
 * This function MUST complete before any deck resolution starts.
 *
 * Error handling:
 * - 403 from Archidekt → "Collection is private — set it to Public in Archidekt first"
 * - Other fetch errors → specific message with status code
 * - Individual card resolution failures → logged as errors but don't block the import
 */
export async function importArchidektCollection(
  userId: string
): Promise<CollectionImportResult> {
  const startTime = Date.now()
  const supabase = createAdminClient()
  const errors: string[] = []

  // Step 1: Fetch collection from Archidekt
  let entries: ArchidektCollectionEntry[]
  try {
    entries = await fetchCollection()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('403')) {
      throw new Error(
        'Your Archidekt collection is private. Set it to Public in Archidekt settings first, then try again.'
      )
    }
    if (message.includes('404')) {
      throw new Error(
        'Collection not found. Check that the Archidekt user ID is correct and the collection exists.'
      )
    }
    throw new Error(`Failed to fetch Archidekt collection: ${message}`)
  }

  if (entries.length === 0) {
    return {
      totalEntries: 0,
      cardDefinitionsCreated: 0,
      physicalCopiesCreated: 0,
      errors: ['Collection is empty — no entries found.'],
      durationMs: Date.now() - startTime,
    }
  }

  // Step 2: Group entries by unique card identity (oracleCard name = oracle-level grouping)
  // Archidekt's oracleCard.uid is the Scryfall printing ID for that specific printing.
  // We use it as a proxy oracle_id since Archidekt doesn't expose the Scryfall oracle_id directly.
  const cardNameToEntries = new Map<string, ArchidektCollectionEntry[]>()
  for (const entry of entries) {
    const cardName = entry.card.oracleCard.name
    if (!cardName) continue
    const existing = cardNameToEntries.get(cardName)
    if (existing) existing.push(entry)
    else cardNameToEntries.set(cardName, [entry])
  }

  // Step 3: Ensure card_definitions exist for each unique card
  let cardDefinitionsCreated = 0
  const cardNameToDefId = new Map<string, number>()

  // Fetch existing card_definitions for this user (paginated per Supabase steering)
  const PAGE_SIZE = 1000
  let offset = 0
  while (true) {
    const { data: existingDefs, error: fetchErr } = await supabase
      .from('card_definitions')
      .select('id, card_name, oracle_id')
      .eq('user_id', userId)
      .range(offset, offset + PAGE_SIZE - 1)

    if (fetchErr) {
      errors.push(`Failed to fetch existing card_definitions: ${fetchErr.message}`)
      break
    }
    if (!existingDefs || existingDefs.length === 0) break

    for (const def of existingDefs) {
      cardNameToDefId.set(def.card_name, def.id)
    }

    if (existingDefs.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  // Create missing card_definitions in batches
  const uniqueCardNames = Array.from(cardNameToEntries.keys())
  const missingCards = uniqueCardNames.filter(name => !cardNameToDefId.has(name))

  if (missingCards.length > 0) {
    const BATCH_SIZE = 500
    for (let i = 0; i < missingCards.length; i += BATCH_SIZE) {
      const batch = missingCards.slice(i, i + BATCH_SIZE).map(cardName => {
        const firstEntry = cardNameToEntries.get(cardName)![0]
        // Use oracleCard.uid (Scryfall printing ID) as oracle_id proxy.
        // This is stable per card face across printings in Archidekt's model.
        const oracleId = firstEntry.card.oracleCard.uid || `archidekt-${firstEntry.card.oracleCard.id}`
        return {
          oracle_id: oracleId,
          card_name: cardName,
          user_id: userId,
        }
      })

      const { data: inserted, error: insertErr } = await supabase
        .from('card_definitions')
        .upsert(batch, { onConflict: 'oracle_id' })
        .select('id, card_name')

      if (insertErr) {
        errors.push(`card_definitions batch at offset ${i}: ${insertErr.message}`)
      } else {
        for (const row of inserted ?? []) {
          cardNameToDefId.set(row.card_name, row.id)
          cardDefinitionsCreated++
        }
      }
    }
  }

  // Step 4: Create physical_copies — one row per instance (quantity exploded)
  // Note: source_tag and storage_location_id exist in the DB (migration 007) but
  // the generated Supabase types are stale. We cast to satisfy the type checker.
  let physicalCopiesCreated = 0
  const BATCH_SIZE = 500

  const copyRows: Array<{
    card_definition_id: number
    scryfall_printing_id: string | null
    is_foil: boolean
    is_proxy: boolean
    condition: string
    source_tag: string
    user_id: string
  }> = []

  for (const entry of entries) {
    const cardName = entry.card.oracleCard.name
    if (!cardName) continue
    const defId = cardNameToDefId.get(cardName)
    if (!defId) {
      errors.push(`Skipped "${cardName}": no card_definition_id resolved`)
      continue
    }

    const scryfallPrintingId = entry.card.uid || null
    const isFoil = entry.foil
    const quantity = Math.min(entry.quantity, 100) // Cap at 100 per entry

    for (let q = 0; q < quantity; q++) {
      copyRows.push({
        card_definition_id: defId,
        scryfall_printing_id: scryfallPrintingId,
        is_foil: isFoil,
        is_proxy: false,
        condition: 'near_mint', // Archidekt doesn't track condition
        source_tag: 'archidekt',
        user_id: userId,
      })
    }
  }

  // Batch insert physical_copies
  // Cast needed because generated Supabase types are stale (missing source_tag column from migration 007)
  for (let i = 0; i < copyRows.length; i += BATCH_SIZE) {
    const batch = copyRows.slice(i, i + BATCH_SIZE)
    const { error: copyErr } = await supabase
      .from('physical_copies')
      .insert(batch as any)

    if (copyErr) {
      errors.push(`physical_copies batch at offset ${i}: ${copyErr.message}`)
    } else {
      physicalCopiesCreated += batch.length
    }
  }

  return {
    totalEntries: entries.length,
    cardDefinitionsCreated,
    physicalCopiesCreated,
    errors,
    durationMs: Date.now() - startTime,
  }
}

// ---------------------------------------------------------------------------
// Deck List Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch the user's deck list from Archidekt.
 * Returns deck IDs, names, and card counts for the deck picker UI.
 *
 * Error handling:
 * - 403 → "Decks are private"
 * - Other → specific error message
 */
export async function fetchArchidektDeckList(): Promise<DeckListResult> {
  const errors: string[] = []

  let decks: ArchidektDeckSummary[]
  try {
    decks = await fetchUserDecks()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('403')) {
      throw new Error(
        'Your Archidekt decks are private. Set them to Public in Archidekt settings first, then try again.'
      )
    }
    if (message.includes('404')) {
      throw new Error('User not found on Archidekt. Check that the user ID is correct.')
    }
    throw new Error(`Failed to fetch Archidekt deck list: ${message}`)
  }

  // fetchUserDecks returns ArchidektDeckSummary which doesn't include cardCount.
  // Return what we have — the UI can fetch card counts lazily per deck via fetchDeck.
  const deckEntries: DeckListEntry[] = decks.map(d => ({
    id: d.id,
    name: d.name,
    cardCount: 0, // Not available from fetchUserDecks — needs fetchDeck per deck
    isPrivate: d.private,
  }))

  // Filter out private decks with a warning
  const privateDeckCount = deckEntries.filter(d => d.isPrivate).length
  if (privateDeckCount > 0) {
    errors.push(
      `${privateDeckCount} private deck(s) were found but cannot be imported. Set them to Public in Archidekt first.`
    )
  }

  return {
    decks: deckEntries.filter(d => !d.isPrivate),
    errors,
  }
}
