/**
 * Deck Export Utility
 *
 * Converts deck cards into text format for clipboard export.
 * Uses MTGA-compatible format: `{qty} {Card Name} ({SET})`
 *
 * Groups by board:
 * - Main deck (default)
 * - Sideboard (cards with "Sideboard" category)
 * - Maybeboard (cards with "Maybeboard" category)
 *
 * Commander is listed first with a "Commander" header.
 */

interface ExportCard {
  card_name: string
  set_code: string
  quantity: number
  categories: string
  is_commander: boolean | number
}

/**
 * Export a deck's cards as a text decklist (MTGA-compatible format).
 *
 * Format per line: `1 Card Name (SET)`
 * Grouped: Commander → Deck → Sideboard → Maybeboard
 */
export function exportDeckAsText(cards: ExportCard[]): string {
  const commander: string[] = []
  const mainDeck: string[] = []
  const sideboard: string[] = []
  const maybeboard: string[] = []

  for (const card of cards) {
    const line = formatLine(card)
    const category = parsePrimaryCategory(card.categories)

    if (card.is_commander) {
      commander.push(line)
    } else if (category === 'Sideboard') {
      sideboard.push(line)
    } else if (category === 'Maybeboard') {
      maybeboard.push(line)
    } else {
      mainDeck.push(line)
    }
  }

  const sections: string[] = []

  if (commander.length > 0) {
    sections.push('// Commander')
    sections.push(...commander)
    sections.push('')
  }

  if (mainDeck.length > 0) {
    if (commander.length > 0) sections.push('// Deck')
    sections.push(...mainDeck)
  }

  if (sideboard.length > 0) {
    sections.push('')
    sections.push('// Sideboard')
    sections.push(...sideboard)
  }

  if (maybeboard.length > 0) {
    sections.push('')
    sections.push('// Maybeboard')
    sections.push(...maybeboard)
  }

  return sections.join('\n')
}

function formatLine(card: ExportCard): string {
  const qty = card.quantity || 1
  const set = card.set_code ? ` (${card.set_code.toUpperCase()})` : ''
  return `${qty} ${card.card_name}${set}`
}

function parsePrimaryCategory(raw: string | null | undefined): string {
  if (!raw) return 'Other'
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      return parsed[0].replace(/\(top\)|\(bottom\)/gi, '').trim()
    }
  } catch { /* */ }
  return raw.split(',')[0]?.trim().replace(/\(top\)|\(bottom\)/gi, '') || 'Other'
}
