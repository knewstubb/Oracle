/** GET /api/storage/unsorted — copies with no location and no deck assignment. */
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { fetchStorageCopies } from '@/lib/storage/copies'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const copies = await fetchStorageCopies(createAdminClient(), authResult.id, null)
    return Response.json({ locationName: 'Unsorted', locationColor: null, copies })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
