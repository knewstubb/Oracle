// ---------------------------------------------------------------------------
// Text Deck Parser — Parses pasted decklists (MTGA format and similar)
// ---------------------------------------------------------------------------

import type { NormalizedCard, NormalizedDeck } from '@/lib/deck-normalizer'
import { parseListText } from '@/lib/import-text-parser'

/**
 * Grammar: see import-text-parser.ts (docs/oracle/contracts/import-formats.md §5-§6).
 * Section words (Commander, Deck, Sideboard, Maybeboard, Companion, Tokens), `SB:` lines and
 * line tags decide the board. Sideboard and Maybeboard cards go to the MAYBEBOARD relation
 * and never to the main list (D-018). A blank line does not end a section.
 *
 * Companion cards stay in the main list until the command-zone role exists (slice S-7).
 */

export interface TextParseResult {
  deck: NormalizedDeck
  warnings: string[]
}

export interface TextParseError {
  error: string
}

export function isTextParseError(result: TextParseResult | TextParseError): result is TextParseError {
  return 'error' in result
}

/**
 * Parse a text decklist into a NormalizedDeck.
 */
export function parseTextDecklist(
  text: string,
  deckName: string
): TextParseResult | TextParseError {
  const parsed = parseListText(text)
  const cards: NormalizedCard[] = []
  const maybeboard: NormalizedCard[] = []
  let commanderCard: NormalizedCard | null = null

  for (const line of parsed.lines) {
    const board = line.board ?? 'main'
    const isCommander = board === 'commander'
    const card: NormalizedCard = {
      cardName: line.cardName,
      quantity: line.quantity,
      scryfallId: '',
      oracleId: '',
      setCode: line.setCode,
      collectorNumber: line.collectorNumber,
      typeLine: '',
      isProxy: line.proxy === true,
      isCommander,
      manaCost: null,
      colorIdentity: [],
      sourceCategories: isCommander ? ['Commander'] : board === 'maybeboard' ? ['Maybeboard'] : [],
    }

    if (board === 'maybeboard') {
      maybeboard.push(card)
      continue
    }
    if (isCommander && !commanderCard) commanderCard = card
    cards.push(card)
  }

  if (cards.length === 0 && maybeboard.length === 0) {
    return { error: 'No cards found in the pasted text. Expected format: "1 Sol Ring" per line.' }
  }

  const warnings = [
    ...parsed.badLines.map((b) => `Line ${b.sourceIndex}: couldn't parse "${b.rawLine.trim().substring(0, 50)}"`),
    ...parsed.warnings,
    ...parsed.notes,
  ]

  // Derive colour identity placeholder (will be resolved by the import pipeline)
  const deck: NormalizedDeck = {
    name: deckName || 'Pasted Deck',
    cards,
    maybeboard,
    cardCount: cards.reduce((sum, c) => sum + c.quantity, 0),
    commander: commanderCard ?? null,
    colourIdentity: '',
    sourceUrl: '',
    platformDeckId: '',
    platform: 'paste',
  }

  return { deck, warnings }
}
