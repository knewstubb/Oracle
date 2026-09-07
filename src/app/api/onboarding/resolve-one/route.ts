/**
 * POST /api/onboarding/resolve-one
 *
 * Resolves a SINGLE deck against the committed collection.
 * Used by the client-side sequential loop for per-deck progress tracking.
 *
 * If prefetchedDeck is provided, skips the Archidekt API fetch (faster).
 * Otherwise, fetches the deck from Archidekt as before.
 *
 * Body: { deckId: number, isActive?: boolean, prefetchedDeck?: ArchidektDeckFull }
 * Returns: DeckResolutionResult (single deck)
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { resolveDeckBatch, resolveSingleDeckWithPrefetch } from '@/lib/warm-start-resolve'
import type { ArchidektDeckFull } from '@/lib/archidekt-client'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { deckId?: number; isActive?: boolean; prefetchedDeck?: ArchidektDeckFull }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { deckId, isActive, prefetchedDeck } = body
  if (!deckId || typeof deckId !== 'number') {
    return Response.json({ error: 'deckId (number) is required' }, { status: 400 })
  }

  try {
    // If prefetched data is provided, use the fast path (no Archidekt API call)
    if (prefetchedDeck) {
      const result = await resolveSingleDeckWithPrefetch(
        deckId,
        prefetchedDeck,
        userId,
        isActive ?? true
      )
      return Response.json(result)
    }

    // Fallback: fetch from Archidekt (slower, but works without prefetch)
    const deckActiveStates: Record<number, boolean> = { [deckId]: isActive ?? true }
    const result = await resolveDeckBatch([deckId], userId, deckActiveStates)
    return Response.json(
      result.results[0] ?? {
        deckId,
        deckName: 'Unknown',
        totalCards: 0,
        matched: 0,
        unresolved: 0,
        unresolvedCards: [],
        errors: ['No result'],
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[onboarding/resolve-one] Resolution failed:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
