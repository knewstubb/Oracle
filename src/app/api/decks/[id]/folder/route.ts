/**
 * PATCH /api/decks/[id]/folder
 *
 * Update a deck's folder assignment.
 * Body: { folderId: number | null }
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
  const deckId = parseInt(id, 10)

  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  let body: { folderId: number | null }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { folderId } = body

  if (folderId !== null && (typeof folderId !== 'number' || isNaN(folderId))) {
    return Response.json({ error: 'folderId must be a number or null' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // If setting a folder, verify it belongs to the user
  if (folderId !== null) {
    const { data: folder } = await (supabase as any)
      .from('deck_folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!folder) {
      return Response.json({ error: 'Folder not found' }, { status: 404 })
    }
  }

  // Update the deck's folder
  const { data: deck, error } = await (supabase as any)
    .from('decks')
    .update({ folder_id: folderId })
    .eq('id', deckId)
    .eq('user_id', userId)
    .select('id, name, folder_id')
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  return Response.json({ deck })
}
