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
 * These only adjust claims during reconciliation — they do NOT assign real
 * copies. Every deck stays an equal, editable claim until the user finishes
 * the import (which triggers the single finalize pass). Returns the updated
 * allocation list.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  releaseSleeveClaim,
  proxySleeveClaim,
  getImportAllocations,
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
    const allocations = await getImportAllocations(userId)
    return Response.json({ success: true, allocations })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
