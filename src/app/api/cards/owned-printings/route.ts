/**
 * GET /api/cards/owned-printings?cardName=Sol Ring
 *
 * Returns all scryfall_printing_ids the user owns for a given card name,
 * with location info (which deck or binder each copy is in).
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

interface OwnedPrinting {
  scryfallPrintingId: string
  location: string // "In deck: Omnath" or "Binder: Trade Binder" or "Unsorted"
  isFoil: boolean
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

  // Find card_definition IDs for this card name
  const { data: defs } = await supabase
    .from('card_definitions')
    .select('id')
    .eq('card_name', cardName)
    .eq('user_id', userId)

  if (!defs || defs.length === 0) {
    return Response.json({ printingIds: [], printings: [] })
  }

  const defIds = defs.map(d => d.id)

  // Get all physical copies with location data
  const { data: copies } = await supabase
    .from('physical_copies')
    .select(`
      id,
      scryfall_printing_id,
      is_foil,
      condition,
      storage_location_id,
      storage_locations(name),
      deck_cards!deck_cards_physical_copy_id_fkey(
        deck_id,
        decks!deck_cards_deck_id_fkey(name)
      )
    `)
    .eq('user_id', userId)
    .in('card_definition_id', defIds)
    .not('scryfall_printing_id', 'is', null)

  const printings: OwnedPrinting[] = []
  const printingIds: string[] = []

  for (const copy of copies ?? []) {
    if (!copy.scryfall_printing_id) continue

    printingIds.push(copy.scryfall_printing_id)

    // Determine location
    let location = 'Unsorted'
    const deckCards = (copy as any).deck_cards
    if (deckCards && deckCards.length > 0) {
      const deckName = deckCards[0].decks?.name ?? 'Unknown deck'
      location = `In deck: ${deckName}`
    } else if ((copy as any).storage_locations?.name) {
      location = `Binder: ${(copy as any).storage_locations.name}`
    }

    printings.push({
      scryfallPrintingId: copy.scryfall_printing_id,
      location,
      isFoil: copy.is_foil,
      condition: copy.condition,
    })
  }

  return Response.json({
    printingIds: [...new Set(printingIds)],
    printings,
  })
}
