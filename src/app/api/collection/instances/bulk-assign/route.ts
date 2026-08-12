import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * POST /api/collection/instances/bulk-assign
 *
 * Assigns multiple collection copies to a location in bulk.
 * Verifies the location belongs to the authenticated user
 * and only updates collection copies owned by that user.
 *
 * Body: { copyIds: number[], locationId: number }
 * (Also supports deprecated: physicalCopyIds, storageLocationId)
 * Response: { updated: number }
 *
 * Validates: Requirements 8.2
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { copyIds?: number[]; physicalCopyIds?: number[]; locationId?: number; storageLocationId?: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Support both new and deprecated param names
  const copyIds = body.copyIds ?? body.physicalCopyIds
  const locationId = body.locationId ?? body.storageLocationId

  // Validate input
  if (!copyIds || !Array.isArray(copyIds) || copyIds.length === 0) {
    return Response.json({ error: 'copyIds must be a non-empty array' }, { status: 400 })
  }

  if (!locationId || typeof locationId !== 'number') {
    return Response.json({ error: 'locationId is required and must be a number' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify location belongs to the authenticated user
  const { data: location, error: slErr } = await (supabase as any)
    .from('user_locations')
    .select('id')
    .eq('id', locationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (slErr) {
    return Response.json({ error: slErr.message }, { status: 500 })
  }

  if (!location) {
    return Response.json(
      { error: 'Location not found or does not belong to user' },
      { status: 404 }
    )
  }

  // Update collection location_id for all provided IDs owned by this user
  const { data, error: updateErr } = await (supabase as any)
    .from('user_copies')
    .update({ location_id: locationId })
    .in('id', copyIds)
    .eq('user_id', userId)
    .select('id')

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  return Response.json({ updated: data?.length ?? 0 })
}
