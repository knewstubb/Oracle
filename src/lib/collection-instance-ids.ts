import { createAdminClient } from '@/lib/supabase'

/**
 * Resolve the real physical copy identifiers that make up a rollup row.
 *
 * A rollup row is keyed by `oracle_id` (canonical card identity). The
 * rollup-level selection in the Allocation UI needs the actual
 * `user_copies.id` values behind that row — never placeholder or
 * sequential stand-ins — because every bulk action
 * (assign-to-storage, mark-as-missing, delete) writes against a
 * `physical_copy_id`.
 *
 * Resolution is two discrete, user-scoped queries:
 *   1. `user_cards` rows for the oracle_id → card ids
 *   2. `user_copies` rows for those card ids → physical copy ids
 *
 * `scryfall_id` is deliberately not involved: it identifies a printing,
 * not a copy, and finish is a separate attribute.
 *
 * Returns `[]` when the user owns no cards for the oracle_id.
 */
export async function fetchPhysicalCopyIdsForOracleId(
  oracleId: string,
  userId: string
): Promise<number[]> {
  const supabase = createAdminClient()

  const { data: cards, error: cardErr } = await supabase
    .from('user_cards')
    .select('id')
    .eq('oracle_id', oracleId)
    .eq('user_id', userId)

  if (cardErr) {
    throw new Error(`Failed to resolve cards for oracle "${oracleId}": ${cardErr.message}`)
  }

  if (!cards || cards.length === 0) return []

  const cardIds = cards.map((card) => card.id)

  const { data: copies, error: copyErr } = await supabase
    .from('user_copies')
    .select('id')
    .in('card_id', cardIds)
    .eq('user_id', userId)

  if (copyErr) {
    throw new Error(`Failed to resolve physical copies for oracle "${oracleId}": ${copyErr.message}`)
  }

  return (copies ?? []).map((copy) => copy.id)
}
