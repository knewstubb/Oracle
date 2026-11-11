import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { loadDeckHealth } from '@/lib/deck-health-server'

/**
 * GET /api/decks/[id]/health
 * Deck health for one of the signed-in user's decks: four roles against the general guide.
 * Computed on request, nothing stored. Another user's deck is a 404; a failure is a real error (500), never a pass.
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

  const result = await loadDeckHealth(createAdminClient(), deckId, authResult.id)
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result.health)
}
