const BASE_URL = 'https://archidekt.com/api'
const DEFAULT_USER_ID = 614000 // Legacy default for backward compatibility

// ---------------------------------------------------------------------------
// User/URL Parsing
// ---------------------------------------------------------------------------

/**
 * Parse an Archidekt collection URL or username into a normalized identifier.
 * Supports:
 * - archidekt.com/collection/v2/{username}/
 * - archidekt.com/collection/v2/{userId}/
 * - Plain username (e.g., "knewstubb" or "knewstubb@gmail.com")
 * - User ID (numeric)
 *
 * Returns { type: 'username' | 'userId', value: string }
 */
export function parseArchidektCollectionInput(input: string): { type: 'username' | 'userId'; value: string } | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // URL pattern: archidekt.com/collection/v2/{identifier}/
  const urlMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?archidekt\.com\/collection\/v2\/([^\/\?]+)/i)
  if (urlMatch) {
    const identifier = urlMatch[1]
    // Check if it's a numeric user ID or a username
    if (/^\d+$/.test(identifier)) {
      return { type: 'userId', value: identifier }
    }
    return { type: 'username', value: identifier }
  }

  // Collection page URL: archidekt.com/collection/{username} or /u/{username}
  const collectionPageMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?archidekt\.com\/(?:collection|u)\/([^\/\?]+)/i)
  if (collectionPageMatch) {
    return { type: 'username', value: collectionPageMatch[1] }
  }

  // Plain username or email
  if (trimmed.length > 0 && !trimmed.includes('/')) {
    // If it's just a number, treat as userId
    if (/^\d+$/.test(trimmed)) {
      return { type: 'userId', value: trimmed }
    }
    return { type: 'username', value: trimmed }
  }

  return null
}

/**
 * Resolve a username or user ID to a numeric user ID.
 * Uses the decks API which returns owner.id for each deck.
 * Returns the first matching user ID found.
 */
export async function resolveArchidektUserId(identifier: { type: 'username' | 'userId'; value: string }): Promise<number> {
  // If already a numeric userId, validate it exists by fetching one deck
  if (identifier.type === 'userId') {
    const numericId = parseInt(identifier.value, 10)
    // Try fetching a deck to validate the user exists
    const testUrl = `${BASE_URL}/decks/v3/?ownerId=${numericId}&pageSize=1`
    const res = await fetchWithRetry(testUrl)
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`No Archidekt user found with ID ${numericId}`)
      }
      throw new Error(`Failed to validate user: ${res.status}`)
    }
    const data = await res.json()
    if (data.results && data.results.length > 0) {
      return data.results[0].owner.id
    }
    throw new Error(`No user found with ID ${numericId}`)
  }

  // For username, fetch decks and extract the owner ID
  // The API requires numeric ownerId, so we need to search through decks
  // by fetching a page and checking the owner
  const searchUrl = `${BASE_URL}/decks/v3/?ownerId=${encodeURIComponent(identifier.value)}&pageSize=1`
  const res = await fetchWithRetry(searchUrl)
  
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`No Archidekt user found with username "${identifier.value}"`)
    }
    throw new Error(`Failed to resolve username: ${res.status}`)
  }
  
  const data = await res.json()
  if (data.results && data.results.length > 0) {
    return data.results[0].owner.id
  }
  
  throw new Error(`No public decks found for user "${identifier.value}". Make sure their collection and decks are public.`)
}

export interface ArchidektDeckSummary {
  id: number
  name: string
  private: boolean
  featured: string
  customFeatured: string
  viewCount: number
  /** Card count in the deck (from v3 `size` field) */
  size?: number
  /** Folder the deck lives in, if any (from v3 `parentFolderName`) */
  parentFolderName?: string | null
}

export interface ArchidektEdition {
  editioncode: string
  editionname: string
  editiondate: string
  editiontype: string
}

export interface ArchidektOracleCard {
  id: number
  name: string
  cmc: number
  colorIdentity: string[]
  colors: string[]
  edhrecRank: number | null
  layout: string
  uid: string
  typeLine?: string
  types?: string[]
  subTypes?: string[]
  manaCost?: string
  oracleText?: string
}

