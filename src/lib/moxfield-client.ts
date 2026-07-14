const MOXFIELD_API_BASE = 'https://api2.moxfield.com/v2'
const REQUEST_TIMEOUT_MS = 10_000
const USER_AGENT = 'The-Oracle/1.0'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MoxfieldCardData {
  name: string
  scryfall_id: string
  set: string
  type_line: string
  oracle_id?: string
  cmc: number
  color_identity: string[]
  mana_cost: string
}

export interface MoxfieldCard {
  card: MoxfieldCardData
  quantity: number
  boardType: string
  finish: string
  isFoil: boolean
  isAlter: boolean
  isProxy: boolean
}

export interface MoxfieldBoard {
  count: number
  cards: Record<string, MoxfieldCard>
}

export interface MoxfieldDeckFull {
  id: string
  name: string
  format: string
  publicId: string
  mainboard: MoxfieldBoard
  sideboard: MoxfieldBoard
  maybeboard: MoxfieldBoard
  commanders: MoxfieldBoard
  companions: MoxfieldBoard
  /** Maps card keys to arrays of user-assigned tags (Moxfield's category equivalent) */
  authorTags?: Record<string, string[]>
}

// ─── Client ──────────────────────────────────────────────────────────────────

// ─── User Decks Types ────────────────────────────────────────────────────────

export interface MoxfieldDeckSummary {
  publicId: string
  name: string
  format: string
  createdAtUtc: string
  lastUpdatedAtUtc: string
  mainboardCount: number
  isLegal: boolean
}

// ─── User Decks Client ───────────────────────────────────────────────────────

/**
 * Fetch a user's public deck list from Moxfield.
 * Returns basic deck info — use fetchMoxfieldDeck for full card lists.
 */
export async function fetchMoxfieldUserDecks(username: string): Promise<MoxfieldDeckSummary[]> {
  const url = `${MOXFIELD_API_BASE}/users/${encodeURIComponent(username)}/decks?pageNumber=1&pageSize=100`

  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('Request to Moxfield timed out')
    }
    throw new Error(
      `Failed to connect to Moxfield: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  if (res.status === 404) {
    throw new Error('User not found on Moxfield. Check the username and try again.')
  }

  if (res.status === 403) {
    throw new Error('This Moxfield profile is private. The user needs to make their decks public.')
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch decks from Moxfield (HTTP ${res.status})`)
  }

  const data = await res.json()
  // Moxfield returns { pageNumber, pageSize, totalPages, totalResults, data: [...] }
  return (data.data ?? []) as MoxfieldDeckSummary[]
}

// ─── Deck Client ─────────────────────────────────────────────────────────────

/**
 * Fetch a full deck from Moxfield's public API.
 * Throws descriptive errors on 404, non-200 responses, and timeouts.
 */
export async function fetchMoxfieldDeck(deckId: string): Promise<MoxfieldDeckFull> {
  const url = `${MOXFIELD_API_BASE}/decks/all/${deckId}`

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('Request to Moxfield timed out')
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request to Moxfield was aborted')
    }
    throw new Error(
      `Failed to connect to Moxfield: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  if (res.status === 404) {
    throw new Error('Deck not found on Moxfield')
  }

  if (!res.ok) {
    throw new Error(
      `Failed to fetch deck from Moxfield (HTTP ${res.status})`
    )
  }

  const data: MoxfieldDeckFull = await res.json()
  return data
}
