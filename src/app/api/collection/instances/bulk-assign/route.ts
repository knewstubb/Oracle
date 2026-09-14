import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { assertAtomicRpcCount, assertAtomicRpcId, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'

/**
 * POST /api/collection/instances/bulk-assign
 *
 * Assigns multiple collection copies to one storage location atomically.
 * Body: { copyIds: number[], locationId: number }
 * (Also supports deprecated: physicalCopyIds, storageLocationId)
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

  const copyIds = body.copyIds ?? body.physicalCopyIds
  const locationId = body.locationId ?? body.storageLocationId

  if (!copyIds || !Array.isArray(copyIds) || copyIds.length === 0) {
    return Response.json({ error: 'copyIds must be a non-empty array' }, { status: 400 })
  }

  if (typeof locationId !== 'number' || !Number.isInteger(locationId)) {
    return Response.json({ error: 'locationId is required and must be a number' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('move_copies_to_storage', {
    p_copy_ids: copyIds,
    p_location_id: locationId,
    p_user_id: userId,
  })

  if (error) {
    if (error.message.includes('copy_not_found')) {
      return Response.json({ error: 'One or more collection copies were not found' }, { status: 404 })
    }
    if (error.message.includes('storage_location_not_found')) {
      return Response.json({ error: 'Location not found or does not belong to user' }, { status: 404 })
    }
    if (error.message.includes('copy_already_assigned')) {
      return Response.json(
        { error: 'One or more copies are assigned to a deck. Release them before moving them to storage.' },
        { status: 409 }
      )
    }
    if (error.message.includes('copy_missing')) {
      return Response.json({ error: 'Missing copies cannot be moved to storage' }, { status: 409 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  const result = assertAtomicRpcSuccess(data, 'move_copies_to_storage')
  const updated = assertAtomicRpcCount(
    result,
    'updated_count',
    'move_copies_to_storage',
    copyIds.length
  )
  return Response.json({
    updated,
    locationId: assertAtomicRpcId(result, 'location_id', 'move_copies_to_storage'),
  })
}