export interface ArchidektPrices {
  ck: number        // CardKingdom normal
  ckfoil: number    // CardKingdom foil
  tcg: number       // TCGplayer
  tcgfoil: number   // TCGplayer foil
  scg: number       // StarCityGames
  scgfoil: number   // StarCityGames foil
  cm: number        // Cardmarket (EU)
  cmfoil: number    // Cardmarket foil
  mtgo: number      // MTGO
  mtgofoil: number  // MTGO foil
  mp: number        // MTGPrice/market price
  mpfoil: number
  tcgLand: number   // TCGplayer listing count
  tcgLandFoil: number
  cardTrader: number
  cardTraderFoil: number
}

export interface ArchidektCard {
  id: number
  uid: string
  artist: string
  collectorNumber: string
  edition: ArchidektEdition
  oracleCard: ArchidektOracleCard
  scryfallImageHash: string
  prices?: ArchidektPrices
  ckNormalId?: number
  ckFoilId?: number
  tcgProductId?: number
}

export interface ArchidektDeckCard {
  id: number
  categories: string[]
  label: string
  modifier: string
  quantity: number
  card: ArchidektCard
}

export interface ArchidektCategory {
  id: number
  name: string
  isPremier: boolean
  includedInDeck: boolean
  includedInPrice: boolean
}

export interface ArchidektOwner {
  id: number
  username: string
  avatar: string
}

export interface ArchidektDeckFull {
  id: number
  name: string
  createdAt: string
  updatedAt: string
  deckFormat: number
  featured: string
  customFeatured: string
  private: boolean
  owner: ArchidektOwner
  categories: ArchidektCategory[]
  deckTags: string[]
  cards: ArchidektDeckCard[]
}

// Parse the label field: "Proxy,#e158ff" → { name: "Proxy", color: "#e158ff" }
export function parseLabel(label: string): { name: string; color: string } | null {
  if (!label || label.startsWith(',')) return null
  const commaIdx = label.lastIndexOf(',')
  if (commaIdx === -1) return null
  const name = label.slice(0, commaIdx)
  const color = label.slice(commaIdx + 1)
  return { name, color }
}

export function isProxyLabel(label: string): boolean {
  const parsed = parseLabel(label)
  return parsed?.name === 'Proxy'
}

export function getCommanderCard(deck: ArchidektDeckFull): ArchidektDeckCard | null {
  return deck.cards.find(c => c.categories.includes('Commander')) ?? null
}

export interface ArchidektCollectionEntry {
  id: number
  card: ArchidektCard
  quantity: number
  foil: boolean
  modifier: string
}

/**
 * Fetch with exponential backoff retry for rate limits.
 * Retries up to 3 times with 5s, 15s, 45s delays.
 */
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  const fetchUrl = url.replace(/^http:\/\//, 'https://')
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(fetchUrl)
    
    if (res.status === 429) {
      if (attempt === maxRetries) {
        throw new Error('Rate limited by Archidekt. Please wait 1-2 minutes and try again.')
      }
      // Exponential backoff: 5s, 15s, 45s
      const delay = 5000 * Math.pow(3, attempt)
      console.log(`[archidekt] Rate limited, waiting ${delay/1000}s before retry ${attempt + 1}/${maxRetries}`)
      await new Promise(resolve => setTimeout(resolve, delay))
      continue
    }
    
    if (!res.ok) {
      throw new Error(`Collection fetch failed: ${res.status}`)
    }
    
    return res
  }
  
  throw lastError ?? new Error('Fetch failed after retries')
}

