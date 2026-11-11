import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { loadDeckHealth } from '@/lib/deck-health-server'

/**
 * POST /api/decks/[id]/health/recheck
 * Fresh Deck health for one of the signed-in user's decks (same answer as GET, recounted now).
 * Also refreshes the commander's typical numbers if the saved ones are out of date (at most once an hour).
 */
export async function POST(
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

  const result = await loadDeckHealth(createAdminClient(), deckId, authResult.id, { recheck: true })
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result.health)
}
