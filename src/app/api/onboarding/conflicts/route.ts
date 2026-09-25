/**
 * GET /api/onboarding/conflicts?batchId=<uuid>
 *
 * Returns the import allocation view: every card with claims in the batch (or
 * every unsettled claim when no batchId is given), with `state` ('over' /
 * 'unowned' / 'resolved'), `overAllocated` for genuine over-commitments, and
 * per-deck `resolution` intents. Nothing is pre-sleeved during reconciliation —
 * every deck is an editable, reversible claim until "Go to Decks".
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getImportAllocations } from '@/lib/import-sleeve-claims'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const batchId = request.nextUrl.searchParams.get('batchId')

  try {
    const allocations = await getImportAllocations(userId, batchId)
    return Response.json({ allocations })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
