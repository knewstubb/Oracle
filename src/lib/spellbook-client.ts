/**
 * Commander Spellbook Direct Client — combo search for Commander decks.
 *
 * Uses the public API at backend.commanderspellbook.com for:
 * - Finding combos that include a specific card
 * - Finding combos within a colour identity
 *
 * No authentication required.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpellbookCombo {
  id: string
  cards: string[]
  produces: string[]
  description: string
  identity: string
  cardCount: number
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const BASE_URL = 'https://backend.commanderspellbook.com'
const USER_AGENT = 'TheOracle/0.1.0'

/**
 * Search for combos involving a specific card.
 * Returns combos sorted by card count (fewer pieces = more practical).
 */
export async function findCombosForCard(
  cardName: string,
  options?: { colorIdentity?: string; limit?: number }
): Promise<SpellbookCombo[]> {
  const limit = options?.limit ?? 10
  let query = `card="${cardName}"`

  if (options?.colorIdentity) {
    query += ` ci:${options.colorIdentity}`
  }

  const url = `${BASE_URL}/variants?q=${encodeURIComponent(query)}&limit=${limit}&ordering=popularity`

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    throw new Error(`Commander Spellbook API error: ${response.status}`)
  }

  const data = await response.json()
  const results = data.results || []

  return results.map((r: any) => ({
    id: r.id,
    cards: (r.uses || []).map((u: any) => u.name),
    produces: (r.produces || []).map((p: any) => p.feature?.name || p.name || ''),
    description: r.description || '',
    identity: r.identity || '',
    cardCount: (r.uses || []).length,
  }))
}

/**
 * Format combo results as text for the AI tool.
 */
export function formatComboResults(cardName: string, combos: SpellbookCombo[]): string {
  if (combos.length === 0) {
    return `No combos found involving ${cardName}.`
  }

  const lines: string[] = []
  lines.push(`Combos involving ${cardName} (${combos.length} found):`)
  lines.push('')

  for (const combo of combos) {
    lines.push(`[${combo.cardCount} cards] ${combo.cards.join(' + ')}`)
    lines.push(`  → ${combo.produces.join(', ')}`)
    if (combo.description) {
      // Truncate long descriptions
      const desc = combo.description.length > 150
        ? combo.description.substring(0, 150) + '...'
        : combo.description
      lines.push(`  Steps: ${desc}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
