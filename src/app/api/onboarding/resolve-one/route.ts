/**
 * POST /api/onboarding/resolve-one
 *
 * Resolves a SINGLE deck against the committed collection.
 * Used by the client-side sequential loop for per-deck progress tracking.
 *
 * Body: { deckId: number, status: 'brewing' | 'in_rotation' }
 * Returns: DeckResolutionResult (single deck)
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { resolveDeckBatch } from '@/lib/warm-start-resolve'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { deckId?: number; status?: 'brewing' | 'in_rotation' }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { deckId, status } = body
  if (!deckId || typeof deckId !== 'number') {
    return Response.json({ error: 'deckId (number) is required' }, { status: 400 })
  }

  const deckStatuses: Record<number, 'brewing' | 'in_rotation'> = { [deckId]: status ?? 'in_rotation' }

  try {
    const result = await resolveDeckBatch([deckId], userId, deckStatuses)
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
