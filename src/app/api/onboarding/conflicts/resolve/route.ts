/**
 * POST /api/onboarding/conflicts/resolve
 *
 * Records one deck's intent for a claimed card during import reconciliation.
 * Pure intent write: nothing physical is touched and nothing is finalized, so
 * Sleeve ↔ Release ↔ Proxy stay freely reversible until "Go to Decks".
 *
 * Body: { claimId: number, resolution: 'sleeve' | 'release' | 'proxy' }
 * - sleeve:  the deck asserts a real sleeved copy (re-introduces demand).
 * - release: the slot stays Planned; the deck stops competing for a copy.
 * - proxy:   on finish, a printing-matched proxy copy is created and sleeved.
 *
 * Returns the updated allocation list for the batch this claim belongs to.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  setClaimResolution,
  getImportAllocations,
  type ClaimResolution,
} from '@/lib/import-sleeve-claims'

const VALID_RESOLUTIONS: readonly ClaimResolution[] = ['sleeve', 'release', 'proxy']

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { claimId?: number; resolution?: string; action?: string; batchId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { claimId } = body
  // 'action' is the legacy field name from the destructive Release/Proxy flow.
  const rawResolution = body.resolution ?? body.action
  if (!claimId || typeof claimId !== 'number') {
    return Response.json({ error: 'claimId (number) is required' }, { status: 400 })
  }
  if (!VALID_RESOLUTIONS.includes(rawResolution as ClaimResolution)) {
    return Response.json(
      { error: "resolution must be 'sleeve', 'release' or 'proxy'" },
      { status: 400 }
    )
  }
  const resolution = rawResolution as ClaimResolution
  const batchId =
    typeof body.batchId === 'string' && body.batchId.trim() !== '' ? body.batchId : null

  try {
    await setClaimResolution(userId, claimId, resolution)
    const allocations = await getImportAllocations(userId, batchId)
    return Response.json({ success: true, allocations })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
