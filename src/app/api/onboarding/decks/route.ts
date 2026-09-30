/**
 * GET /api/onboarding/decks
 *
 * Warm-start Phase 1: Returns the user's Archidekt deck list for the deck picker.
 * Call this AFTER collection import completes.
 *
 * Query params:
 * - archidektUrl: Optional URL or username to fetch decks for a specific user
 *
 * Returns: DeckListResult
 */
import { requireAuth } from '@/lib/auth'
import { fetchArchidektDeckList } from '@/lib/warm-start-import'
import { parseArchidektCollectionInput, resolveArchidektUserId } from '@/lib/archidekt-client'

// Allow up to 60s (fetches deck list from Archidekt API)
export const maxDuration = 60

export async function GET(request: Request) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { searchParams } = new URL(request.url)
  const archidektUrl = searchParams.get('archidektUrl') || undefined

  let userId: number | undefined
  if (archidektUrl && archidektUrl.trim()) {
    const parsed = parseArchidektCollectionInput(archidektUrl)
    if (parsed) {
      try {
        userId = await resolveArchidektUserId(parsed)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return Response.json({ error: message }, { status: 400 })
      }
    }
  }

  try {
    const result = await fetchArchidektDeckList(userId)
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
