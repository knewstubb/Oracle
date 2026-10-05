import { requireAuth } from '@/lib/auth'
import { fetchOveruse, type OveruseResult } from '@/lib/reconcile-overuse'

/**
 * GET /api/reconcile/overused
 *
 * Cards that more deck slots want than the user owns originals of. Proxies
 * never count, either as supply or as demand. Read-only.
 */
export type ReconcileOverusedResponse = OveruseResult

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const result = await fetchOveruse(authResult.id)
    return Response.json(result satisfies ReconcileOverusedResponse)
  } catch (error) {
    console.error('Failed to load overused cards:', error)
    const detail = error instanceof Error ? error.message : JSON.stringify(error)
    return Response.json({ error: 'Failed to load overused cards', detail }, { status: 500 })
  }
}
