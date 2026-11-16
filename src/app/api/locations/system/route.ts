/**
 * GET /api/locations/system — the In your hand and Missing lists (with counts) plus Unsorted.
 * Contract: docs/oracle/contracts/know-where-cards-are.md. Read only; scoped to the signed-in user.
 */
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { loadSystemLocations } from '@/lib/system-locations'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    return Response.json(await loadSystemLocations(createAdminClient(), authResult.id))
  } catch (err) {
    console.error('[locations/system]', err)
    return Response.json({ error: 'load_failed', message: "Couldn't load these lists. Try again." }, { status: 500 })
  }
}
