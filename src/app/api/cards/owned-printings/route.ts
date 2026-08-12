/**
 * GET /api/cards/owned-printings?cardName=Sol Ring
 *
 * Returns all printing_ids the user owns for a given card name,
 * with location info (which deck or storage location each copy is in).
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

interface OwnedPrinting {
  scryfallPrintingId: string
  location: string // "In deck: Omnath" or "Binder: Trade Binder" or "Sorting Pile"
  finish: 'nonfoil' | 'foil' | 'etched'
  condition: string | null
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const cardName = request.nextUrl.searchParams.get('cardName')
  if (!cardName) {
    return Response.json({ error: 'cardName parameter required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Find card IDs for this card name
  const { data: cards } = await supabase
    .from('user_cards')
    .select('id')
    .eq('card_name', cardName)
    .eq('user_id', userId)

  if (!cards || cards.length === 0) {
    return Response.json({ printingIds: [], printings: [] })
  }

  const cardIds = cards.map(c => c.id)

  // Get all collection copies with location data
  // Location is now unified: locations table has type='storage' or type='deck'
  const { data: copies } = await supabase
    .from('user_copies')
    .select(`
      id,
      printing_id,
      finish,
      condition,
      location_id,
      locations(name, type, deck_id)
    `)
    .eq('user_id', userId)
    .in('card_id', cardIds)
    .not('printing_id', 'is', null)

  const printings: OwnedPrinting[] = []
  const printingIds: string[] = []

  for (const copy of copies ?? []) {
    if (!copy.printing_id) continue

    printingIds.push(copy.printing_id)

    // Determine location from unified locations table
    let location = 'Sorting Pile'
    const loc = (copy as any).locations
    if (loc) {
      if (loc.type === 'deck') {
        location = `In deck: ${loc.name}`
      } else if (loc.type === 'storage') {
        location = `Binder: ${loc.name}`
      }
    }

    printings.push({
      scryfallPrintingId: copy.printing_id,
      location,
      finish: (copy.finish as 'nonfoil' | 'foil' | 'etched') ?? 'nonfoil',
      condition: copy.condition,
    })
  }

  return Response.json({
    printingIds: [...new Set(printingIds)],
    printings,
  })
}
