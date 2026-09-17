/**
 * GET /api/onboarding/conflicts
 *
 * Returns the user's full import allocation view: every card with open sleeve
 * claims, each flagged `overAllocated` when sleeved demand exceeds owned copies.
 * Nothing is pre-sleeved during reconciliation, so every deck is an editable
 * claim (Release / Convert to Proxy) — no deck is given the real copy up front.
 */
import { requireAuth } from '@/lib/auth'
import { getImportAllocations } from '@/lib/import-sleeve-claims'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  try {
    const allocations = await getImportAllocations(userId)
    return Response.json({ allocations })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
