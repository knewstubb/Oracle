/**
 * GET /api/onboarding/decks
 *
 * Warm-start Phase 1: Returns the user's Archidekt deck list for the deck picker.
 * Call this AFTER collection import completes.
 *
 * Returns: DeckListResult
 */
import { requireAuth } from '@/lib/auth'
import { fetchArchidektDeckList } from '@/lib/warm-start-import'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const result = await fetchArchidektDeckList()
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('private') || message.includes('Public')) {
      return Response.json({ error: message }, { status: 403 })
    }
    console.error('[onboarding/decks] Fetch failed:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
