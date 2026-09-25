/**
 * POST /api/allocation/candidates/batch
 *
 * Read-only batch suggestion endpoint. Returns ranked physical-copy candidates
 * for many card names at once, reusing the V2 resolver compute layer
 * (`src/lib/allocation-candidates.ts`) without writing any allocation state.
 *
 * Contract: docs/oracle/contracts/allocation-suggestion-engine.md (§4.2)
 * Types:    docs/oracle/contracts/allocation-suggestion-engine.types.ts
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  getBatchRankedCandidates,
  type RankedCandidate,
} from '@/lib/allocation-candidates'
import type {
  AllocationSuggestionValidationError,
  AllocationSuggestionInternalError,
} from '../../../../../../docs/oracle/contracts/allocation-suggestion-engine.types'

interface BatchCandidateRequestBody {
  cardNames?: unknown
  preferredScryfallByName?: unknown
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: BatchCandidateRequestBody
  try {
    body = (await request.json()) as BatchCandidateRequestBody
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies AllocationSuggestionValidationError,
      { status: 400 }
    )
  }

  if (!Array.isArray(body?.cardNames)) {
    return Response.json(
      { error: 'cardNames array is required', code: 'MISSING_PARAMETER' } satisfies AllocationSuggestionValidationError,
      { status: 400 }
    )
  }

  const cardNames = body.cardNames.filter(
    (name): name is string => typeof name === 'string' && name.trim().length > 0
  )

  if (cardNames.length === 0) {
    return Response.json(
      { error: 'cardNames cannot be empty', code: 'EMPTY_BATCH' } satisfies AllocationSuggestionValidationError,
      { status: 400 }
    )
  }

  const preferredScryfallByName =
    body.preferredScryfallByName && typeof body.preferredScryfallByName === 'object'
      ? (body.preferredScryfallByName as Record<string, string | null>)
      : undefined

  try {
    const candidatesByName = await getBatchRankedCandidates(
      cardNames,
      userId,
      preferredScryfallByName
    )

    const results: Record<string, RankedCandidate[]> = {}
    for (const [cardName, candidates] of candidatesByName) {
      results[cardName] = candidates
    }

    return Response.json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[allocation/candidates/batch] Failed: ${message}`)
    return Response.json(
      {
        error: `Failed to fetch batch candidates: ${message}`,
        code: 'INTERNAL_ERROR',
      } satisfies AllocationSuggestionInternalError,
      { status: 500 }
    )
  }
}
