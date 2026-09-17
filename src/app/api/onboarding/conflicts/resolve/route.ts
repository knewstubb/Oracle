/**
 * POST /api/onboarding/conflicts/resolve
 *
 * Resolves one over-committed sleeve claim during initial-import reconciliation.
 *
 * Body: { claimId: number, action: 'release' | 'proxy' }
 * - release: drop the claim; the slot stays Planned.
 * - proxy:   create a printing-matched proxy copy, sleeve it into the slot,
 *            and drop the claim.
 *
 * Both actions re-run finalization for the affected printing (via the RPC),
 * so any remaining claims that now fit within supply are assigned real copies.
 * Returns the updated conflict list.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  releaseSleeveClaim,
  proxySleeveClaim,
  getImportConflicts,
} from '@/lib/import-sleeve-claims'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { claimId?: number; action?: 'release' | 'proxy' }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { claimId, action } = body
  if (!claimId || typeof claimId !== 'number') {
    return Response.json({ error: 'claimId (number) is required' }, { status: 400 })
  }
  if (action !== 'release' && action !== 'proxy') {
    return Response.json({ error: "action must be 'release' or 'proxy'" }, { status: 400 })
  }

  try {
    if (action === 'release') {
      await releaseSleeveClaim(userId, claimId)
    } else {
      await proxySleeveClaim(userId, claimId)
    }
    const conflicts = await getImportConflicts(userId)
    return Response.json({ success: true, conflicts })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
