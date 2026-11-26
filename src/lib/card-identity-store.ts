/**
 * Card identity data access.
 *
 * Only ensureCardDefinition remains: it finds or creates the user_cards row for an oracle_id
 * (used by the ManaBox import engine).
 */
import { createAdminClient } from '@/lib/supabase'

/**
 * Ensure a card definition exists. Upserts by oracle_id.
 * If the oracle_id already exists, returns the existing row's id.
 * If new, inserts and returns the new id.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */
export async function ensureCardDefinition(oracleId: string, cardName: string, userId: string): Promise<number> {
  const supabase = createAdminClient()

  // Try to find an existing definition for this user first
  const { data: existing } = await supabase
    .from('user_cards')
    .select('id')
    .eq('oracle_id', oracleId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return existing.id

  // Insert new definition
  const { data, error } = await supabase
    .from('user_cards')
    .insert({ oracle_id: oracleId, card_name: cardName, user_id: userId })
    .select('id')
    .single()

  if (error) {
    // Handle race condition: another request inserted between our select and insert
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('user_cards')
        .select('id')
        .eq('oracle_id', oracleId)
        .eq('user_id', userId)
        .single()
      if (retry) return retry.id
    }
    throw new Error(`Failed to ensure card definition for ${oracleId}: ${error.message}`)
  }

  return data.id
}
