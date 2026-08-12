import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * POST /api/collection/instances/delete
 *
 * Deletes a copy from the user's collection.
 * First clears any deck_cards FK references (sets copy_id = NULL,
 * ownership_status = NULL), then deletes the collection row.
 *
 * Body: { copyId: number } (also accepts deprecated physicalCopyId)
 * Response: { deleted: true, copyId: number }
 *
 * Validates: Requirements 7.3, 7.4
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { copyId?: number; physicalCopyId?: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Support both copyId and deprecated physicalCopyId
  const copyId = body.copyId ?? body.physicalCopyId

  // Validate input
  if (!copyId || typeof copyId !== 'number') {
    return Response.json({ error: 'copyId is required and must be a number' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify the collection copy belongs to the authenticated user
  const { data: copy, error: copyErr } = await supabase
    .from('user_copies')
    .select('id')
    .eq('id', copyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (copyErr) {
    return Response.json({ error: copyErr.message }, { status: 500 })
  }

  if (!copy) {
    return Response.json(
      { error: 'Collection copy not found or does not belong to user' },
      { status: 404 }
    )
  }

  // FK safety: Clear any deck_cards rows referencing this copy
  // This prevents FK constraint violations when we delete the collection row
  const { error: unlinkErr } = await supabase
    .from('deck_cards')
    .update({ copy_id: null, ownership_status: null })
    .eq('copy_id', copyId)

  if (unlinkErr) {
    return Response.json({ error: unlinkErr.message }, { status: 500 })
  }

  // Delete the collection row
  const { error: deleteErr } = await supabase
    .from('user_copies')
    .delete()
    .eq('id', copyId)
    .eq('user_id', userId)

  if (deleteErr) {
    return Response.json({ error: deleteErr.message }, { status: 500 })
  }

  return Response.json({ deleted: true, copyId })
}
