/**
 * GET /api/onboarding/decks
 *
 * Warm-start Phase 1: Returns the user's Archidekt deck list for the deck picker.
 * Call this AFTER collection import completes.
 *
 * Query params:
 * - archidektUrl: Required. URL or numeric user ID to fetch decks for a specific user.
 *   Must match format: archidekt.com/collection/v2/{userId} or numeric ID.
 *
 * Returns: DeckListResult
 * Error 400: Invalid URL format or user not found
 */
import { requireAuth } from '@/lib/auth'
import { fetchArchidektDeckList } from '@/lib/warm-start-import'
import { parseArchidektCollectionInput, validateArchidektUserId } from '@/lib/archidekt-client'

// Allow up to 60s (fetches deck list from Archidekt API)
export const maxDuration = 60

export async function GET(request: Request) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { searchParams } = new URL(request.url)
  const archidektUrl = searchParams.get('archidektUrl')

  // archidektUrl is required - must match the one used for collection import
  if (!archidektUrl || !archidektUrl.trim()) {
    return Response.json(
      { error: 'archidektUrl query parameter is required. Use the same URL used for collection import.' },
      { status: 400 }
    )
  }

  const parsed = parseArchidektCollectionInput(archidektUrl)
  if (!parsed) {
    return Response.json(
      { error: 'Invalid Archidekt URL format. Supported: archidekt.com/collection/v2/{userId} or numeric user ID.' },
      { status: 400 }
    )
  }

  // Validate user has a public collection (not just public decks)
  let userId: number
  try {
    userId = await validateArchidektUserId(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 400 })
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
