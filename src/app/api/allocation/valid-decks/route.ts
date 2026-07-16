/**
 * GET /api/allocation/valid-decks?cardName=Sol+Ring
 *
 * Returns decks whose color identity is a superset of the given card's color identity.
 * Used by storage detail "Assign" buttons and InstanceDetailPanel "Reassign" actions
 * where we don't have a specific deckId context.
 *
 * Returns: Array<{ deckId, deckName, deckStatus }>
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
    // Get the card's color identity
    const { data: cardDef } = await supabase
      .from('card_definitions')
      .select('color_identity')
      .eq('card_name', cardName)
      .eq('user_id', userId)
      .maybeSingle()

    const cardCI = cardDef?.color_identity
      ? cardDef.color_identity.split(',').map((c: string) => c.trim()).filter(Boolean)
      : []

    // Fetch all active decks
    const { data: allDecks } = await supabase
      .from('decks')
      .select('id, name, status, colour_identity, format')
      .eq('user_id', userId)
      .in('status', ['brew', 'boxed'])

    // Filter to decks whose commander CI is a superset of the card's CI
    // Only applies to Commander format — other formats have no CI restriction
    const validDecks = (allDecks ?? [])
      .filter((deck) => {
        if ((deck as any).format && (deck as any).format !== 'commander') return true
        if (cardCI.length === 0) return true // Colorless cards go anywhere
        const deckCI = deck.colour_identity
          ? deck.colour_identity.split(',').map((c: string) => c.trim()).filter(Boolean)
          : []
        return cardCI.every((color: string) => deckCI.includes(color))
      })
      .map((deck) => ({
        deckId: deck.id,
        deckName: deck.name,
        deckStatus: deck.status,
      }))

    return Response.json(validDecks)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
