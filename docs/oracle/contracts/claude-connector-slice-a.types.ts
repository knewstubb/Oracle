/**
 * Reference types for the Claude connector, slice A (read-only).
 * Contract: docs/oracle/contracts/claude-connector-slice-a.md. Reference only: no handlers here.
 * Identifier rule (D-003): `scryfall_id` = one printing; `oracle_id` = the card across printings. Never swap them.
 */

export type ConnectorErrorCode =
  | 'UNAUTHENTICATED' // HTTP 401: no/invalid/expired token
  | 'CONNECTION_REVOKED' // HTTP 401: token valid, connection switched off or missing
  | 'FORBIDDEN_ORIGIN' // HTTP 403
  | 'NOT_FOUND' // tool error: deck not found or not yours (same answer for both)
  | 'INVALID_INPUT' // tool error: arguments failed validation
  | 'LOOKUP_FAILED' // tool error: database/upstream failure. NEVER reported as "none"/"empty" (D-030)
  | 'TOO_LARGE'; // tool error: result could not be shortened under the cap

export interface ConnectorErrorBody {
  ok: false
  error: { code: ConnectorErrorCode; message: string; retryable: boolean }
}

/** Every successful tool result carries paging info so "no more" is never confused with "cut off". */
export interface Paged<T> {
  ok: true
  items: T[]
  total: number // total matching rows (exact)
  returned: number
  offset: number
  truncated: boolean // true when more rows exist beyond this page OR the byte cap shortened it
  note?: string // plain words, e.g. "Showing 25 of 212. Ask for the next page with offset 25."
}

export interface VerifiedCaller {
  userId: string // `sub` of the verified JWT. The ONLY source of a user id.
  clientId: string // `client_id` claim
  connectionId: string // connector_connections.id of the active row
}

export interface CopyView {
  copyId: number // user_copies.id
  printingId: string | null // scryfall_id of the printing (NOT oracle_id)
  finish: string | null // normal | foil | etched; its own attribute, not part of printingId
  isProxy: boolean
  location: { kind: 'deck'; deckId: number; deckName: string } | { kind: 'storage'; name: string | null } | { kind: 'unknown' }
  missing: boolean
}

export interface CollectionSummary {
  ok: true
  distinctCards: number
  totalCopies: number
  proxyCopies: number
  originalCopies: number
  copiesInDecks: number
  copiesInStorage: number
  missingCopies: number
}

export interface CollectionCard {
  oracleId: string // oracle_id
  name: string
  typeLine: string | null
  copyCount: number
  copies: CopyView[] // capped at 20 per card; copyCount is exact
  copiesTruncated: boolean
}

export interface DeckSummary {
  deckId: number
  name: string
  commanderName: string | null
  format: string | null
  status: string | null
  bracket: string | null
  cardCount: number
  sleevedCount: number // deck_cards rows with a physical copy attached
  isActive: boolean
  /** Added by the ownership extension (list_decks only). Main-deck cards by quantity; maybeboard and generic slots are not counted. */
  ownershipCounts?: { original: number; proxy: number; notOwned: number }
}

export interface DeckCardView {
  slotId: number // deck_cards.id; lets a write tool target this exact slot (slice B, additive)
  name: string
  quantity: number
  categories: string[] // contains "Maybeboard" for maybeboard cards
  isCommander: boolean
  ownership: 'original' | 'proxy' | 'not_owned' | 'generic' | null
  sleeved: boolean // a specific copy is attached (D-025)
  printingId: string | null // scryfall_id
  finish: string | null
}

export interface DeckDetail {
  ok: true
  deck: DeckSummary
  mainboard: Paged<DeckCardView>
  maybeboardCount: number
}

export interface DeckHealthView {
  ok: true
  deckId: number
  status: 'computed' | 'not_computed'
  overallStatus: string | null
  computedAt: string | null // ISO
  stale: boolean // computedAt older than 7 days, or deck changed after it (when knowable)
  result: unknown | null // parsed deck_health.result_json, trimmed to the byte cap
}

/**
 * Ownership extension: list_deck_cards_by_ownership. Prices are Scryfall estimates in USD (D-035, D-040), never zero when unknown.
 * Two figures, always labelled: "current value" (what the collection counts today: proxies and unowned cards are $0)
 * and "value if bought" (the market estimate of each proxy or unowned card, times quantity). Collection value elsewhere is unchanged.
 */
export type OwnershipFilter = 'proxy' | 'not_owned' | 'both'

export interface OwnershipPriceSource {
  source: string // plain words: where the price comes from
  currency: 'USD'
  basis: string // how a price was chosen; says it is an estimate
  unknownMeans: string // what a null price means: no price known, NOT free
  currentValueMeans: string // why current value is $0 for these cards
  stale: boolean // price data older than 48 hours (or never refreshed)
}

export interface OwnershipCardView {
  deckId: number
  deckName: string
  slotId: number // deck_cards.id
  name: string
  quantity: number
  state: 'proxy' | 'not_owned'
  unitPriceUsd: number | null // null = no known price (never 0)
  currentValueUsd: number // always 0: proxies and unowned cards add nothing to collection value
  valueIfBoughtUsd: number | null // unitPriceUsd * quantity; null when the price is unknown
}

export interface OwnershipDeckTotals {
  deckId: number
  deckName: string
  proxy: number // cards by quantity
  notOwned: number
  matching: number // cards that match the filter, by quantity
  currentValueUsd: number // always 0 for matching cards
  valueIfBoughtUsd: number // sum of known prices for matching cards
  unpricedCards: number // matching cards with no known price (not included in valueIfBoughtUsd)
}

export interface OwnershipByDeckResult {
  ok: true
  filter: OwnershipFilter
  priceSource: OwnershipPriceSource
  totals: { proxy: number; notOwned: number; matching: number; currentValueUsd: number; valueIfBoughtUsd: number; unpricedCards: number }
  decks: OwnershipDeckTotals[] // decks with at least one matching card, most matching first (then name). Always complete, never paged.
  items: OwnershipCardView[] // same deck order as `decks`, then card name; this is the paged part
  total: number // matching card rows (exact)
  returned: number
  offset: number
  truncated: boolean
  note?: string
}
