import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * POST /api/collection/assign-location
 * Assign a storage location to one or more collection entries.
 *
 * Body: { collectionIds: number[], locationId: number | null }
 * Setting locationId to null removes the location assignment (card goes to sorting pile).
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  let body: { collectionIds?: number[]; locationId?: number | null; storageLocationId?: number | null }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { collectionIds } = body
  // Support both old and new param names for backwards compatibility
  const locationId = body.locationId ?? body.storageLocationId

  if (!collectionIds || !Array.isArray(collectionIds) || collectionIds.length === 0) {
    return Response.json({ error: 'collectionIds must be a non-empty array' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // If assigning (not clearing), verify the location exists and belongs to user
  if (locationId !== null && locationId !== undefined) {
    const { data: loc } = await (supabase as any)
      .from('user_locations')
      .select('id')
      .eq('id', locationId)
      .eq('user_id', authResult.id)
      .maybeSingle()

    if (!loc) {
      return Response.json({ error: 'Location not found' }, { status: 404 })
    }
  }

  const { error, count } = await (supabase as any)
    .from('user_copies')
    .update({ location_id: locationId ?? null })
    .in('id', collectionIds)
    .eq('user_id', authResult.id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ updated: count ?? collectionIds.length })
}

/**
 * PATCH /api/collection/assign-location
 * Assign, change, or clear a location for a collection copy (instance-level).
 *
 * Body: { copyId: number, locationId: number | null }
 * Setting locationId to null clears the location assignment (card goes to sorting pile).
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.5
 */
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  let body: { copyId?: number; physicalCopyId?: number; locationId?: number | null; storageLocationId?: number | null }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Support both old and new param names for backwards compatibility
  const copyId = body.copyId ?? body.physicalCopyId
  const locationId = body.locationId ?? body.storageLocationId

  if (copyId === undefined || copyId === null || typeof copyId !== 'number') {
    return Response.json({ error: 'copyId is required and must be a number' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify the collection copy exists and belongs to the authenticated user
  const { data: copy } = await (supabase as any)
    .from('user_copies')
    .select('id, user_id')
    .eq('id', copyId)
    .eq('user_id', authResult.id)
    .maybeSingle()

  if (!copy) {
    return Response.json({ error: 'Collection copy not found' }, { status: 404 })
  }

  // If assigning (not clearing), verify the location exists and belongs to user
  if (locationId !== null && locationId !== undefined) {
    const { data: loc } = await (supabase as any)
      .from('user_locations')
      .select('id')
      .eq('id', locationId)
      .eq('user_id', authResult.id)
      .maybeSingle()

    if (!loc) {
      return Response.json({ error: 'Location not found' }, { status: 404 })
    }
  }

  // Update the location_id on the collection copy
  // Note: location_id is preserved even when a copy is allocated to a deck (Req 14.5)
  const { error } = await (supabase as any)
    .from('user_copies')
    .update({ location_id: locationId ?? null })
    .eq('id', copyId)
    .eq('user_id', authResult.id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ updated: 1, copyId, locationId: locationId ?? null })
}
