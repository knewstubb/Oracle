// ---------------------------------------------------------------------------
// Card Definition Resolver — Batch upsert card_definitions by oracle_id
// ---------------------------------------------------------------------------

import { createAdminClient } from '@/lib/supabase'
import type { NormalizedCard } from '@/lib/deck-normalizer'

// ─── Constants ───────────────────────────────────────────────────────────────

export const BATCH_SIZE = 500

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CardDefinitionRow {
  oracle_id: string
  card_name: string
  color_identity: string
  type_line: string
  user_id: string
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Batch upsert card_definitions for all cards in the import.
 *
 * - Deduplicates cards by oracle_id (takes first occurrence)
 * - Skips cards with missing/empty oracle_id (logs a warning)
 * - Upserts in batches of BATCH_SIZE (500)
 * - Returns a Map of oracle_id → card_definition_id
 */
export async function resolveCardDefinitions(
  cards: NormalizedCard[],
  userId: string
): Promise<Map<string, number>> {
  const supabase = createAdminClient()
  const oracleIdToDefId = new Map<string, number>()

  // Deduplicate by oracle_id — keep the first occurrence of each
  const uniqueByOracleId = new Map<string, NormalizedCard>()
  for (const card of cards) {
    if (!card.oracleId || card.oracleId.trim() === '') {
      console.warn(
        `[card-definition-resolver] Skipping card "${card.cardName}" — missing oracle_id`
      )
      continue
    }
    if (!uniqueByOracleId.has(card.oracleId)) {
      uniqueByOracleId.set(card.oracleId, card)
    }
  }

  const uniqueCards = Array.from(uniqueByOracleId.values())

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < uniqueCards.length; i += BATCH_SIZE) {
    const batch = uniqueCards.slice(i, i + BATCH_SIZE)

    const rows: CardDefinitionRow[] = batch.map((card) => ({
      oracle_id: card.oracleId,
      card_name: card.cardName,
      color_identity: card.colorIdentity.join(''),
      type_line: card.typeLine ?? '',
      user_id: userId,
    }))

    const { data, error } = await (supabase as any)
      .from('card_definitions')
      .upsert(rows, { onConflict: 'oracle_id' })
      .select('id, oracle_id')

    if (error) {
      throw new Error(
        `Failed to upsert card_definitions batch at offset ${i}: ${error.message}`
      )
    }

    if (data) {
      for (const row of data) {
        oracleIdToDefId.set(row.oracle_id, row.id)
      }
    }
  }

  return oracleIdToDefId
}
