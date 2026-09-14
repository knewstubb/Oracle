import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { assertAtomicRpcCount, assertAtomicRpcId, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'

function mapStorageMovementError(message: string): Response | null {
  if (message.includes('copy_not_found')) {
    return Response.json({ error: 'Collection copy not found' }, { status: 404 })
  }
  if (message.includes('storage_location_not_found')) {
    return Response.json({ error: 'Location not found' }, { status: 404 })
  }
  if (message.includes('copy_already_assigned')) {
    return Response.json(
      { error: 'Copy is assigned to a deck. Release it before moving it to storage.' },
      { status: 409 }
    )
  }
  if (message.includes('copy_missing')) {
    return Response.json({ error: 'Missing copies cannot be moved to storage' }, { status: 409 })
  }
  return null
}

/**
 * POST /api/collection/assign-location
 * Assign a storage location to one or more collection copies.
 *
 * Body: { collectionIds: number[], locationId: number | null }
 * A null or omitted locationId uses the user's default storage location.
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
  const locationId = body.locationId ?? body.storageLocationId ?? null

  if (!collectionIds || !Array.isArray(collectionIds) || collectionIds.length === 0) {
    return Response.json({ error: 'collectionIds must be a non-empty array' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('move_copies_to_storage', {
    p_copy_ids: collectionIds,
    p_location_id: locationId,
    p_user_id: authResult.id,
  })

  if (error) {
    return (
      mapStorageMovementError(error.message) ??
      Response.json({ error: error.message }, { status: 500 })
    )
  }

  const result = assertAtomicRpcSuccess(data, 'move_copies_to_storage')
  const updatedCount = assertAtomicRpcCount(
    result,
    'updated_count',
    'move_copies_to_storage',
    collectionIds.length
  )
  const resultLocationId = assertAtomicRpcId(result, 'location_id', 'move_copies_to_storage')
  return Response.json({
    updated: updatedCount,
    locationId: resultLocationId ?? locationId,
  })
}

/**
 * PATCH /api/collection/assign-location
 * Assign, change, or clear a location for one collection copy.
 *
 * Body: { copyId: number, locationId: number | null }
 * A null or omitted locationId uses the user's default storage location.
 */
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  let body: {
    copyId?: number
    physicalCopyId?: number
    locationId?: number | null
    storageLocationId?: number | null
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const copyId = body.copyId ?? body.physicalCopyId
  const locationId = body.locationId ?? body.storageLocationId ?? null

  if (copyId === undefined || copyId === null || typeof copyId !== 'number') {
    return Response.json({ error: 'copyId is required and must be a number' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('move_copy_to_storage', {
    p_copy_id: copyId,
    p_location_id: locationId,
    p_user_id: authResult.id,
  })

  if (error) {
    return (
      mapStorageMovementError(error.message) ??
      Response.json({ error: error.message }, { status: 500 })
    )
  }

  const result = assertAtomicRpcSuccess(data, 'move_copy_to_storage')
  const resultCopyId = result.copy_id
  if (!Number.isInteger(resultCopyId) || resultCopyId !== copyId) {
    throw new Error('move_copy_to_storage returned an invalid copy_id')
  }
  const resultLocationId = assertAtomicRpcId(result, 'location_id', 'move_copy_to_storage')
  return Response.json({
    updated: 1,
    copyId,
    locationId: resultLocationId ?? locationId,
  })
}
