// ---------------------------------------------------------------------------
// Shared debrief / brew chat types
// ---------------------------------------------------------------------------
// These types are used by the Oracle debrief flow and the brew-mode chat
// surface. They live in a single module so both features can share a stable
// ChatMessage shape without creating a circular dependency between brew and
// debrief code.
// ---------------------------------------------------------------------------

/** A chat message persisted in and rendered by brew / debrief sessions. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  cost?: number
  commanderSummary?: CommanderSummaryContext
}

/** Structured commander summary that can be embedded as a message card. */
export interface CommanderSummaryContext {
  name: string
  color_identity: string[]
  mana_cost?: string
  type_line: string
  tagline: string
  analysis: string
  collection_status: {
    owned: boolean
    quantity: number
    in_decks: string[]
    proxy_conflicts: string[]
  }
}

/** A single cut/add recommendation surfaced after a deck debrief. */
export interface Recommendation {
  cutCard: string
  addCard: string
  reason: string
  ownershipStatus: string
}
