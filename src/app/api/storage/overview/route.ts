/**
 * GET /api/storage/overview
 *
 * Returns all storage locations with card counts + unsorted count.
 * Used by the Storage landing page grid.
 */
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const supabase = createAdminClient()

  // Fetch all storage locations (type='storage' only, not deck locations)
  const { data: locations, error: locErr } = await (supabase as any)
    .from('user_locations')
    .select('id, name, color')
    .eq('user_id', userId)
    .eq('type', 'storage')
    .order('sort_order', { ascending: true })

  if (locErr) {
    return Response.json({ error: locErr.message }, { status: 500 })
  }

  // Count copies per storage location
  const { data: counts, error: countErr } = await (supabase as any)
    .from('user_copies')
    .select('location_id')
    .eq('user_id', userId)
    .eq('missing', false)
    .not('location_id', 'is', null)

  if (countErr) {
    return Response.json({ error: countErr.message }, { status: 500 })
  }

  // Build count map (only count storage locations, not deck locations)
  const storageLocationIds = new Set((locations ?? []).map((loc: any) => loc.id))
  const countMap = new Map<number, number>()
  for (const row of counts ?? []) {
    if (row.location_id && storageLocationIds.has(row.location_id)) {
      countMap.set(row.location_id, (countMap.get(row.location_id) || 0) + 1)
    }
  }

  // Count unsorted: null location_id AND not assigned to any deck
  const { data: allCopies, error: allErr } = await (supabase as any)
    .from('user_copies')
    .select('id, location_id, deck_cards!deck_cards_copy_id_fkey(id)')
    .eq('user_id', userId)
    .eq('missing', false)
    .is('location_id', null)

  if (allErr) {
    return Response.json({ error: allErr.message }, { status: 500 })
  }

  // Unsorted = null location AND no deck assignment
  const unsortedCount = (allCopies ?? []).filter(
    (copy: any) => !copy.deck_cards || copy.deck_cards.length === 0
  ).length

  const result = {
    locations: (locations ?? []).map((loc: any) => ({
      id: loc.id,
      name: loc.name,
      color: loc.color,
      cardCount: countMap.get(loc.id) ?? 0,
    })),
    unsortedCount,
  }

  return Response.json(result)
}
