// Reference types for CC-06 (card facts + live deck health + bracket). Types only, no handlers.
// Contract: docs/oracle/contracts/connector-card-facts-and-deck-health.md
// Extends claude-connector-slice-a.types.ts. Every field here is ADDED; nothing existing is renamed or removed.

/** Commander legality as Claude sees it. 'unknown' = the card was not found in the card library. */
export type CardLegality = 'legal' | 'banned' | 'not_legal' | 'unknown'

/** A price is always an estimate. `usd: null` means "no known price", NEVER free. */
export interface CardPrice {
  usd: number | null
  /** Fixed text so Claude cannot present it as a shop price. */
  label: 'Estimate from Scryfall'
}

/** The facts block attached to every card Claude sees. */
export interface CardFacts {
  /** false = the card was not found in the card library; every other field is then null and Claude must say "facts unavailable". */
  available: boolean
  typeLine: string | null
  manaCost: string | null // ref_cards.mana_cost, for example "{2}{G}"
  manaValue: number | null // ref_cards.mana_value
  /** ref_cards.color_identity, as stored (letters such as "BG"; empty string = colourless). Never guessed. */
  colorIdentity: string | null
  /** Rules text, cut at 300 characters with an ellipsis (existing cutText rule). Only present when requested (get_deck) or always (search). */
  rulesText?: string | null
  legality: CardLegality
  price: CardPrice
}

/** Added to CollectionCard (search_collection) and DeckCardView (get_deck) and the ownership tool rows. */
export interface WithFacts {
  facts: CardFacts
}

/** get_deck_health result, replacing the saved-only shape. */
export type DeckHealthToolResult =
  | {
      ok: true
      deckId: number
      /** Always 'computed_now'. The old 'computed' / 'not_computed' values are gone. */
      status: 'computed_now'
      computedAt: string // ISO time of this check
      /** Same object the Deck health screen gets from GET /api/decks/[id]/health (DeckHealthResponse in src/lib/deck-health.ts). */
      health: unknown
      /** Always set from HC-01: says what the six rows are and that the EDHREC average is for reference only. */
      note?: string
    }
  | { ok: false; error: 'NOT_FOUND' | 'LOOKUP_FAILED' | 'HEALTH_FAILED'; message: string }

/** Bracket as reported by list_decks / get_deck. */
export interface BracketInfo {
  /** 1 to 5, or null when nobody has set one. (5 added 2026-11-19 with the Strategy window.) */
  value: number | null
  /** Where the number came from. */
  source: 'deck_strategy' | 'deck_row' | 'not_set'
  /** Present only when value is null. Plain words for Claude to repeat. */
  whyEmpty?: string
}
