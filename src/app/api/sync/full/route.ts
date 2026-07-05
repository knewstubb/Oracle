/**
 * POST /api/sync/full
 *
 * Trigger re-import for explicitly-provided deck IDs only.
 * Requires `deckIds` in the request body — will NOT auto-reconcile all decks.
 *
 * This route is gated behind explicit user intent: callers must specify which
 * decks to re-import. Without deckIds, returns 400 to prevent any accidental
 * auto-reconciliation of previously-imported decks.
 *
 * Validates: Requirements 6.2, 6.4 (deck authority split)
 */

import { NextRequest } from 'next/server'
import { runSyncCycle } from '@/lib/sync-engine'
import { fetchDeck } from '@/lib/archidekt-client'
import type { ArchidektFetcher } from '@/lib/sync-engine'

interface SyncFullRequestBody {
  deckIds?: number[]
}

/** Shared ArchidektFetcher using the archidekt-client module */
const archidektFetcher: ArchidektFetcher = {
  fetchDeck: (deckId: number) => fetchDeck(deckId),
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SyncFullRequestBody

    // --- DECK AUTHORITY SPLIT GATE ---
    // deckIds is REQUIRED. This route must never auto-reconcile all decks.
    // Callers must explicitly specify which decks to re-import.
    // Requirement 6.2: No code path overwrites deck_cards without explicit user initiation.
    // Requirement 6.4: No event-driven process fetches deck data and writes it automatically.
    if (!body.deckIds || !Array.isArray(body.deckIds) || body.deckIds.length === 0) {
      return Response.json(
        {
          success: false,
          error: 'deckIds is required. You must explicitly specify which decks to re-import. '
            + 'This route does not support auto-reconciling all decks.',
        },
        { status: 400 }
      )
    }

    // --- Validation ---
    for (const id of body.deckIds) {
      if (typeof id !== 'number' || id <= 0) {
        return Response.json(
          { success: false, error: 'Each deckId must be a positive number' },
          { status: 400 }
        )
      }
    }

    const result = await runSyncCycle('manual', archidektFetcher, body.deckIds)

    return Response.json({
      success: true,
      ...result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[sync/full] Unexpected error: ${message}`)
    return Response.json(
      { success: false, error: `Unexpected error: ${message}` },
      { status: 500 }
    )
  }
}
