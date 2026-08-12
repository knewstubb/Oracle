/**
 * POST /api/decks/import
 *
 * Accepts a normalized deck and import mode, routes to the appropriate
 * import executor, and returns the deck ID with allocation summary.
 *
 * Import modes:
 * - new_cards: Add cards to collection and assign to deck slots (for purchased decks)
 * - built: Create deck_cards then auto-pull from existing collection (user has physical deck)
 * - design: Create deck_cards only, no allocation (brewing/designing)
 *
 * Returns 200 even when allocation has errors (errors included in summary).
 * Returns 500 only on actual failures (deck creation, DB writes, etc.).
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { importDeckDesign, importDeckBuilt, importDeckNewCards } from '@/lib/deck-import'
import type { ImportMode } from '@/lib/deck-import'
import type { NormalizedDeck } from '@/lib/deck-normalizer'

const VALID_MODES: ImportMode[] = ['new_cards', 'built', 'design']

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { deck?: NormalizedDeck; mode?: ImportMode; format?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const { deck, mode, format: deckFormat } = body

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
    const importOpts = { format: deckFormat || 'commander' }
    
    let result
    switch (mode) {
      case 'new_cards':
        result = await importDeckNewCards(deck, userId, importOpts)
        break
      case 'built':
        result = await importDeckBuilt(deck, userId, importOpts)
        break
      case 'design':
        result = await importDeckDesign(deck, userId, importOpts)
        break
    }

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
