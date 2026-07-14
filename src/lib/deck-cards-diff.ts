/**
 * Diff-Based Write Primitive for Deck Cards
 *
 * - diffDeckCards(): Pure function that computes the difference between existing
 *   deck_cards rows and incoming cards from Archidekt. Uses stable identity key
 *   (card_name, scryfall_id) to identify printing slots and determine which rows
 *   to keep, delete, or insert. No I/O, no database calls.
 *
 * - applyDeckCardsDiff(): Executes a DiffResult transactionally via Supabase RPC.
 *   Falls back to sequential client-side operations if the RPC is unavailable.
 */

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExistingDeckCardRow {
  id: number
  deck_id: number
  card_name: string
  scryfall_id: string
  set_code: string
  quantity: number
  categories: string
  is_commander: boolean
  user_id: string
  // Enriched columns — preserved on kept rows
  physical_copy_id: number | null
  ownership_status: string | null
  proxy_of_deck_id: number | null
  dead_weight_flag: string | null
  dead_weight_reason: string | null
}

export interface IncomingCard {
  card_name: string
  scryfall_id: string
  set_code: string
  quantity: number
  categories: string
  is_commander: boolean
}

export interface NewRow {
  card_name: string
  scryfall_id: string
  set_code: string
  categories: string
  is_commander: boolean
  physical_copy_id: null
  ownership_status: null
}

export interface DiffResult {
  toDelete: number[]
  toInsert: NewRow[]
  toKeep: number[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the stable identity key for a printing slot.
 * Two cards are "the same slot" if they share (card_name, scryfall_id).
 */
function identityKey(card_name: string, scryfall_id: string): string {
  return `${card_name}|${scryfall_id}`
}

// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------

/**
 * Compute the diff between existing deck_cards rows and incoming cards.
 *
 * - Groups by stable identity key (card_name, scryfall_id)
 * - Each existing row has quantity=1, so count of rows per key = effective quantity
 * - Incoming cards declare quantity (typically 1 per row in this schema)
 * - toKeep: rows that persist — enriched columns preserved implicitly
 * - toInsert: new rows — null enriched columns + Archidekt categories
 * - toDelete: removed rows — cards no longer in the source
 * - When quantity decreases: prefer deleting rows with physical_copy_id = null
 *   (preserve assigned copies)
 */
export function diffDeckCards(
  existingRows: ExistingDeckCardRow[],
  incoming: IncomingCard[]
): DiffResult {
  const toDelete: number[] = []
  const toInsert: NewRow[] = []
  const toKeep: number[] = []

  // Group existing rows by identity key
  const existingByKey = new Map<string, ExistingDeckCardRow[]>()
  for (const row of existingRows) {
    const key = identityKey(row.card_name, row.scryfall_id)
    const group = existingByKey.get(key)
    if (group) {
      group.push(row)
    } else {
      existingByKey.set(key, [row])
    }
  }

  // Compute desired quantity per identity key from incoming cards
  const incomingByKey = new Map<string, { quantity: number; card: IncomingCard }>()
  for (const card of incoming) {
    const key = identityKey(card.card_name, card.scryfall_id)
    const existing = incomingByKey.get(key)
    if (existing) {
      existing.quantity += card.quantity
    } else {
      incomingByKey.set(key, { quantity: card.quantity, card })
    }
  }

  // Process each identity key that exists in the DB
  for (const [key, rows] of existingByKey) {
    const incomingEntry = incomingByKey.get(key)

    if (!incomingEntry) {
      // Card no longer in Archidekt source — delete all rows for this slot
      for (const row of rows) {
        toDelete.push(row.id)
      }
    } else {
      const desiredCount = incomingEntry.quantity
      const currentCount = rows.length

      if (desiredCount >= currentCount) {
        // Keep all existing rows
        for (const row of rows) {
          toKeep.push(row.id)
        }
        // Insert additional rows if quantity increased
        const toAdd = desiredCount - currentCount
        for (let i = 0; i < toAdd; i++) {
          toInsert.push({
            card_name: incomingEntry.card.card_name,
            scryfall_id: incomingEntry.card.scryfall_id,
            set_code: incomingEntry.card.set_code,
            categories: incomingEntry.card.categories,
            is_commander: incomingEntry.card.is_commander,
            physical_copy_id: null,
            ownership_status: null,
          })
        }
      } else {
        // Quantity decreased — need to delete some rows
        // Prefer deleting rows with physical_copy_id = null (unassigned) first
        const sorted = [...rows].sort((a, b) => {
          // Unassigned (null) first for deletion, assigned last (keep them)
          if (a.physical_copy_id === null && b.physical_copy_id !== null) return -1
          if (a.physical_copy_id !== null && b.physical_copy_id === null) return 1
          return 0
        })

        // Keep the first `desiredCount` rows (assigned copies preferred)
        // Delete the rest
        const rowsToKeep = sorted.slice(sorted.length - desiredCount)
        const rowsToDelete = sorted.slice(0, sorted.length - desiredCount)

        for (const row of rowsToKeep) {
          toKeep.push(row.id)
        }
        for (const row of rowsToDelete) {
          toDelete.push(row.id)
        }
      }

      // Remove from incoming map so we can detect truly new cards
      incomingByKey.delete(key)
    }
  }

  // Process remaining incoming cards that have no existing rows (truly new)
  for (const [, entry] of incomingByKey) {
    for (let i = 0; i < entry.quantity; i++) {
      toInsert.push({
        card_name: entry.card.card_name,
        scryfall_id: entry.card.scryfall_id,
        set_code: entry.card.set_code,
        categories: entry.card.categories,
        is_commander: entry.card.is_commander,
        physical_copy_id: null,
        ownership_status: null,
      })
    }
  }

  return { toDelete, toInsert, toKeep }
}

// ---------------------------------------------------------------------------
// Apply Diff — Transactional Write
// ---------------------------------------------------------------------------

/**
 * Execute a DiffResult against the database transactionally.
 *
 * Calls the `apply_deck_cards_diff` Supabase RPC which wraps delete/insert in
 * a single Postgres transaction. If the RPC is unavailable (migration not yet
 * applied), falls back to sequential client-side delete + insert with a warning.
 */
export async function applyDeckCardsDiff(
  deckId: number,
  diff: DiffResult,
  userId: string
): Promise<void> {
  // Nothing to do if diff is empty
  if (diff.toDelete.length === 0 && diff.toInsert.length === 0) {
    return
  }

  const supabase = createAdminClient()

  // Attempt transactional RPC
  // Note: Type assertion needed until migration is applied and Supabase types are regenerated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('apply_deck_cards_diff', {
    p_deck_id: deckId,
    p_delete_ids: diff.toDelete,
    p_insert_rows: JSON.stringify(diff.toInsert.map(row => ({
      card_name: row.card_name,
      scryfall_id: row.scryfall_id,
      set_code: row.set_code,
      categories: row.categories,
      is_commander: row.is_commander,
      user_id: userId,
    }))),
  })

