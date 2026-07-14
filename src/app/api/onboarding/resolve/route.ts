/**
 * POST /api/onboarding/resolve
 *
 * Warm-start Phase 2: Sequentially resolve selected decks against the committed collection.
 * Must be called AFTER /api/onboarding/collection completes.
 *
 * Body: { deckIds: number[] }
 * Returns: BatchResolutionResult
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { resolveDeckBatch } from '@/lib/warm-start-resolve'

// Allow up to 120s (resolves multiple decks sequentially against collection)
export const maxDuration = 120

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { deckIds?: number[]; deckStatuses?: Record<number, 'brew' | 'boxed'> }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { deckIds } = body
  if (!deckIds || !Array.isArray(deckIds) || deckIds.length === 0) {
    return Response.json({ error: 'deckIds array is required and must not be empty' }, { status: 400 })
  }

  // Cap at 20 decks per batch to avoid timeout
  if (deckIds.length > 20) {
    return Response.json({ error: 'Maximum 20 decks per batch' }, { status: 400 })
  }

  // Validate all entries are numbers
  if (!deckIds.every(id => typeof id === 'number' && Number.isFinite(id))) {
    return Response.json({ error: 'All deckIds must be valid numbers' }, { status: 400 })
  }

  try {
    const result = await resolveDeckBatch(deckIds, userId, body.deckStatuses)
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[onboarding/resolve] Batch resolution failed:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
