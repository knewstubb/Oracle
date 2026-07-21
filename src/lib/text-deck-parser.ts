// ---------------------------------------------------------------------------
// Text Deck Parser — Parses pasted decklists (MTGA format and similar)
// ---------------------------------------------------------------------------

import type { NormalizedCard, NormalizedDeck } from '@/lib/deck-normalizer'

/**
 * Supported grammar:
 * - `<qty> <name>` per line (e.g. "1 Sol Ring", "4 Lightning Bolt")
 * - `<qty>x <name>` tolerated (e.g. "1x Sol Ring")
 * - Blank lines are ignored
 * - Lines starting with `//` or `#` are comments (ignored)
 * - A line containing only "Commander" or "Commander:" opens a commander section
 *   (subsequent cards until next section or blank line are marked as commander)
 * - Optional set info in parentheses: "1 Sol Ring (CMR) 472" — parsed but not required
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
  const lines = text.split(/\r?\n/)
  const cards: NormalizedCard[] = []
  const warnings: string[] = []
  let commanderSection = false
  let commanderCard: NormalizedCard | null = null
  let lineNum = 0

  for (const rawLine of lines) {
    lineNum++
    const line = rawLine.trim()

    // Skip empty lines
    if (!line) {
      commanderSection = false // blank line ends commander section
      continue
    }

    // Skip comments
    if (line.startsWith('//') || line.startsWith('#')) continue

    // Check for section headers
    const lowerLine = line.toLowerCase()
    if (lowerLine === 'commander' || lowerLine === 'commander:') {
      commanderSection = true
      continue
    }

    // Check for other common section headers (sideboard, maybeboard)
    if (/^(sideboard|maybeboard|companion|considering):?$/i.test(line)) {
      commanderSection = false
      continue
    }

    // Parse card line: <qty>[x] <name> [(SET) COLLECTOR#]
    const match = line.match(/^(\d+)\s*x?\s+(.+)$/i)
    if (!match) {
      warnings.push(`Line ${lineNum}: couldn't parse "${line.substring(0, 50)}"`)
      continue
    }

    const quantity = parseInt(match[1], 10)
    let cardText = match[2].trim()

    // Extract optional set info: "Sol Ring (CMR) 472" → name="Sol Ring", setCode="CMR"
    let setCode = ''
    const setMatch = cardText.match(/^(.+?)\s+\(([A-Za-z0-9]+)\)\s*(\d+)?$/)
    if (setMatch) {
      cardText = setMatch[1].trim()
      setCode = setMatch[2]
    }

    const card: NormalizedCard = {
      cardName: cardText,
      quantity,
      scryfallId: '',
      oracleId: '',
      setCode,
      typeLine: '',
      isProxy: false,
      isCommander: commanderSection,
      manaCost: null,
      colorIdentity: [],
      sourceCategories: commanderSection ? ['Commander'] : [],
    }

    if (commanderSection && !commanderCard) {
      commanderCard = card
    }

    cards.push(card)
  }

  if (cards.length === 0) {
    return { error: 'No cards found in the pasted text. Expected format: "1 Sol Ring" per line.' }
  }

  // Derive colour identity placeholder (will be resolved by the import pipeline)
  const deck: NormalizedDeck = {
    name: deckName || 'Pasted Deck',
    cards,
    cardCount: cards.reduce((sum, c) => sum + c.quantity, 0),
    commander: commanderCard ?? null,
    colourIdentity: '',
    sourceUrl: '',
    platformDeckId: '',
    platform: 'paste',
  }

  return { deck, warnings }
}
