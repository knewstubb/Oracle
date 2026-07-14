import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * POST /api/collection/assign-location
 * Assign a storage location to one or more collection entries (legacy table).
 *
 * Body: { collectionIds: number[], storageLocationId: number | null }
 * Setting storageLocationId to null removes the location assignment.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  let body: { collectionIds?: number[]; storageLocationId?: number | null }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { collectionIds, storageLocationId } = body

  if (!collectionIds || !Array.isArray(collectionIds) || collectionIds.length === 0) {
    return Response.json({ error: 'collectionIds must be a non-empty array' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // If assigning (not clearing), verify the location exists and belongs to user
  if (storageLocationId !== null && storageLocationId !== undefined) {
    const { data: loc } = await (supabase as any)
      .from('storage_locations')
      .select('id')
      .eq('id', storageLocationId)
      .eq('user_id', authResult.id)
      .maybeSingle()

    if (!loc) {
      return Response.json({ error: 'Storage location not found' }, { status: 404 })
    }
  }

  const { error, count } = await (supabase as any)
    .from('collection')
    .update({ storage_location_id: storageLocationId ?? null })
    .in('id', collectionIds)
    .eq('user_id', authResult.id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ updated: count ?? collectionIds.length })
}

/**
 * PATCH /api/collection/assign-location
 * Assign, change, or clear a storage location for a physical copy (instance-level).
 *
 * Body: { physicalCopyId: number, storageLocationId: number | null }
 * Setting storageLocationId to null clears the location assignment.
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.5
 */
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  let body: { physicalCopyId?: number; storageLocationId?: number | null }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { physicalCopyId, storageLocationId } = body

  if (physicalCopyId === undefined || physicalCopyId === null || typeof physicalCopyId !== 'number') {
    return Response.json({ error: 'physicalCopyId is required and must be a number' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify the physical copy exists and belongs to the authenticated user
  const { data: copy } = await (supabase as any)
    .from('physical_copies')
    .select('id, user_id')
    .eq('id', physicalCopyId)
    .eq('user_id', authResult.id)
    .maybeSingle()

  if (!copy) {
    return Response.json({ error: 'Physical copy not found' }, { status: 404 })
  }

  // If assigning (not clearing), verify the storage location exists and belongs to user
  if (storageLocationId !== null && storageLocationId !== undefined) {
    const { data: loc } = await (supabase as any)
      .from('storage_locations')
      .select('id')
      .eq('id', storageLocationId)
      .eq('user_id', authResult.id)
      .maybeSingle()

    if (!loc) {
      return Response.json({ error: 'Storage location not found' }, { status: 404 })
    }
  }

  // Update the storage_location_id on the physical copy
  // Note: storage_location_id is preserved even when a copy is allocated to a deck (Req 14.5)
  const { error } = await (supabase as any)
    .from('physical_copies')
    .update({ storage_location_id: storageLocationId ?? null })
    .eq('id', physicalCopyId)
    .eq('user_id', authResult.id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ updated: 1, physicalCopyId, storageLocationId: storageLocationId ?? null })
}
