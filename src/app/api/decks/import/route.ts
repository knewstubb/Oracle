/**
 * POST /api/decks/import
 *
 * Accepts a normalized deck and import mode, routes to the appropriate
 * import executor, and returns the deck ID with allocation summary.
 *
 * Returns 200 even when allocation has errors (errors included in summary).
 * Returns 500 only on actual failures (deck creation, DB writes, etc.).
 *
 * Validates: Requirements 5.1, 6.1, 8.1, 10.1
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { importDeckExistingCollection, importDeckAddNewCards } from '@/lib/deck-import'
import type { ImportMode } from '@/lib/deck-import'
import type { NormalizedDeck } from '@/lib/deck-normalizer'

const VALID_MODES: ImportMode[] = ['existing_collection', 'add_new_cards']

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { deck?: NormalizedDeck; mode?: ImportMode; status?: 'brew' | 'boxed'; format?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const { deck, mode, status: deckStatus, format: deckFormat } = body

  // Validate deck presence and structure
  if (!deck || typeof deck !== 'object') {
    return Response.json(
      { error: 'Deck data is required' },
      { status: 400 }
    )
  }

  if (!deck.cards || !Array.isArray(deck.cards) || deck.cards.length === 0) {
    return Response.json(
      { error: 'Deck must contain at least one card' },
      { status: 400 }
    )
  }

  // Validate mode
  if (!mode || !VALID_MODES.includes(mode)) {
    return Response.json(
      { error: `Invalid import mode. Must be one of: ${VALID_MODES.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const importOpts = { status: deckStatus || 'brew', format: deckFormat || 'commander' }
    const result =
      mode === 'existing_collection'
        ? await importDeckExistingCollection(deck, userId, importOpts)
        : await importDeckAddNewCards(deck, userId, importOpts)

    return Response.json({
      deckId: result.deckId,
      allocationSummary: result.allocationSummary,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[decks/import] Import failed: ${message}`)

    return Response.json(
      { error: 'Deck import failed' },
      { status: 500 }
    )
  }
}
