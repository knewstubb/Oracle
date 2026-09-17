/**
 * GET /api/onboarding/conflicts
 *
 * Returns the current user's open initial-import sleeve conflicts:
 * printings where sleeved demand (open claims + finalized real sleeves)
 * exceeds owned non-proxy copies. Each conflict lists the decks involved
 * with the claim id needed to resolve (Release / Convert to Proxy).
 */
import { requireAuth } from '@/lib/auth'
import { getImportConflicts } from '@/lib/import-sleeve-claims'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  try {
    const conflicts = await getImportConflicts(userId)
    return Response.json({ conflicts })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
