/**
 * PATCH /api/folders/[id] - Update a folder
 * DELETE /api/folders/[id] - Delete a folder
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const folderId = parseInt(id, 10)

  if (isNaN(folderId)) {
    return Response.json({ error: 'Invalid folder ID' }, { status: 400 })
  }

  let body: { name?: string; color?: string | null; position?: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const updates: Record<string, any> = {}
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return Response.json({ error: 'Folder name cannot be empty' }, { status: 400 })
    }
    updates.name = body.name.trim()
  }
  if (body.color !== undefined) {
    updates.color = body.color
  }
  if (body.position !== undefined) {
    updates.position = body.position
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: folder, error } = await (supabase as any)
    .from('deck_folders')
    .update(updates)
    .eq('id', folderId)
    .eq('user_id', userId)
    .select('id, name, color, position')
    .single()

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'A folder with that name already exists' }, { status: 409 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (!folder) {
    return Response.json({ error: 'Folder not found' }, { status: 404 })
  }

  return Response.json({ folder })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const folderId = parseInt(id, 10)

  if (isNaN(folderId)) {
    return Response.json({ error: 'Invalid folder ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Delete folder (decks will have folder_id set to NULL due to ON DELETE SET NULL)
  const { error } = await (supabase as any)
    .from('deck_folders')
    .delete()
    .eq('id', folderId)
    .eq('user_id', userId)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ success: true })
}
