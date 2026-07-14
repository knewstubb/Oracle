import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * POST /api/collection/instances/unassign
 *
 * Unassigns a physical copy from any deck it is assigned to.
 * Clears the deck_cards.physical_copy_id reference and sets
 * ownership_status to 'not_owned' for all deck_cards rows
 * referencing this physical copy.
 *
 * Body: { physicalCopyId: number }
 * Response: { success: true, physicalCopyId: number }
 *
 * Validates: Requirements 7.1
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

  // Update deck_cards: clear physical_copy_id and ownership_status
  // If no deck_cards reference this physical_copy_id, this is a no-op (still success)
  const { error: updateErr } = await (supabase as any)
    .from('deck_cards')
    .update({ physical_copy_id: null, ownership_status: null })
    .eq('physical_copy_id', physicalCopyId)

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  return Response.json({ success: true, physicalCopyId })
}
