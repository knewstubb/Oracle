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

  // Step 1: Resolve card_definition IDs from oracle_id
  const { data: cardDefs, error: cdErr } = await (supabase as any)
    .from('card_definitions')
    .select('id')
    .eq('oracle_id', oracleId)

  if (cdErr) {
    return Response.json({ error: cdErr.message }, { status: 500 })
  }

  if (!cardDefs || cardDefs.length === 0) {
    return Response.json({ oracleId, physicalCopyIds: [] })
  }

  const cardDefIds = cardDefs.map((cd: { id: number }) => cd.id)

  // Step 2: Get physical_copies IDs for those card_definition_ids belonging to the user
  const { data: copies, error: pcErr } = await (supabase as any)
    .from('physical_copies')
    .select('id')
    .in('card_definition_id', cardDefIds)
    .eq('user_id', userId)

  if (pcErr) {
    return Response.json({ error: pcErr.message }, { status: 500 })
  }

  const physicalCopyIds = (copies || []).map((pc: { id: number }) => pc.id)

  return Response.json({ oracleId, physicalCopyIds })
}
