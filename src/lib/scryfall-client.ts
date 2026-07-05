/**
 * Scryfall Direct Client — replaces MCP subprocess for card verification and search.
 *
 * Uses Scryfall's REST API for:
 * - Card lookup by exact name (verification)
 * - Commander legality validation
 * - Card search by query (type, colour, keywords)
 *
 * Rate limit: 75ms between requests per Scryfall's guidelines.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScryfallCard {
  name: string
  type_line: string
  mana_cost: string
  cmc: number
  oracle_text: string
  color_identity: string[]
  legalities: Record<string, string>
  edhrec_rank: number | null
  id: string
  set: string
  collector_number: string
  image_uris?: {
    normal?: string
    art_crop?: string
    large?: string
  }
}

export interface CommanderValidation {
  valid: boolean
  name: string
  colorIdentity: string[]
  typeLine: string
  isLegendary: boolean
  isCommanderLegal: boolean
  reason?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.scryfall.com'
const USER_AGENT = 'TheOracle/0.1.0'

// Rate limiting
let lastRequestTime = 0
const MIN_DELAY_MS = 75

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed))
  }
  lastRequestTime = Date.now()

  return fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })
}

// ---------------------------------------------------------------------------
// Card Lookup
// ---------------------------------------------------------------------------

/**
 * Look up a card by exact name. Returns null if not found.
 */
export async function getCardByName(cardName: string): Promise<ScryfallCard | null> {
  const url = `${BASE_URL}/cards/named?exact=${encodeURIComponent(cardName)}`
  const response = await rateLimitedFetch(url)

  if (!response.ok) {
    if (response.status === 404) return null
    throw new Error(`Scryfall API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Validate whether a card is a legal Commander.
 * Checks: exists, Legendary Creature (or "can be your commander"), Commander-legal.
 */
export async function validateCommander(cardName: string): Promise<CommanderValidation> {
  const card = await getCardByName(cardName)

  if (!card) {
    return {
      valid: false,
      name: cardName,
      colorIdentity: [],
      typeLine: '',
      isLegendary: false,
      isCommanderLegal: false,
      reason: `Card "${cardName}" not found on Scryfall`,
    }
  }

  const typeLine = card.type_line || ''
  const isLegendary = typeLine.includes('Legendary')
  const isCreature = typeLine.includes('Creature')
  const hasCommanderText = (card.oracle_text || '').toLowerCase().includes('can be your commander')
  const isCommanderLegal = card.legalities?.commander === 'legal'

  const canBeCommander = (isLegendary && isCreature) || hasCommanderText

  if (!canBeCommander) {
    return {
      valid: false,
      name: card.name,
      colorIdentity: card.color_identity,
      typeLine,
      isLegendary,
      isCommanderLegal,
      reason: `${card.name} is not a Legendary Creature and doesn't have "can be your commander" text`,
    }
  }

  if (!isCommanderLegal) {
    return {
      valid: false,
      name: card.name,
      colorIdentity: card.color_identity,
      typeLine,
      isLegendary,
      isCommanderLegal,
      reason: `${card.name} is banned in Commander`,
    }
  }

  return {
    valid: true,
    name: card.name,
    colorIdentity: card.color_identity,
    typeLine,
    isLegendary,
    isCommanderLegal,
  }
}

// ---------------------------------------------------------------------------
// Card Search
// ---------------------------------------------------------------------------

/**
 * Search Scryfall with a query string. Returns up to `limit` results.
 * Query uses Scryfall syntax: https://scryfall.com/docs/syntax
 */
export async function searchCards(
  query: string,
  options?: { limit?: number }
): Promise<ScryfallCard[]> {
  const limit = options?.limit ?? 20
  const url = `${BASE_URL}/cards/search?q=${encodeURIComponent(query)}&order=edhrec`
  const response = await rateLimitedFetch(url)

  if (!response.ok) {
    if (response.status === 404) return [] // No results
    throw new Error(`Scryfall search error: ${response.status}`)
  }

  const data = await response.json()
  return (data.data || []).slice(0, limit)
}

/**
 * Search for legendary creatures in a specific colour identity.
 * Useful for finding commanders by colour.
 */
export async function searchCommanders(
  colorIdentity: string,
  options?: { limit?: number }
): Promise<ScryfallCard[]> {
  // Scryfall colour identity filter: id=U means exactly mono-blue
  const query = `t:legendary t:creature id=${colorIdentity} f:commander`
  return searchCards(query, options)
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a commander validation result as text for the AI tool.
 */
export function formatCommanderValidation(result: CommanderValidation): string {
  if (result.valid) {
    return `✓ ${result.name} — Valid Commander\n  Type: ${result.typeLine}\n  Colour Identity: ${result.colorIdentity.join(', ') || 'Colorless'}`
  }
  return `✗ ${result.name} — NOT a valid Commander\n  Reason: ${result.reason}`
}

/**
 * Format search results as text for the AI tool.
 */
export function formatSearchResults(cards: ScryfallCard[]): string {
  if (cards.length === 0) return 'No cards found.'

  return cards.map(card => {
    const rank = card.edhrec_rank ? ` (EDHREC rank: #${card.edhrec_rank})` : ''
    return `- ${card.name} | ${card.type_line} | ${card.mana_cost || 'No cost'}${rank}`
  }).join('\n')
}
