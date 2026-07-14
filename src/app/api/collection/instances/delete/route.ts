import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * POST /api/collection/instances/delete
 *
 * Deletes a physical copy from the user's collection.
 * First clears any deck_cards FK references (sets physical_copy_id = NULL,
 * ownership_status = NULL), then deletes the physical_copies row.
 *
 * Body: { physicalCopyId: number }
 * Response: { deleted: true, physicalCopyId: number }
 *
 * Validates: Requirements 7.3, 7.4
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { physicalCopyId?: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { physicalCopyId } = body

  // Validate input
  if (!physicalCopyId || typeof physicalCopyId !== 'number') {
    return Response.json({ error: 'physicalCopyId is required and must be a number' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify the physical copy belongs to the authenticated user
  const { data: physicalCopy, error: pcErr } = await (supabase as any)
    .from('physical_copies')
    .select('id')
    .eq('id', physicalCopyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (pcErr) {
    return Response.json({ error: pcErr.message }, { status: 500 })
  }

  if (!physicalCopy) {
    return Response.json(
      { error: 'Physical copy not found or does not belong to user' },
      { status: 404 }
    )
  }

  // FK safety: Clear any deck_cards rows referencing this physical copy
  // This prevents FK constraint violations when we delete the physical_copies row
  const { error: unlinkErr } = await (supabase as any)
    .from('deck_cards')
    .update({ physical_copy_id: null, ownership_status: null })
    .eq('physical_copy_id', physicalCopyId)

  if (unlinkErr) {
    return Response.json({ error: unlinkErr.message }, { status: 500 })
  }

  // Delete the physical_copies row
  const { error: deleteErr } = await (supabase as any)
    .from('physical_copies')
    .delete()
    .eq('id', physicalCopyId)
    .eq('user_id', userId)

  if (deleteErr) {
    return Response.json({ error: deleteErr.message }, { status: 500 })
  }

  return Response.json({ deleted: true, physicalCopyId })
}
