/**
 * EDHREC Direct Client — replaces MCP subprocess for EDHREC data.
 *
 * Uses EDHREC's undocumented JSON API (json.edhrec.com) for:
 * - Commander top cards (staples, synergy data, inclusion rates)
 * - Card synergy scores for a given commander
 *
 * No authentication required. Rate limit: be respectful (100ms between calls).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EDHRECCard {
  name: string
  synergy: number       // -1.0 to 1.0 — how much this card is specific to this commander
  inclusion: number     // 0-100 — percentage of decks running this card
  numDecks: number      // total decks in the sample
  cardType: string      // creature, instant, sorcery, etc.
}

export interface EDHRECCommanderData {
  commanderName: string
  slug: string
  numDecks: number
  cards: EDHRECCard[]
}

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

/**
 * Convert a commander name to EDHREC URL slug format.
 * "Urza, Lord High Artificer" → "urza-lord-high-artificer"
 * "Atraxa, Praetors' Voice" → "atraxa-praetors-voice"
 */
function toSlug(commanderName: string): string {
  return commanderName
    .toLowerCase()
    .replace(/['']/g, '')           // Remove apostrophes
    .replace(/[^a-z0-9\s-]/g, '')  // Remove special chars
    .replace(/\s+/g, '-')          // Spaces to hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-|-$/g, '')         // Trim leading/trailing hyphens
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const BASE_URL = 'https://json.edhrec.com/pages/commanders'
const USER_AGENT = 'TheOracle/0.1.0'

/**
 * Fetch commander top cards from EDHREC.
 *
 * Returns staple cards with synergy scores and inclusion rates.
 * Throws on network errors or if commander is not found.
 */
export async function getCommanderTopCards(
  commanderName: string
): Promise<EDHRECCommanderData> {
  const slug = toSlug(commanderName)
  const url = `${BASE_URL}/${slug}.json`

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Commander "${commanderName}" not found on EDHREC (slug: ${slug})`)
    }
    throw new Error(`EDHREC API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // Parse the response — EDHREC returns cards grouped by type
  const cards: EDHRECCard[] = []
  const cardTypes = ['creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'land', 'battle']

  for (const cardType of cardTypes) {
    const typeData = data[cardType]
    if (!typeData || !Array.isArray(typeData)) continue

    for (const entry of typeData) {
      if (!entry.name) continue
      cards.push({
        name: entry.name,
        synergy: entry.synergy ?? 0,
        inclusion: entry.inclusion ?? 0,
        numDecks: entry.num_decks ?? 0,
        cardType,
      })
    }
  }

  // Sort by inclusion rate descending
  cards.sort((a, b) => b.inclusion - a.inclusion)

  return {
    commanderName,
    slug,
    numDecks: data.num_decks ?? cards[0]?.numDecks ?? 0,
    cards,
  }
}

/**
 * Get the top N cards for a commander, optionally filtered by card type.
 */
export async function getCommanderStaples(
  commanderName: string,
  options?: { limit?: number; cardType?: string }
): Promise<{ commanderName: string; numDecks: number; cards: EDHRECCard[] }> {
  const data = await getCommanderTopCards(commanderName)
  let filtered = data.cards

  if (options?.cardType) {
    const ct = options.cardType.toLowerCase()
    filtered = filtered.filter(c => c.cardType === ct)
  }

  const limit = options?.limit ?? 20
  return {
    commanderName: data.commanderName,
    numDecks: data.numDecks,
    cards: filtered.slice(0, limit),
  }
}

/**
 * Format EDHREC data as a text response for the AI tool.
 */
export function formatEDHRECResponse(data: { commanderName: string; numDecks: number; cards: EDHRECCard[] }): string {
  const lines: string[] = []
  lines.push(`EDHREC data for ${data.commanderName} (${data.numDecks} decks):`)
  lines.push('')

  for (const card of data.cards) {
    const synPct = (card.synergy * 100).toFixed(0)
    const synLabel = card.synergy > 0 ? `+${synPct}%` : `${synPct}%`
    lines.push(`- ${card.name} | ${card.inclusion}% inclusion | ${synLabel} synergy | ${card.cardType}`)
  }

  return lines.join('\n')
}
