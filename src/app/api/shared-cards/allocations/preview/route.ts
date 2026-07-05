import { NextRequest } from 'next/server'
import { previewAllocation, type AllocationDecision } from '@/lib/allocation'

/**
 * POST /api/shared-cards/allocations/preview
 *
 * Accepts an AllocationDecision and returns an AllocationPreview
 * showing what would change — without modifying DB or Archidekt.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AllocationDecision

    // --- Validation ---
    if (!body.cardName || typeof body.cardName !== 'string') {
      return Response.json(
        { error: 'cardName is required and must be a string' },
        { status: 400 }
      )
    }

    if (!Array.isArray(body.allocations) || body.allocations.length === 0) {
      return Response.json(
        { error: 'allocations array is required and must not be empty' },
        { status: 400 }
      )
    }

    for (const alloc of body.allocations) {
      if (!alloc.deckId || typeof alloc.deckId !== 'number') {
        return Response.json(
          { error: 'Each allocation must have a deckId (number)' },
          { status: 400 }
        )
      }
      if (alloc.role !== 'original' && alloc.role !== 'proxy') {
        return Response.json(
          { error: `Invalid role "${alloc.role}" — must be "original" or "proxy"` },
          { status: 400 }
        )
      }
    }

    const preview = await previewAllocation({
      cardName: body.cardName,
      allocations: body.allocations,
    })

    return Response.json(preview)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[allocations/preview] Error: ${message}`)
    return Response.json(
      { error: `Unexpected error: ${message}` },
      { status: 500 }
    )
  }
}
