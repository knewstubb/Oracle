/**
 * GET /api/allocation/valid-decks?cardName=Sol+Ring
 *
 * Returns decks whose color identity is a superset of the given card's color identity.
 * Used by storage detail "Assign" buttons and InstanceDetailPanel "Reassign" actions
 * where we don't have a specific deckId context.
 *
 * Returns: Array<{ deckId, deckName, isActive }>
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
    return Response.json({ error: 'cardName query parameter is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    // Get the card's color identity from ref_cards
    const { data: refCard } = await supabase
      .from('ref_cards')
      .select('color_identity')
      .eq('name', cardName)
      .maybeSingle()

    const cardCI = refCard?.color_identity
      ? refCard.color_identity.split('').filter(Boolean)
      : []

    // Fetch all decks (all decks claim cards equally now)
    const { data: allDecks } = await (supabase as any)
      .from('decks')
      .select('id, name, is_active, colour_identity, format')
      .eq('user_id', userId)

    // Filter to decks whose commander CI is a superset of the card's CI
    // Only applies to Commander format — other formats have no CI restriction
    const validDecks = (allDecks ?? [])
      .filter((deck: any) => {
        if (deck.format && deck.format !== 'commander') return true
        if (cardCI.length === 0) return true // Colorless cards go anywhere
        const deckCI = deck.colour_identity
          ? deck.colour_identity.split(',').map((c: string) => c.trim()).filter(Boolean)
          : []
        return cardCI.every((color: string) => deckCI.includes(color))
      })
      .map((deck: any) => ({
        deckId: deck.id,
        deckName: deck.name,
        isActive: deck.is_active ?? true,
      }))

    return Response.json(validDecks)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
