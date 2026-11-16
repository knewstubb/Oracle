/**
 * GET /api/storage/overview
 *
 * Returns all storage locations with card counts + unsorted count.
 * Used by the Storage landing page grid.
 */
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { countCopiesInLocation, fetchStorageCopies } from '@/lib/storage/copies'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const supabase = createAdminClient()

  // Fetch all storage locations (type='storage' only, not deck locations)
  const { data: locations, error: locErr } = await supabase
    .from('user_locations')
    .select('id, name, color')
    .eq('user_id', userId)
    .eq('type', 'storage')
    .order('sort_order', { ascending: true })

  if (locErr) {
    return Response.json({ error: locErr.message }, { status: 500 })
  }

  let countMap: Map<number, number>
  let unsortedCount: number
  try {
    const list = locations ?? []
    const counts = await Promise.all(
      list.map((loc) => countCopiesInLocation(supabase, userId, loc.id))
    )
    countMap = new Map(list.map((loc, i) => [loc.id, counts[i]]))
    unsortedCount = (await fetchStorageCopies(supabase, userId, null)).length
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }

  const result = {
    locations: (locations ?? []).map((loc) => ({
      id: loc.id,
      name: loc.name,
      color: loc.color,
      cardCount: countMap.get(loc.id) ?? 0,
    })),
    unsortedCount,
  }

  return Response.json(result)
}
