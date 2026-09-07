/**
 * POST /api/onboarding/prefetch-decks
 *
 * Fetches multiple decks from Archidekt in parallel.
 * Returns an array of deck data that can be passed to resolve-one to skip the fetch step.
 *
 * This endpoint exists to parallelize the network-bound fetch phase while keeping
 * the allocation phase sequential (via resolve-one calls).
 *
 * Body: { deckIds: number[] }
 * Returns: { decks: PrefetchedDeck[], errors: PrefetchError[] }
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { fetchDeck, type ArchidektDeckFull } from '@/lib/archidekt-client'

// Allow up to 60s (fetching many decks in parallel)
export const maxDuration = 60

export interface PrefetchedDeck {
  deckId: number
  data: ArchidektDeckFull
}

export interface PrefetchError {
  deckId: number
  error: string
}

export interface PrefetchResponse {
  decks: PrefetchedDeck[]
  errors: PrefetchError[]
  durationMs: number
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  let body: { deckIds?: number[] }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { deckIds } = body
  if (!deckIds || !Array.isArray(deckIds) || deckIds.length === 0) {
    return Response.json({ error: 'deckIds array is required and must not be empty' }, { status: 400 })
  }

  // Cap at 30 decks per batch to avoid timeout
  if (deckIds.length > 30) {
    return Response.json({ error: 'Maximum 30 decks per prefetch batch' }, { status: 400 })
  }

  // Validate all entries are numbers
  if (!deckIds.every(id => typeof id === 'number' && Number.isFinite(id))) {
    return Response.json({ error: 'All deckIds must be valid numbers' }, { status: 400 })
  }

  const startTime = Date.now()
  const decks: PrefetchedDeck[] = []
  const errors: PrefetchError[] = []

  // Fetch all decks in parallel
  const results = await Promise.allSettled(
    deckIds.map(async (deckId): Promise<PrefetchedDeck> => {
      const data = await fetchDeck(deckId)
      return { deckId, data }
    })
  )

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const deckId = deckIds[i]

    if (result.status === 'fulfilled') {
      decks.push(result.value)
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
      if (message.includes('403')) {
        errors.push({ deckId, error: 'Deck is private — set it to Public in Archidekt first.' })
      } else {
        errors.push({ deckId, error: `Failed to fetch: ${message}` })
      }
    }
  }

  const response: PrefetchResponse = {
    decks,
    errors,
    durationMs: Date.now() - startTime,
  }

  console.log(`[prefetch-decks] Fetched ${decks.length}/${deckIds.length} decks in ${response.durationMs}ms`)

  return Response.json(response)
}
