// ---------------------------------------------------------------------------
// POST /api/proxy-allocate
// Commit proxy/original allocation decisions for shared cards.
//
// GUARD: This route writes to proxy_allocations. Archidekt write-back via
// Playwright is dormant (supabase-migration Requirement 7) — users manually
// copy-paste deck lists. The push route remains available for manual use.
// See: deck-authority-split spec, Requirements 6.1, 6.2.
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import { commitAllocation } from '@/lib/allocation'

interface Allocation {
  deckId: number
  role: 'original' | 'proxy'
}

interface ProxyAllocateRequest {
  cardName: string
  allocations: Allocation[]
}

interface DeckResult {
  deckId: number
  success: boolean
  error?: string
}

interface ProxyAllocateResponse {
  success: boolean
  results: DeckResult[]
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ProxyAllocateRequest

    // --- Validation ---
    if (!body.cardName || typeof body.cardName !== 'string') {
      return Response.json(
        { success: false, results: [], error: 'cardName is required and must be a string' },
        { status: 400 }
      )
    }

    if (!Array.isArray(body.allocations) || body.allocations.length === 0) {
      return Response.json(
        { success: false, results: [], error: 'allocations array is required and must not be empty' },
        { status: 400 }
      )
    }

    for (const alloc of body.allocations) {
      if (!alloc.deckId || typeof alloc.deckId !== 'number') {
        return Response.json(
          { success: false, results: [], error: 'Each allocation must have a deckId (number)' },
          { status: 400 }
        )
      }
      if (alloc.role !== 'original' && alloc.role !== 'proxy') {
        return Response.json(
          {
            success: false,
            results: [],
            error: `Invalid role "${alloc.role}" — must be "original" or "proxy"`,
          },
          { status: 400 }
        )
      }
    }

    // Warn (but don't reject) if multiple originals
    const originals = body.allocations.filter((a) => a.role === 'original')
    if (originals.length > 1) {
      console.warn(
        `[proxy-allocate] Warning: ${originals.length} decks marked as original for "${body.cardName}"`
      )
    }

    // --- Delegate to allocation engine ---
    const result = await commitAllocation({
      cardName: body.cardName,
      allocations: body.allocations,
    })

    const response: ProxyAllocateResponse = {
      success: result.success,
      results: result.results,
    }

    if (!result.success) {
      const failedCount = result.results.filter((r) => !r.success).length
      response.error = `${failedCount} of ${result.results.length} deck(s) failed to update`
    }

    return Response.json(response, { status: result.success ? 200 : 207 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[proxy-allocate] Unexpected error: ${message}`)
    return Response.json(
      { success: false, results: [], error: `Unexpected error: ${message}` },
      { status: 500 }
    )
  }
}
