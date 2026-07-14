import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * POST /api/collection/instances/bulk-assign
 *
 * Assigns multiple physical copies to a storage location in bulk.
 * Verifies the storage location belongs to the authenticated user
 * and only updates physical copies owned by that user.
 *
 * Body: { physicalCopyIds: number[], storageLocationId: number }
 * Response: { updated: number }
 *
 * Validates: Requirements 8.2
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { physicalCopyIds?: number[]; storageLocationId?: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { physicalCopyIds, storageLocationId } = body

  // Validate input
  if (!physicalCopyIds || !Array.isArray(physicalCopyIds) || physicalCopyIds.length === 0) {
    return Response.json({ error: 'physicalCopyIds must be a non-empty array' }, { status: 400 })
  }

  if (!storageLocationId || typeof storageLocationId !== 'number') {
    return Response.json({ error: 'storageLocationId is required and must be a number' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify storage location belongs to the authenticated user
  const { data: storageLocation, error: slErr } = await (supabase as any)
    .from('storage_locations')
    .select('id')
    .eq('id', storageLocationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (slErr) {
    return Response.json({ error: slErr.message }, { status: 500 })
  }

  if (!storageLocation) {
    return Response.json(
      { error: 'Storage location not found or does not belong to user' },
      { status: 404 }
    )
  }

  // Update physical_copies storage_location_id for all provided IDs owned by this user
  const { data, error: updateErr } = await (supabase as any)
    .from('physical_copies')
    .update({ storage_location_id: storageLocationId })
    .in('id', physicalCopyIds)
    .eq('user_id', userId)
    .select('id')

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  return Response.json({ updated: data?.length ?? 0 })
}
