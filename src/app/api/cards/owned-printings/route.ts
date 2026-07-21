/**
 * GET /api/cards/owned-printings?cardName=Sol Ring
 *
 * Returns all scryfall_printing_ids the user owns for a given card name.
 * Used by the PrintingPicker to highlight owned printings.
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const cardName = request.nextUrl.searchParams.get('cardName')
  if (!cardName) {
    return Response.json({ error: 'cardName parameter required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Find card_definition IDs for this card name
  const { data: defs } = await supabase
    .from('card_definitions')
    .select('id')
    .eq('card_name', cardName)
    .eq('user_id', userId)

  if (!defs || defs.length === 0) {
    return Response.json({ printingIds: [] })
  }

  const defIds = defs.map(d => d.id)

  // Get all physical copies with their scryfall_printing_id
  const { data: copies } = await supabase
    .from('physical_copies')
    .select('scryfall_printing_id')
    .eq('user_id', userId)
    .in('card_definition_id', defIds)
    .not('scryfall_printing_id', 'is', null)

  const printingIds = [...new Set((copies ?? []).map(c => c.scryfall_printing_id).filter(Boolean))]

  return Response.json({ printingIds })
}
