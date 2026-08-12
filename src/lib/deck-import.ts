// ---------------------------------------------------------------------------
// Deck Import Executor — Three import modes for URL-based deck import
// ---------------------------------------------------------------------------

import { createAdminClient } from '@/lib/supabase'
import { autoAssignDeck } from '@/lib/auto-assign'
import type { NormalizedDeck, NormalizedCard } from '@/lib/deck-normalizer'
import { resolveCardDefinitions } from '@/lib/card-definition-resolver'
import {
  diffDeckCards,
  applyDeckCardsDiff,
  type ExistingDeckCardRow,
  type IncomingCard,
} from '@/lib/deck-cards-diff'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Import modes:
 * - new_cards: Add cards to collection (user_cards + user_copies) and assign to deck slots
 * - built: Create deck_cards then auto-pull from existing collection (user holds physical deck)
 * - design: Create deck_cards only, no allocation or collection changes
 */
export type ImportMode = 'new_cards' | 'built' | 'design'

export interface ImportResult {
  deckId: number
  allocationSummary: {
    assigned: number
    shortfall: number
    errors: string[]
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BATCH_SIZE = 500

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive a display category from the card's type line.
 * Only used as a last resort when sourceCategories is empty.
 */
function deriveCategory(card: NormalizedCard): string {
  if (card.isCommander) return 'Commander'
  if (card.sourceCategories.length > 0) return card.sourceCategories[0]

  const typeLine = card.typeLine.split(' // ')[0] // Front face only for DFCs
  if (typeLine.includes('Creature')) return 'Creature'
  if (typeLine.includes('Planeswalker')) return 'Planeswalker'
  if (typeLine.includes('Battle')) return 'Battle'
  if (typeLine.includes('Instant')) return 'Instant'
  if (typeLine.includes('Sorcery')) return 'Sorcery'
  if (typeLine.includes('Artifact')) return 'Artifact'
  if (typeLine.includes('Enchantment')) return 'Enchantment'
  if (typeLine.includes('Land')) return 'Land'
  return 'Other'
}

/**
 * Simple string hash function (Java-style hashCode).
 * Produces a stable numeric hash from an alphanumeric string.
 */
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0 // Convert to 32-bit int
  }
  return hash
}

/**
 * Generate a numeric deck ID from a NormalizedDeck.
 * - Archidekt: use the platform deck ID directly (it's already numeric)
 * - Moxfield: hash the alphanumeric ID to get a stable numeric value
 */
function generateDeckId(deck: NormalizedDeck): number {
  if (deck.platform === 'archidekt') {
    return parseInt(deck.platformDeckId, 10)
  }
  // Moxfield: stable hash-based ID
  return Math.abs(hashCode(deck.platformDeckId)) % 2147483647
}

/**
 * Insert rows in batches of BATCH_SIZE.
 */
async function batchInsert(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await (supabase as any).from(table).insert(batch)
    if (error) {
      throw new Error(`Failed to insert batch into ${table} at offset ${i}: ${error.message}`)
    }
  }
}

// ─── Import: Design Mode ─────────────────────────────────────────────────────

/**
 * Execute a deck import in "design" mode.
 *
 * Creates deck_cards only — no collection changes, no allocation.
 * Use when the user is designing and doesn't want to allocate yet.
 *
 * 1. Generate deck ID
 * 2. Upsert deck row
 * 3. Fetch existing deck_cards (paginated)
 * 4. Build incoming card list
 * 5. Compute diff (preserves enriched columns on persisting rows)
 * 6. Apply diff transactionally
 */
