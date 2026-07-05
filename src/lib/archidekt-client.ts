const BASE_URL = 'https://archidekt.com/api'
const USER_ID = 614000

export interface ArchidektDeckSummary {
  id: number
  name: string
  private: boolean
  featured: string
  customFeatured: string
  viewCount: number
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

export async function fetchCollection(): Promise<ArchidektCollectionEntry[]> {
  const entries: ArchidektCollectionEntry[] = []
  let url: string | null = `${BASE_URL}/collection/${USER_ID}/`
  while (url) {
    const res: Response = await fetch(url)
    if (!res.ok) throw new Error(`Collection fetch failed: ${res.status}`)
    const data: { results: ArchidektCollectionEntry[]; next: string | null } = await res.json()
    entries.push(...data.results)
    url = data.next
  }
  return entries
}

export async function fetchUserDecks(): Promise<ArchidektDeckSummary[]> {
  const res = await fetch(`${BASE_URL}/users/${USER_ID}/decks/`)
  if (!res.ok) throw new Error(`Archidekt API error: ${res.status} ${res.statusText}`)
  const data = await res.json()
  return data.decks ?? []
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
