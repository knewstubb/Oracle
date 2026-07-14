/**
 * GET /api/allocation/candidates?cardName=Sol+Ring&preferredScryfall=abc123
 *
 * Returns ranked physical copy candidates for a given card_name.
 * Used by the interactive picklist (Phase 2) to show available options.
 *
 * Query params:
 *   - cardName (required): The card name to find candidates for
 *   - preferredScryfall (optional): Preferred scryfall_printing_id for scoring
 *
 * Returns: { candidates: RankedCandidate[] }
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getRankedCandidates } from '@/lib/allocation-candidates'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { searchParams } = new URL(request.url)
  const cardName = searchParams.get('cardName')
  const preferredScryfall = searchParams.get('preferredScryfall') || null

  if (!cardName) {
    return Response.json(
      { error: 'cardName query parameter is required' },
      { status: 400 }
    )
  }

  try {
    const candidates = await getRankedCandidates(cardName, userId, preferredScryfall)
    return Response.json({ candidates })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[allocation/candidates] Failed for "${cardName}": ${message}`)
    return Response.json(
      { error: `Failed to fetch candidates: ${message}` },
      { status: 500 }
    )
  }
}