export async function importDeckDesign(
  deck: NormalizedDeck,
  userId: string,
  options?: { format?: string; isActive?: boolean }
): Promise<ImportResult> {
  const supabase = createAdminClient()
  const deckId = generateDeckId(deck)
  // Design mode defaults to inactive (user is still working on it)
  const isActive = options?.isActive ?? false
  const deckFormat = options?.format || 'commander'

  // 1. Upsert deck row
  const { error: deckErr } = await (supabase as any)
    .from('decks')
    .upsert(
      {
        id: deckId,
        name: deck.name,
        commander_name: deck.commander?.cardName ?? null,
        commander_scryfall_id: deck.commander?.scryfallId ?? null,
        colour_identity: deck.colourIdentity,
        card_count: deck.cardCount,
        is_active: isActive,
        format: deckFormat,
        source_url: deck.sourceUrl,
        source_platform: deck.platform,
        user_id: userId,
      },
      { onConflict: 'id' }
    )

  if (deckErr) {
    throw new Error(`Failed to upsert deck ${deckId}: ${deckErr.message}`)
  }

  // 2. Fetch existing deck_cards (paginated — may exceed 1000 rows)
  const PAGE_SIZE = 1000
  const existingRows: ExistingDeckCardRow[] = []
  let offset = 0

  while (true) {
    const { data, error: fetchErr } = await (supabase as any)
      .from('deck_cards')
      .select('id, deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id, copy_id, ownership_status, proxy_of_deck_id, dead_weight_flag, dead_weight_reason')
      .eq('deck_id', deckId)
      .range(offset, offset + PAGE_SIZE - 1)

    if (fetchErr) throw new Error(`Failed to fetch deck_cards for deck ${deckId}: ${fetchErr.message}`)
    if (!data || data.length === 0) break
    existingRows.push(...(data as unknown as ExistingDeckCardRow[]))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  // 3. Build incoming card list from deck.cards
  const incomingCards: IncomingCard[] = deck.cards.map((card) => {
    const categories = card.sourceCategories.length > 0
      ? JSON.stringify(card.sourceCategories)
      : JSON.stringify([deriveCategory(card)])

    return {
      card_name: card.cardName,
      scryfall_id: card.scryfallId,
      set_code: card.setCode,
      quantity: card.quantity,
      categories,
      is_commander: card.isCommander,
    }
  })

  // 4. Compute diff and apply transactionally
  const diff = diffDeckCards(existingRows, incomingCards)
  await applyDeckCardsDiff(deckId, diff, userId)

  // No allocation in design mode
  const allocationSummary = {
    assigned: 0,
    shortfall: 0,
    errors: [] as string[],
  }

  return { deckId, allocationSummary }
}

// ─── Import: Built Mode ──────────────────────────────────────────────────────

/**
 * Execute a deck import in "built" mode.
 *
 * Creates deck_cards then auto-assigns from the user's existing collection.
 * Use when the user already has a physical deck built and wants to allocate
 * copies from their collection to the deck slots.
 *
 * 1. Generate deck ID
 * 2. Upsert deck row
 * 3. Fetch existing deck_cards (paginated)
 * 4. Build incoming card list
 * 5. Compute diff and apply
 * 6. Run autoAssignDeck to pull from collection
 */
export async function importDeckBuilt(
  deck: NormalizedDeck,
  userId: string,
  options?: { format?: string; isActive?: boolean }
): Promise<ImportResult> {
  const supabase = createAdminClient()
  const deckId = generateDeckId(deck)
  // Built decks default to active since user has the physical deck ready
  const isActive = options?.isActive ?? true
  const deckFormat = options?.format || 'commander'

  // 1. Upsert deck row
  const { error: deckErr } = await (supabase as any)
    .from('decks')
    .upsert(
      {
        id: deckId,
        name: deck.name,
        commander_name: deck.commander?.cardName ?? null,
        commander_scryfall_id: deck.commander?.scryfallId ?? null,
        colour_identity: deck.colourIdentity,
        card_count: deck.cardCount,
        is_active: isActive,
        format: deckFormat,
        source_url: deck.sourceUrl,
        source_platform: deck.platform,
        user_id: userId,
      },
      { onConflict: 'id' }
    )

  if (deckErr) {
    throw new Error(`Failed to upsert deck ${deckId}: ${deckErr.message}`)
  }

  // 2. Fetch existing deck_cards (paginated — may exceed 1000 rows)
  const PAGE_SIZE = 1000
  const existingRows: ExistingDeckCardRow[] = []
  let offset = 0

  while (true) {
    const { data, error: fetchErr } = await (supabase as any)
      .from('deck_cards')
      .select('id, deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id, copy_id, ownership_status, proxy_of_deck_id, dead_weight_flag, dead_weight_reason')
      .eq('deck_id', deckId)
      .range(offset, offset + PAGE_SIZE - 1)

    if (fetchErr) throw new Error(`Failed to fetch deck_cards for deck ${deckId}: ${fetchErr.message}`)
    if (!data || data.length === 0) break
    existingRows.push(...(data as unknown as ExistingDeckCardRow[]))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  // 3. Build incoming card list from deck.cards
  const incomingCards: IncomingCard[] = deck.cards.map((card) => {
    const categories = card.sourceCategories.length > 0
      ? JSON.stringify(card.sourceCategories)
      : JSON.stringify([deriveCategory(card)])

    return {
      card_name: card.cardName,
      scryfall_id: card.scryfallId,
      set_code: card.setCode,
      quantity: card.quantity,
      categories,
      is_commander: card.isCommander,
    }
  })

  // 4. Compute diff and apply transactionally
  const diff = diffDeckCards(existingRows, incomingCards)
  await applyDeckCardsDiff(deckId, diff, userId)

  // 5. Auto-assign from existing collection
  const autoResult = await autoAssignDeck(deckId, userId)

  const allocationSummary = {
    assigned: autoResult.assigned,
    shortfall: autoResult.skipped,
    errors: autoResult.errors,
  }

  return { deckId, allocationSummary }
}

// ─── Import: New Cards Mode ──────────────────────────────────────────────────

/**
 * Execute a deck import in "new_cards" mode.
 *
 * Adds all cards to the collection (user_cards + user_copies) and assigns
 * the newly created copies to deck slots. Use for precons or when all cards
 * are new to the collection.
 *
 * 1. Generate deck ID
 * 2. Upsert deck row
 * 3. Delete existing deck_cards for this deck_id (re-import safety)
 * 4. For each card:
 *    - Upsert card by oracle_id
 *    - Create collection row (copy)
 *    - Create deck_cards row with copy_id
 */
export async function importDeckNewCards(
  deck: NormalizedDeck,
  userId: string,
  options?: { format?: string; isActive?: boolean }
): Promise<ImportResult> {
  const supabase = createAdminClient()
  const deckId = generateDeckId(deck)
  // New cards mode — cards are new to collection, default to active since user has physical cards
  const isActive = options?.isActive ?? true
  const deckFormat = options?.format || 'commander'

  // 1. Upsert deck row
  const { error: deckErr } = await (supabase as any)
    .from('decks')
    .upsert(
      {
        id: deckId,
        name: deck.name,
        commander_name: deck.commander?.cardName ?? null,
        commander_scryfall_id: deck.commander?.scryfallId ?? null,
        colour_identity: deck.colourIdentity,
        card_count: deck.cardCount,
        is_active: isActive,
        format: deckFormat,
        source_url: deck.sourceUrl,
        source_platform: deck.platform,
        user_id: userId,
      },
      { onConflict: 'id' }
    )

  if (deckErr) {
    throw new Error(`Failed to upsert deck ${deckId}: ${deckErr.message}`)
  }

  // 2. Delete existing deck_cards for re-import
  const { error: deleteErr } = await (supabase as any)
    .from('deck_cards')
    .delete()
    .eq('deck_id', deckId)

  if (deleteErr) {
    throw new Error(`Failed to clear deck_cards for deck ${deckId}: ${deleteErr.message}`)
  }

  // 3. Batch resolve cards for all cards
  const oracleIdToCardId = await resolveCardDefinitions(deck.cards, userId)

  // 4. For each card: create collection row (copy), create deck_card
  const deckCardRows: Record<string, unknown>[] = []

  for (const card of deck.cards) {
    const cardId = oracleIdToCardId.get(card.oracleId)
    if (!cardId) {
      console.warn(
        `[deck-import] Skipping collection row for "${card.cardName}" — no card_id resolved`
      )
      continue
    }

    const categories = card.sourceCategories.length > 0
      ? JSON.stringify(card.sourceCategories)
      : JSON.stringify([deriveCategory(card)])

    // Create collection rows for each quantity
    for (let q = 0; q < card.quantity; q++) {
      const { data: copyData, error: copyErr } = await (supabase as any)
        .from('user_copies')
        .insert({
          card_id: cardId,
          printing_id: card.scryfallId,
          is_proxy: card.isProxy,
          user_id: userId,
        })
        .select('id')
        .single()

      if (copyErr) {
        throw new Error(
          `Failed to create collection row for "${card.cardName}": ${copyErr.message}`
        )
      }

      deckCardRows.push({
        card_name: card.cardName,
        deck_id: deckId,
        scryfall_id: card.scryfallId,
        set_code: card.setCode,
        quantity: 1,
        categories,
        is_commander: card.isCommander,
        user_id: userId,
        ownership_status: 'original',
        copy_id: copyData.id,
      })
    }
  }

  // Batch insert all deck_cards
  await batchInsert(supabase, 'deck_cards', deckCardRows)

  // No separate auto-assign needed — cards were already assigned during creation above

  const allocationSummary = {
    assigned: 0,
    shortfall: 0,
    errors: [] as string[],
  }

  return { deckId, allocationSummary }
}
