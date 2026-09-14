import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * PUT /api/settings/storage-locations/[id]
 * Update a storage location (name, description, color, sort_order).
 * Only allows updating locations with type='storage'.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const locationId = parseInt(id, 10)
  if (isNaN(locationId)) {
    return Response.json({ error: 'Invalid location ID' }, { status: 400 })
  }

  let body: { name?: string; description?: string; color?: string; sort_order?: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Build update object with only provided fields
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.description !== undefined) updates.description = body.description
  if (body.color !== undefined) updates.color = body.color
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await (supabase as any)
    .from('user_locations')
    .update(updates)
    .eq('id', locationId)
    .eq('user_id', authResult.id)
    .eq('type', 'storage')
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'A location with that name already exists' }, { status: 409 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return Response.json({ error: 'Location not found' }, { status: 404 })
  }

  return Response.json(data)
}

/**
 * DELETE /api/settings/storage-locations/[id]
 * Delete a storage location. Copies assigned to it move to the user's default
 * storage location in the same transaction. The default location cannot be deleted.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const locationId = parseInt(id, 10)
  if (isNaN(locationId)) {
    return Response.json({ error: 'Invalid location ID' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('delete_storage_location', {
    p_location_id: locationId,
    p_user_id: authResult.id,
  })

  if (error) {
    if (error.message.includes('storage_location_not_found')) {
      return Response.json({ error: 'Location not found' }, { status: 404 })
    }
    if (error.message.includes('default_storage_location_cannot_be_deleted')) {
      return Response.json(
        { error: 'The default storage location cannot be deleted' },
        { status: 409 }
      )
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  const result = data as { moved_count?: number; target_location_id?: number }
  return Response.json({
    deleted: true,
    moved: result.moved_count ?? 0,
    targetLocationId: result.target_location_id,
  })
}
