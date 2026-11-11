import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { loadDeckGap, parseGapRole } from '@/lib/deck-health-gap'

/** The server gives up after 25 seconds (a real error comes back); the screen gives up at 20 and shows Try again. */
export const maxDuration = 25

/**
 * GET /api/decks/[id]/health/gap?role=ramp|draw|removal|wipes|lands
 * Gap detail for one role: spare owned cards, then cards in another of the owner's decks, plus the deck's own cards in the role.
 * Only the signed-in user's deck and cards are read. Another user's deck is a 404; a failure is a real error (500).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId) || deckId <= 0) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const role = parseGapRole(request.nextUrl.searchParams.get('role'))
  if (!role) return Response.json({ error: 'Invalid role' }, { status: 400 })

  const result = await loadDeckGap(createAdminClient(), deckId, authResult.id, role)
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result.gap)
}
