// ---------------------------------------------------------------------------
// Debrief Mode — Type Definitions
// ---------------------------------------------------------------------------

// Session status (server-side state machine)
export type SessionStatus = 'investigating' | 'analysing' | 'recommending' | 'complete' | 'abandoned'

// Debrief phase (client-side state including UI-only states)
export type DebriefPhase = 'idle' | 'investigating' | 'confirming' | 'analysing' | 'recommending' | 'complete'

// Action types
export type ActionType = 'applied' | 'skipped' | 'disagreed' | 'error'

// ---------------------------------------------------------------------------
// DebriefBrief — extracted from investigation conversation
// ---------------------------------------------------------------------------

export interface DebriefBrief {
  gameOutcome: 'win' | 'loss' | 'draw'
  problemCards: string[]
  effectiveCards: string[]
  opponentArchetypes: string[]
  lossPattern: string
  userNotes: string
}

// ---------------------------------------------------------------------------
// Recommendation — produced by heavy model
// ---------------------------------------------------------------------------

export interface Recommendation {
  cutCard: string
  addCard: string
  reason: string
  ownershipStatus: 'original' | 'proxy' | 'not_owned'
}

// ---------------------------------------------------------------------------
// DebriefAction — persisted action record
// ---------------------------------------------------------------------------

export interface DebriefAction {
  id: number
  sessionId: number
  actionType: ActionType
  cutCard: string
  addCard: string
  reason: string
  notionLogged: boolean
  createdAt: string
}

// ---------------------------------------------------------------------------
// DebriefSummary — generated on session completion
// ---------------------------------------------------------------------------

export interface DebriefSummary {
  sessionId: number
  deckId: number
  appliedChanges: Array<{ cutCard: string; addCard: string; reason: string }>
  skippedRecommendations: Array<{ cutCard: string; addCard: string }>
  disagreedRecommendations: Array<{ cutCard: string; addCard: string }>
  totalApplied: number
  totalSkipped: number
  totalDisagreed: number
  deckDetailUrl: string
}

// ---------------------------------------------------------------------------
// DeckCardWithOwnership — deck card row with ownership data
// ---------------------------------------------------------------------------

export interface DeckCardWithOwnership {
  card_name: string
  quantity: number
  categories: string | null
  is_commander: boolean
  ownership_status: 'original' | 'proxy' | null
}

// ---------------------------------------------------------------------------
// ChatMessage — message type for the OracleChat component
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  /** Structured data rendered in right panel when this message is active */
  contextContent?: unknown
  /** Estimated cost in USD for this message exchange (set on assistant messages) */
  cost?: number
}

// ---------------------------------------------------------------------------
// DebriefSessionRow — session row shape from the database
// ---------------------------------------------------------------------------

export interface DebriefSessionRow {
  id: number
  deck_id: number
  status: SessionStatus
  brief_json: string | null
  recommendations_json: string | null
  current_rec_index: number
  created_at: string
  completed_at: string | null
}