export async function fetchCollection(userId?: number): Promise<ArchidektCollectionEntry[]> {
  const entries: ArchidektCollectionEntry[] = []
  const effectiveUserId = userId ?? DEFAULT_USER_ID
  // Archidekt caps collection page_size at 25 regardless of what we request
  let url: string | null = `${BASE_URL}/collection/${effectiveUserId}/`
  let pageCount = 0
  while (url) {
    // Rate limit: wait 500ms between pages to avoid 429 from Archidekt
    if (pageCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    const res = await fetchWithRetry(url)
    const data: { results: ArchidektCollectionEntry[]; next: string | null } = await res.json()
    entries.push(...data.results)
    url = data.next
    pageCount++
  }
  return entries
}

export interface CollectionFetchProgress {
  /** Number of cards fetched so far */
  fetched: number
  /** Total cards in the collection (from API count field, null if unknown) */
  total: number | null
}

/**
 * Same as fetchCollection but with a progress callback for streaming UI updates.
 * Reports fetched card count vs total rather than opaque page numbers.
 */
export async function fetchCollectionWithProgress(
  onProgress: (progress: CollectionFetchProgress) => Promise<void>,
  userId?: number
): Promise<ArchidektCollectionEntry[]> {
  const entries: ArchidektCollectionEntry[] = []
  const effectiveUserId = userId ?? DEFAULT_USER_ID
  // Archidekt caps collection page_size at 25 regardless of what we request
  let url: string | null = `${BASE_URL}/collection/${effectiveUserId}/`
  let pageCount = 0
  let totalCount: number | null = null
  while (url) {
    if (pageCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    await onProgress({ fetched: entries.length, total: totalCount })
    
    const res = await fetchWithRetry(url)
    const data: { count?: number; results: ArchidektCollectionEntry[]; next: string | null } = await res.json()

    // DRF paginated responses include a count field on every page
    if (data.count != null && totalCount === null) {
      totalCount = data.count
    }

    entries.push(...data.results)
    url = data.next
    pageCount++
  }
  // Final progress update so the UI shows the complete count
  await onProgress({ fetched: entries.length, total: totalCount })
  return entries
}

/**
 * Shape of a deck entry in the v3 deck-search response.
 */
interface ArchidektV3Deck {
  id: number
  name: string
  size?: number
  private?: boolean
  featured?: string
  customFeatured?: string
  viewCount?: number
  parentFolderName?: string | null
}

/**
 * Fetch all of the user's decks, including decks nested inside folders.
 *
 * Uses the v3 deck-search endpoint filtered by `ownerId`. The older
 * `/users/{id}/decks/` endpoint only returned top-level decks (folder-nested
 * decks were silently omitted), which caused decks in folders like
 * "Experiments" or "Precon Upgrades" to go missing from the import list.
 *
 * The v3 endpoint is paginated (`count` + `next`), so we walk all pages.
 */
export async function fetchUserDecks(userId?: number): Promise<ArchidektDeckSummary[]> {
  const decks: ArchidektDeckSummary[] = []
  const effectiveUserId = userId ?? DEFAULT_USER_ID
  let url: string | null =
    `${BASE_URL}/decks/v3/?ownerId=${effectiveUserId}&orderBy=-updatedAt&pageSize=100`

  while (url) {
    const res = await fetchWithRetry(url)
    const data: { count?: number; next: string | null; results: ArchidektV3Deck[] } =
      await res.json()

    for (const d of data.results ?? []) {
      decks.push({
        id: d.id,
        name: d.name,
        private: d.private ?? false,
        featured: d.featured ?? '',
        customFeatured: d.customFeatured ?? '',
        viewCount: d.viewCount ?? 0,
        size: d.size,
        parentFolderName: d.parentFolderName ?? null,
      })
    }

    url = data.next
  }

  return decks
}

export async function fetchDeck(deckId: number): Promise<ArchidektDeckFull> {
  const res = await fetch(`${BASE_URL}/decks/${deckId}/`)
  if (!res.ok) throw new Error(`Archidekt API error: ${res.status} ${res.statusText}`)
  return res.json()
}

/**
 * Look up CardKingdom prices for a list of card names by searching across all user decks.
 * Returns a map of card_name → CK price (USD).
 * Falls back to the Archidekt card search API for cards not found in decks.
 */
export async function fetchCardKingdomPrices(cardNames: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  const remaining = new Set(cardNames)

  // Search Archidekt's card API for each card to get CK prices
  for (const cardName of remaining) {
    try {
      const encoded = encodeURIComponent(cardName)
      const res = await fetch(`${BASE_URL}/cards/?name_exact=${encoded}&ordering=-released_at&page_size=1`)
      if (res.ok) {
        const data = await res.json()
        if (data.results && data.results.length > 0) {
          const card = data.results[0]
          if (card.prices?.ck && card.prices.ck > 0) {
            prices.set(cardName, card.prices.ck)
          }
        }
      }
    } catch {
      // Skip failures — caller can fall back to Scryfall
    }
  }

  return prices
}
