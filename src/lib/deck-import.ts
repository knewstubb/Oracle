// ---------------------------------------------------------------------------
// Deck Import Executor — theorycrafted deck import
// ---------------------------------------------------------------------------

import { createAdminClient } from '@/lib/supabase'
import type { NormalizedDeck, NormalizedCard } from '@/lib/deck-normalizer'
import { MAYBEBOARD_CATEGORY } from '@/lib/deck-normalizer'
import {
  diffDeckCards,
  applyDeckCardsDiff,
  type ExistingDeckCardRow,
  type IncomingCard,
} from '@/lib/deck-cards-diff'
import { createVersionSnapshot } from '@/lib/deck-versions'
import { defaultCategoryForTypeLine } from '@/lib/type-line'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Import mode: theorycrafted only (deck_cards only, no allocation or collection changes).
 */
export type ImportMode = 'theorycrafted'

export interface AllocationConflict {
  cardName: string
  scryfallId: string | null
  requested: number
  assigned: number
  unresolved: number
  reason: 'unowned' | 'claimed' | 'no_free_copy' | 'printing_mismatch'
  claimedDecks: Array<{ deckId: number; deckName: string }>
}

export interface ImportResult {
  deckId: number
  allocationSummary: {
    assigned: number
    shortfall: number
    errors: string[]
    conflicts: AllocationConflict[]
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive a display category from the card's type line.
 * Only used as a last resort when sourceCategories is empty.
 */
function deriveCategory(card: NormalizedCard): string {
  if (card.isCommander) return 'Commander'
  if (card.sourceCategories.length > 0) return card.sourceCategories[0]

  return defaultCategoryForTypeLine(card.typeLine) // Front face only for DFCs
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
 * Map a normalized card to a planned deck_cards row for the diff-based
 * (theorycrafted) importer. Maybeboard cards always carry the maybeboard
 * category so the relation is preserved.
 */
function toIncomingCard(card: NormalizedCard, isMaybeboard: boolean): IncomingCard {
  const categories = isMaybeboard
    ? JSON.stringify([MAYBEBOARD_CATEGORY])
    : card.sourceCategories.length > 0
      ? JSON.stringify(card.sourceCategories)
      : JSON.stringify([deriveCategory(card)])

  return {
    card_name: card.cardName,
    scryfall_id: card.scryfallId,
    set_code: card.setCode,
    quantity: card.quantity,
    categories,
    is_commander: isMaybeboard ? false : card.isCommander,
  }
}

// ─── Import: Theorycrafted Mode ─────────────────────────────────────────────────────

/**
 * Execute a deck import in "theorycrafted" mode.
 *
 * Creates deck_cards only — no collection changes, no allocation.
 * Use when the user is theorycrafting and doesn't want to allocate yet.
 *
 * 1. Generate deck ID
 * 2. Upsert deck row
 * 3. Fetch existing deck_cards (paginated)
 * 4. Build incoming card list
 * 5. Compute diff (preserves enriched columns on persisting rows)
 * 6. Apply diff transactionally
 */
export async function importDeckTheorycrafted(
  deck: NormalizedDeck,
  userId: string,
  options?: { format?: string; /** Ignored: deck status is automatic. Kept so import callers need no change. */ isActive?: boolean }
): Promise<ImportResult> {
  const supabase = createAdminClient()
  const deckId = generateDeckId(deck)
  const deckFormat = options?.format || 'commander'

  // 1. Upsert deck row
  console.log(`[deck-import] Upserting deck ${deckId} "${deck.name}" for user ${userId}`)
  const { data: deckData, error: deckErr } = await supabase
    .from('decks')
    .upsert(
      {
        id: deckId,
        name: deck.name,
        commander_name: deck.commander?.cardName ?? null,
        commander_scryfall_id: deck.commander?.scryfallId ?? null,
        colour_identity: deck.colourIdentity,
        card_count: deck.cardCount,
        format: deckFormat,
        source_url: deck.sourceUrl,
        source_platform: deck.platform,
        user_id: userId,
      },
      { onConflict: 'id' }
    )
    .select('id, name')

  console.log(`[deck-import] Upsert result - data:`, deckData, `error:`, deckErr)

  if (deckErr) {
    throw new Error(`Failed to upsert deck ${deckId}: ${deckErr.message}`)
  }

  if (!deckData || deckData.length === 0) {
    console.error(`[deck-import] WARNING: Upsert returned no data for deck ${deckId}`)
  }

  // 2. Fetch existing deck_cards (paginated — may exceed 1000 rows)
  const PAGE_SIZE = 1000
  const existingRows: ExistingDeckCardRow[] = []
  let offset = 0

  while (true) {
    const { data, error: fetchErr } = await supabase
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

  // 3. Build incoming card list from the main deck and the maybeboard relation.
  // Maybeboard cards are inserted as planned slots (copy_id NULL) by the diff.
  const incomingCards: IncomingCard[] = [
    ...deck.cards.map((card) => toIncomingCard(card, false)),
    ...(deck.maybeboard ?? []).map((card) => toIncomingCard(card, true)),
  ]

  // 4. Compute diff and apply transactionally
  const diff = diffDeckCards(existingRows, incomingCards)
  await applyDeckCardsDiff(deckId, diff, userId)

  // 5. Create version snapshot after import
  const sourceLabel = deck.platform ? `from ${deck.platform}` : 'from external source'
  await createVersionSnapshot(
    deckId,
    userId,
    'import',
    `Imported ${sourceLabel}`,
    deck.name
  )

  // No allocation in theorycrafted mode
  const allocationSummary = {
    assigned: 0,
    shortfall: 0,
    errors: [] as string[],
    conflicts: [] as AllocationConflict[],
  }

  return { deckId, allocationSummary }
}
