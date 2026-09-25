import { requireAuth } from '@/lib/auth'
import { fetchAllocationRollup } from '@/lib/allocation-rollup'

/**
 * GET /api/collection/rollup-v2
 *
 * Returns the instance-level collection rollup for the Allocation Tab.
 * One row per card name with ownedCount, proxyCount, allocatedCount, shortfall.
 *
 * Data comes from the read-only allocation suggestion engine compute layer
 * (see src/lib/allocation-rollup.ts and
 * docs/oracle/contracts/allocation-suggestion-engine.md), not the frozen
 * `collection_rollup` view.
 */

export interface RollupV2Row {
  oracleId: string
  cardName: string
  ownedCount: number
  proxyCount: number
  allocatedCount: number
  shortfall: number
  typeLine: string
}

export interface RollupV2Response {
  rows: RollupV2Row[]
}

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const rows = await fetchAllocationRollup(authResult.id)
    return Response.json({ rows } as RollupV2Response)
  } catch (error) {
    console.error('Failed to load rollup-v2:', error)
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    return Response.json(
      { error: 'Failed to load collection rollup', detail: message },
      { status: 500 }
    )
  }
}
