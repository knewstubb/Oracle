import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * GET /api/collection/instances/[oracleId]/ids
 *
 * Returns lightweight ID list for checkbox resolution.
 * Used by the rollup-level checkbox to resolve real physical_copy_id values
 * for a given oracle_id without fetching full instance data.
 *
 * Response: { oracleId: string, physicalCopyIds: number[] }
 *
 * Validates: Requirements 1.1, 1.2
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ oracleId: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { oracleId } = await params

  if (!oracleId) {
    return Response.json({ error: 'oracleId is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Step 1: Resolve user_cards IDs from the oracle_id
  const { data: cards, error: cardErr } = await supabase
    .from('user_cards')
    .select('id')
    .eq('oracle_id', oracleId)
    .eq('user_id', userId)

  if (cardErr) {
    return Response.json({ error: cardErr.message }, { status: 500 })
  }

  if (!cards || cards.length === 0) {
    return Response.json({ oracleId, physicalCopyIds: [] })
  }

  const cardIds = cards.map((card) => card.id)

  // Step 2: Get current-schema user_copies IDs for this user's card identities
  const { data: copies, error: copyErr } = await supabase
    .from('user_copies')
    .select('id')
    .in('card_id', cardIds)
    .eq('user_id', userId)

  if (copyErr) {
    return Response.json({ error: copyErr.message }, { status: 500 })
  }

  const physicalCopyIds = (copies || []).map((copy) => copy.id)

  return Response.json({ oracleId, physicalCopyIds })
}
