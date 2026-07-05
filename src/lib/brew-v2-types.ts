// ---------------------------------------------------------------------------
// Brew Mode V2 — Type Definitions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Deck Status
// ---------------------------------------------------------------------------

export type DeckStatus = 'active' | 'draft' | 'concept'

// ---------------------------------------------------------------------------
// Phase State
// ---------------------------------------------------------------------------

export type BrewPhaseV2 = 'exploring' | 'building'

export interface BrewSessionState {
  phase: BrewPhaseV2
  sessionId: number | null
  commander: CommittedCommander | null
  decisionLog: DecisionLog
  deckState: DeckState | null
  assessmentCache: Map<string, CardAssessment>
}

// ---------------------------------------------------------------------------
// Decision Log
// ---------------------------------------------------------------------------

export interface DecisionLog {
  strategy: DecisionEntry[]
  parameters: DecisionEntry[]
  constraints: DecisionEntry[]
}

export interface DecisionEntry {
  id: string
  key: string          // e.g. "ARCHETYPE", "COLOUR IDENTITY"
  value: string        // e.g. "Aristocrats", "Orzhov (WB)"
  sourceQuote: string  // Exact quote from conversation
  timestamp: number
}

// ---------------------------------------------------------------------------
// Commander Options Card
// ---------------------------------------------------------------------------

export interface CommanderOption {
  name: string
  artUrl: string
  colourIdentity: string[]
  description: string
  owned: boolean
  scryfallId: string
}

// ---------------------------------------------------------------------------
// Committed Commander
// ---------------------------------------------------------------------------

export interface CommittedCommander {
  name: string
  artUrl: string
  typeLine: string
  colourIdentity: string[]
  archetype: string | null  // From decision log
}

// ---------------------------------------------------------------------------
// Deck State
// ---------------------------------------------------------------------------

export interface DeckState {
  cards: DeckCard[]
  suggestions: DeckCard[]
  isGenerating: boolean
  /** Spatial positions for canvas cards (persisted in skeleton_state) */
  canvasPositions: Record<string, CanvasCardPosition>
  /** Archived Phase 1 items after commander commit (persisted in skeleton_state) */
  explorationArchive: ArchivedItem[]
}

export interface DeckCard {
  card_name: string
  primary_category: string
  additional_categories: string[]
  ownership_status: 'original' | 'proxy' | 'not_owned' | 'generic'
  cmc: number
  type_line: string
  oracle_text: string
  edhrec_inclusion?: number
  price_ck?: number
  /** When true, this slot is a generic land — outside the ownership system */
  is_generic_land?: boolean
  /** References card_definitions.id for generic land slots */
  card_definition_id?: number | null
}

// ---------------------------------------------------------------------------
// Card Assessment
// ---------------------------------------------------------------------------

export interface CardAssessment {
  pros: string[]        // 2-3 items
  cons: string[]        // 1-2 items
  fit_score: number     // 1-10
  fit_note: string      // 2-3 sentences, deck-specific
}

// ---------------------------------------------------------------------------
// Category Health
// ---------------------------------------------------------------------------

export interface CategoryHealth {
  name: string
  count: number
  target: number | null
  status: 'healthy' | 'low' | 'high' | 'unmonitored'
}

// ---------------------------------------------------------------------------
// Canvas Card Positioning
// ---------------------------------------------------------------------------

/** Position and metadata for a card on the canvas */
export interface CanvasCardPosition {
  /** Card identifier — card_name for DeckCards, id for candidates/decisions */
  id: string
  /** Horizontal position in canvas-space pixels */
  x: number
  /** Vertical position in canvas-space pixels */
  y: number
  /** Card type determines rendering strategy */
  type: 'candidate' | 'decision' | 'deck'
  /** Timestamp of last position update (for conflict resolution) */
  updatedAt: number
  /** Category at position-creation time (for detecting category changes during piled mode) */
  category?: string
}

// ---------------------------------------------------------------------------
// Exploration Archive
// ---------------------------------------------------------------------------

/** An archived Phase 1 item stored after commander commit */
export interface ArchivedItem {
  type: 'candidate' | 'decision'
  data: CommanderOption | DecisionEntry
}

// ---------------------------------------------------------------------------
// Canvas State (Component-Level)
// ---------------------------------------------------------------------------

/** Local state for the BrewCanvas component */
export interface CanvasState {
  /** Current zoom level: 40–150, step 10 */
  zoomLevel: number
  /** Pan offset in viewport pixels */
  panOffset: { x: number; y: number }
  /** Active layout mode */
  layoutMode: 'free-form' | 'piled' | 'curve'
  /** Active card density view */
  viewDensity: 'card' | 'name'
  /** Whether the user manually selected a view (prevents auto-switch) */
  viewOverride: boolean
  /** Currently dragged card id (null if idle) */
  draggingId: string | null
  /** Exploration archive expanded state */
  archiveExpanded: boolean
}