  if (!error) {
    return
  }

  // Check if the error indicates the RPC function doesn't exist
  // PostgREST returns 404 or a message containing "not found" / "does not exist"
  const isRpcNotFound =
    error.code === '42883' || // PG: undefined_function
    error.message?.includes('not found') ||
    error.message?.includes('does not exist') ||
    error.message?.includes('Could not find the function')

  if (!isRpcNotFound) {
    // Real error from the RPC — rethrow
    throw new Error(
      `[deck-cards-diff] RPC apply_deck_cards_diff failed: ${error.message}`
    )
  }

  // ─── Fallback: non-atomic sequential operations ─────────────────────────
  console.warn('[deck-cards-diff] RPC unavailable, using non-atomic fallback')

  // 1. Delete removed rows
  if (diff.toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('deck_cards')
      .delete()
      .in('id', diff.toDelete)

    if (deleteError) {
      throw new Error(
        `[deck-cards-diff] Fallback delete failed: ${deleteError.message}`
      )
    }
  }

  // 2. Insert new rows
  if (diff.toInsert.length > 0) {
    const insertRows = diff.toInsert.map(row => ({
      deck_id: deckId,
      card_name: row.card_name,
      scryfall_id: row.scryfall_id,
      set_code: row.set_code,
      quantity: 1,
      categories: row.categories,
      is_commander: row.is_commander,
      user_id: userId,
      physical_copy_id: null,
      ownership_status: null,
    }))

    const { error: insertError } = await supabase
      .from('deck_cards')
      .insert(insertRows)

    if (insertError) {
      throw new Error(
        `[deck-cards-diff] Fallback insert failed: ${insertError.message}`
      )
    }
  }
}
