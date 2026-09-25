import { NextRequest } from 'next/server'
import { fetchPhysicalCopyIdsForOracleId } from '@/lib/collection-instance-ids'
import { requireAuth } from '@/lib/auth'

/**
 * GET /api/collection/instances/[oracleId]/ids
 *
 * Returns lightweight ID list for checkbox resolution.
 * Used by the rollup-level checkbox to resolve real physical_copy_id values
 * for a given oracle_id without fetching full instance data.
 *
 * The resolution lives in `src/lib/collection-instance-ids.ts` so the
 * rollup-level selection has one tested source of real copy IDs.
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

  try {
    const physicalCopyIds = await fetchPhysicalCopyIdsForOracleId(oracleId, userId)
    return Response.json({ oracleId, physicalCopyIds })
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    return Response.json({ error: message }, { status: 500 })
  }
}
