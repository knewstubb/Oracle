/**
 * POST /api/onboarding/moxfield/resolve-one
 *
 * Resolves a SINGLE Moxfield deck against the committed collection.
 * Used by the client-side sequential loop for per-deck progress tracking.
 *
 * Body: { deckId: string, status: 'brew' | 'boxed' }
 * Returns: DeckResolutionResult (single deck)
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { resolveMoxfieldDeckBatch } from '@/lib/warm-start-resolve-moxfield'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { deckId?: string; status?: 'brew' | 'boxed' }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { deckId, status } = body
  if (!deckId || typeof deckId !== 'string') {
    return Response.json({ error: 'deckId (string) is required' }, { status: 400 })
  }

  const deckStatuses: Record<string, 'brew' | 'boxed'> = { [deckId]: status ?? 'boxed' }

  try {
    const result = await resolveMoxfieldDeckBatch([deckId], userId, deckStatuses)
    return Response.json(
      result.results[0] ?? {
        deckId: 0,
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
    console.error('[onboarding/moxfield/resolve-one] Resolution failed:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
