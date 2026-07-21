/**
 * POST /api/cards/update-printing
 *
 * Updates the printing (scryfall_id, set_code) on either:
 * - A physical_copies row (collection context)
 * - A deck_cards row (deck slot context)
 *
 * Body: {
 *   target: 'physical_copy' | 'deck_card'
 *   targetId: number (physical_copies.id or deck_cards.id)
 *   scryfallId: string (new scryfall printing ID)
 *   setCode: string (new set code)
 *   collectorNumber?: string
 * }
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

interface UpdateBody {
  target: 'physical_copy' | 'deck_card'
  targetId: number
  scryfallId: string
  setCode: string
  collectorNumber?: string
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: UpdateBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { target, targetId, scryfallId, setCode, collectorNumber } = body

  if (!target || !targetId || !scryfallId || !setCode) {
    return Response.json({ error: 'target, targetId, scryfallId, and setCode are required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  if (target === 'physical_copy') {
    // Update the physical copy's printing
    const { error } = await supabase
      .from('physical_copies')
      .update({ scryfall_printing_id: scryfallId })
      .eq('id', targetId)
      .eq('user_id', userId)

    if (error) {
      return Response.json({ error: `Failed to update: ${error.message}` }, { status: 500 })
    }
  } else if (target === 'deck_card') {
    // Update the deck card's printing
    const { error } = await supabase
      .from('deck_cards')
      .update({
        scryfall_id: scryfallId,
        set_code: setCode,
      })
      .eq('id', targetId)

    if (error) {
      return Response.json({ error: `Failed to update: ${error.message}` }, { status: 500 })
    }
  } else {
    return Response.json({ error: 'Invalid target type' }, { status: 400 })
  }

  return Response.json({ success: true })
}
