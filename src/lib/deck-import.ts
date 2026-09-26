// ---------------------------------------------------------------------------
// Deck Import Executor — Three import modes for URL-based deck import
// ---------------------------------------------------------------------------

import { createAdminClient } from '@/lib/supabase'
import type { NormalizedDeck, NormalizedCard } from '@/lib/deck-normalizer'
import { MAYBEBOARD_CATEGORY } from '@/lib/deck-normalizer'
import { isBasicLand } from '@/lib/basic-lands'
import { resolveCardDefinitions } from '@/lib/card-definition-resolver'
import {
  diffDeckCards,
  applyDeckCardsDiff,
  type ExistingDeckCardRow,
  type IncomingCard,
} from '@/lib/deck-cards-diff'
import { createVersionSnapshot } from '@/lib/deck-versions'
import { assertAtomicRpcCount, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Import modes:
 * - new_cards: Add cards to collection (user_cards + user_copies) and assign to deck slots
 * - built: Create deck_cards then auto-pull from existing collection (user holds physical deck)
 * - theorycrafted: Create deck_cards only, no allocation or collection changes
 */
export type ImportMode = 'new_cards' | 'built' | 'theorycrafted'

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

interface BuiltImportRow extends IncomingCard {
  is_basic_land: boolean
  is_generic_land: boolean
  is_maybeboard: boolean
}

/**
 * Build reconcile rows for one relation. Maybeboard rows are tagged so
 * `reconcile_built_deck` inserts them as planned slots and never allocates a
 * physical copy to them (D-005/D-018).
 */
function buildBuiltImportRows(
  cards: NormalizedCard[],
  isMaybeboard: boolean
): BuiltImportRow[] {
  const grouped = new Map<string, BuiltImportRow>()

  for (const card of cards) {
    const key = `${card.cardName}|${card.scryfallId ?? ''}`
    const existing = grouped.get(key)
    if (existing) {
      existing.quantity += card.quantity
      continue
    }

    const categories = isMaybeboard
      ? JSON.stringify([MAYBEBOARD_CATEGORY])
      : card.sourceCategories.length > 0
        ? JSON.stringify(card.sourceCategories)
        : JSON.stringify([deriveCategory(card)])

    grouped.set(key, {
      card_name: card.cardName,
      scryfall_id: card.scryfallId,
      set_code: card.setCode,
      quantity: card.quantity,
      categories,
      is_commander: isMaybeboard ? false : card.isCommander,
      is_basic_land: !isMaybeboard && isBasicLand(card.cardName),
      is_generic_land: !isMaybeboard && isBasicLand(card.cardName) && !card.scryfallId,
      is_maybeboard: isMaybeboard,
    })
  }

  return [...grouped.values()]
}

/** Concatenate the main deck and maybeboard relations into one reconcile payload. */
function buildBuiltImportRowsForDeck(deck: NormalizedDeck): BuiltImportRow[] {
  return [
    ...buildBuiltImportRows(deck.cards, false),
    ...buildBuiltImportRows(deck.maybeboard ?? [], true),
  ]
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

function parseBuiltConflicts(value: unknown): AllocationConflict[] {
  if (!Array.isArray(value)) {
    throw new Error('reconcile_built_deck returned invalid conflicts')
  }

  return value.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`reconcile_built_deck returned invalid conflict at index ${index}`)
    }

    const conflict = raw as Record<string, unknown>
    const claimedDecks = conflict.claimedDecks
    if (!Array.isArray(claimedDecks)) {
      throw new Error(`reconcile_built_deck returned invalid claimedDecks at index ${index}`)
    }

    const parsedClaimedDecks = claimedDecks.map((rawDeck, deckIndex) => {
      if (!rawDeck || typeof rawDeck !== 'object' || Array.isArray(rawDeck)) {
        throw new Error(`reconcile_built_deck returned invalid claimed deck at ${index}:${deckIndex}`)
      }
      const deck = rawDeck as Record<string, unknown>
      if (!Number.isInteger(deck.deckId) || typeof deck.deckName !== 'string') {
        throw new Error(`reconcile_built_deck returned invalid claimed deck fields at ${index}:${deckIndex}`)
      }
      return { deckId: deck.deckId as number, deckName: deck.deckName }
    })

    const reason = conflict.reason
    if (reason !== 'unowned' && reason !== 'claimed' && reason !== 'no_free_copy' && reason !== 'printing_mismatch') {
      throw new Error(`reconcile_built_deck returned invalid conflict reason at index ${index}`)
    }

    if (
      typeof conflict.cardName !== 'string' ||
      (conflict.scryfallId !== null && typeof conflict.scryfallId !== 'string') ||
      !Number.isInteger(conflict.requested) ||
      !Number.isInteger(conflict.assigned) ||
      !Number.isInteger(conflict.unresolved)
    ) {
      throw new Error(`reconcile_built_deck returned invalid conflict fields at index ${index}`)
    }

    return {
      cardName: conflict.cardName,
      scryfallId: conflict.scryfallId as string | null,
      requested: conflict.requested as number,
      assigned: conflict.assigned as number,
      unresolved: conflict.unresolved as number,
      reason,
      claimedDecks: parsedClaimedDecks,
    }
  })
}

