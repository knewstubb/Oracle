/**
 * POST /api/decks/import
 *
 * Accepts a normalized deck and import mode, routes to the appropriate
 * import executor, and returns the deck ID with allocation summary.
 *
 * Import modes:
 * - new_cards: Add cards to collection and assign to deck slots (for purchased decks)
 * - built: Create deck_cards then auto-pull from existing collection (user has physical deck)
 * - theorycrafted: Create deck_cards only, no allocation (brewing/theorycrafteding)
 *
 * Returns 200 even when allocation has errors (errors included in summary).
 * Returns 500 only on actual failures (deck creation, DB writes, etc.).
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { importDeckTheorycrafted, importDeckBuilt, importDeckNewCards } from '@/lib/deck-import'
import type { ImportMode } from '@/lib/deck-import'
import { importManaBoxDeck, type ManaBoxDeckCard } from '@/lib/manabox-deck-import'
import type { NormalizedDeck } from '@/lib/deck-normalizer'
import { ImportValidationError } from '@/lib/import-copies'
import { NeedsChoiceError } from '@/lib/import-intent-save'
import { parseImportCommandZone } from '@/lib/import-command-zone-save'
import type { ImportIntent } from '../../../../../docs/oracle/contracts/import-intent.types'
import type {
  ImportCopyEdits,
  ImportDefaults,
} from '../../../../../docs/oracle/contracts/import-row-editing.types'
import type { ManaBoxUnmatchedLine } from '../../../../../docs/oracle/contracts/manabox-import.types'

const VALID_MODES: ImportMode[] = ['new_cards', 'built', 'theorycrafted']

interface DeckImportBody {
  deck?: NormalizedDeck
  mode?: ImportMode
  format?: string
  name?: string
  defaults?: ImportDefaults
  copyEdits?: ImportCopyEdits
  /** "Ignore basic lands" switch (absent means on). */
  ignoreBasics?: boolean
  /** Intent save (S4+): present only when the review used the intent choice. */
  intent?: unknown
  source?: unknown
  genericArt?: Record<string, { scryfallId: string }>
  unmatched?: ManaBoxUnmatchedLine[]
  /** Command zone picked on the review: card names (command-zone-roles §4). */
  commandZone?: unknown
}

/** A ManaBox deck import carries per-row copies and the import defaults. */
function isManaBoxDeckBody(body: DeckImportBody): boolean {
  if (body.defaults !== undefined) return true
  const cards = body.deck?.cards as ManaBoxDeckCard[] | undefined
  if (!cards) return false
  return cards.some((card) => 'copies' in card || 'rowKey' in card)
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: DeckImportBody
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

  // -------------------------------------------------------------------------
  // ManaBox deck import — one deck, per-row Original/Proxy/Unsleeved (D-047).
  // -------------------------------------------------------------------------
  if (isManaBoxDeckBody(body)) {
    try {
      const result = await importManaBoxDeck({
        deck,
        name: body.name || deck.name,
        format: deckFormat,
        defaults: body.defaults as ImportDefaults,
        copyEdits: body.copyEdits,
        ignoreBasics: body.ignoreBasics === true,
        intent: body.intent as ImportIntent | undefined,
        genericArt: body.genericArt,
        userId,
        unmatched: body.unmatched,
        commandZone: parseImportCommandZone(body.commandZone),
      })
      return Response.json(result)
    } catch (err) {
      if (err instanceof NeedsChoiceError) {
        return Response.json({ error: 'needs_choice', rowKeys: err.rowKeys }, { status: 400 })
      }
      if (err instanceof ImportValidationError) {
        return Response.json(
          { error: 'Invalid import request', problems: err.problems },
          { status: 400 }
        )
      }
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[decks/import] ManaBox import failed: ${message}`)
      return Response.json({ error: 'Deck import failed' }, { status: 500 })
    }
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
      case 'theorycrafted':
        result = await importDeckTheorycrafted(deck, userId, importOpts)
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
