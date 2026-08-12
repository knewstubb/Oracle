import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * POST /api/collection/instances/unassign
 *
 * Unassigns a copy from any deck it is assigned to.
 * Clears the deck_cards.copy_id reference and sets
 * ownership_status to NULL for all deck_cards rows
 * referencing this copy.
 *
 * Body: { copyId: number }
 * Response: { success: true, copyId: number }
 *
 * Validates: Requirements 7.1
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { copyId?: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { copyId } = body

  // Validate input
  if (!copyId || typeof copyId !== 'number') {
    return Response.json({ error: 'copyId is required and must be a number' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify the copy belongs to the authenticated user
  const { data: userCopy, error: ucErr } = await supabase
    .from('user_copies')
    .select('id')
    .eq('id', copyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (ucErr) {
    return Response.json({ error: ucErr.message }, { status: 500 })
  }

  if (!userCopy) {
    return Response.json(
      { error: 'Copy not found or does not belong to user' },
      { status: 404 }
    )
  }

  // Update deck_cards: clear copy_id and ownership_status
  // If no deck_cards reference this copy_id, this is a no-op (still success)
  const { error: updateErr } = await supabase
    .from('deck_cards')
    .update({ copy_id: null, ownership_status: null })
    .eq('copy_id', copyId)

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  return Response.json({ success: true, copyId })
}