async function reconcileBuiltDeck(
  deckId: number,
  userId: string,
  rows: BuiltImportRow[]
): Promise<{
  assigned: number
  shortfall: number
  released: number
  conflicts: AllocationConflict[]
}> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('reconcile_built_deck', {
    p_deck_id: deckId,
    p_user_id: userId,
    p_rows: rows,
  })

  if (error) {
    throw new Error(`Failed to reconcile built deck atomically: ${error.message}`)
  }

  const result = assertAtomicRpcSuccess(data, 'reconcile_built_deck')
  const assigned = assertAtomicRpcCount(result, 'assigned_count', 'reconcile_built_deck')
  const shortfall = assertAtomicRpcCount(result, 'shortfall_count', 'reconcile_built_deck')
  const released = assertAtomicRpcCount(result, 'released_count', 'reconcile_built_deck')
  const conflicts = parseBuiltConflicts(result.conflicts)
  const conflictShortfall = conflicts.reduce((total, conflict) => total + conflict.unresolved, 0)

  if (shortfall !== conflictShortfall) {
    throw new Error('reconcile_built_deck returned inconsistent shortfall and conflicts')
  }

  return { assigned, shortfall, released, conflicts }
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
  options?: { format?: string; isActive?: boolean }
): Promise<ImportResult> {
  const supabase = createAdminClient()
  const deckId = generateDeckId(deck)
  // Theorycrafted mode defaults to inactive (user is still working on it)
  const isActive = options?.isActive ?? false
  const deckFormat = options?.format || 'commander'

  // 1. Upsert deck row
  console.log(`[deck-import] Upserting deck ${deckId} "${deck.name}" for user ${userId}`)
  const { data: deckData, error: deckErr } = await (supabase as any)
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

// ─── Import: Built Mode ──────────────────────────────────────────────────────

/**
 * Execute a deck import in "built" mode.
 *
 * Built mode treats the imported list as the owner's statement of physical
 * reality. Matching assignments are preserved, free storage copies are pulled
 * atomically, removed sleeved copies return to default storage, and shortages
 * remain Planned with structured conflicts.
 */
export async function importDeckBuilt(
  deck: NormalizedDeck,
  userId: string,
  options?: { format?: string; isActive?: boolean }
): Promise<ImportResult> {
  const supabase = createAdminClient()
  const deckId = generateDeckId(deck)
  // Built decks default to active since the user has the physical deck ready.
  const isActive = options?.isActive ?? true
  const deckFormat = options?.format || 'commander'

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

  const reconciliation = await reconcileBuiltDeck(
    deckId,
    userId,
    buildBuiltImportRowsForDeck(deck)
  )

  const sourceLabel = deck.platform ? `from ${deck.platform}` : 'from external source'
  await createVersionSnapshot(
    deckId,
    userId,
    'import',
    `Imported ${sourceLabel} (built mode)`,
    deck.name
  )

  const errors = reconciliation.conflicts.map((conflict) => {
    const holderText = conflict.claimedDecks.length > 0
      ? ` Claimed by ${conflict.claimedDecks.map((deck) => deck.deckName).join(', ')}.`
      : ''
    return `${conflict.cardName}: ${conflict.unresolved} unresolved (${conflict.reason}).${holderText}`
  })

  return {
    deckId,
    allocationSummary: {
      assigned: reconciliation.assigned,
      shortfall: reconciliation.shortfall,
      errors,
      conflicts: reconciliation.conflicts,
    },
  }
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

  // 2. Batch resolve cards for all cards
  const oracleIdToCardId = await resolveCardDefinitions(deck.cards, userId)

  // 3. Build one transaction payload. The RPC returns any existing sleeved
  // copies to storage, deletes the old slots, creates the new copies, and
  // links each new copy to its slot without an intermediate orphan state.
  const newCardRows: Record<string, unknown>[] = []

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

    for (let q = 0; q < card.quantity; q++) {
      newCardRows.push({
        card_id: cardId,
        card_name: card.cardName,
        printing_id: card.scryfallId,
        scryfall_id: card.scryfallId,
        set_code: card.setCode,
        categories,
        is_commander: card.isCommander,
        is_proxy: card.isProxy,
        is_maybeboard: false,
      })
    }
  }

  // Maybeboard cards become planned slots only — no collection copies are
  // created for them (D-005/D-018).
  for (const card of deck.maybeboard ?? []) {
    for (let q = 0; q < card.quantity; q++) {
      newCardRows.push({
        card_id: null,
        card_name: card.cardName,
        printing_id: card.scryfallId,
        scryfall_id: card.scryfallId,
        set_code: card.setCode,
        categories: JSON.stringify([MAYBEBOARD_CATEGORY]),
        is_commander: false,
        is_proxy: false,
        is_maybeboard: true,
      })
    }
  }

  const { data: replaceResult, error: replaceErr } = await (supabase.rpc as any)(
    'replace_deck_with_new_cards',
    {
      p_deck_id: deckId,
      p_user_id: userId,
      p_rows: newCardRows,
    }
  )

  if (replaceErr) {
    throw new Error(`Failed to replace deck cards atomically: ${replaceErr.message}`)
  }

  const result = assertAtomicRpcSuccess(replaceResult, 'replace_deck_with_new_cards')
  const insertedCount = assertAtomicRpcCount(
    result,
    'inserted_count',
    'replace_deck_with_new_cards',
    newCardRows.length
  )
  assertAtomicRpcCount(result, 'removed_count', 'replace_deck_with_new_cards')

  const sourceLabel = deck.platform ? `from ${deck.platform}` : 'from external source'
  await createVersionSnapshot(
    deckId,
    userId,
    'import',
    `Imported ${sourceLabel} (new cards mode)`,
    deck.name
  )

  // No separate auto-assign needed — cards were already assigned during the
  // atomic replacement above.

  const allocationSummary = {
    assigned: insertedCount,
    shortfall: 0,
    errors: [] as string[],
    conflicts: [] as AllocationConflict[],
  }

  return { deckId, allocationSummary }
}
