// ---------------------------------------------------------------------------
// Brew Mode — Type Definitions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// StrategyBrief — extracted from investigation conversation
// ---------------------------------------------------------------------------

export interface StrategyBrief {
  commanderName: string
  colourIdentity: string[]
  primaryWinCondition: string
  secondaryWinCondition: string
  targetBracket: 1 | 2 | 3 | 4
  knownIncludes: string[]
  playstyleDescription: string
  budgetPreference: 'collection' | 'budget' | 'unrestricted'
  budgetCeiling?: number
}

// ---------------------------------------------------------------------------
// DeckSkeleton — produced by Heavy Model
// ---------------------------------------------------------------------------

export interface DeckSkeleton {
  commanderName: string
  colourIdentity: string[]
  totalCards: number
  categories: CategoryGroup[]
}

export interface CategoryGroup {
  name: string
  cards: CardEntry[]
}

export interface CardEntry {
  cardName: string
  ownershipStatus: 'owned' | 'proxy_candidate' | 'not_owned'
  price: number | null
  proxyConflict?: { deckName: string; deckId: number }
  overBudget: boolean
  accepted: boolean
}

// ---------------------------------------------------------------------------
// RefinementAction — user-initiated modification
// ---------------------------------------------------------------------------

export type RefinementAction =
  | { type: 'swap'; category: string; oldCard: string; newCard: string }
  | { type: 'alternatives'; category: string; targetCard: string }
  | { type: 'add'; category: string; cardName: string }
  | { type: 'remove'; category: string; cardName: string }
  | { type: 'accept'; category: string }

// ---------------------------------------------------------------------------
// SaveOptions — save configuration
// ---------------------------------------------------------------------------

export interface SaveOptions {
  deckName: string
  pushToArchidekt: boolean
}

export interface SaveResult {
  success: boolean
  deckId?: number
  archidektUrl?: string
  error?: string
}

// ---------------------------------------------------------------------------
// BrewSessionRow — database row shape
// ---------------------------------------------------------------------------

export interface BrewSessionRow {
  id: number
  deck_id: number | null
  status: string
  path_type: 'commander' | 'concept' | null
  commander_name: string | null
  colour_identity: string | null
  concept_description: string | null
  brief_json: string | null
  skeleton_json: string | null
  refinement_history_json: string
  conversation_json: string
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// BrewPhase — client-side state including UI-only states
// ---------------------------------------------------------------------------

export type BrewPhase = 'idle' | 'selecting' | 'investigating' | 'confirming' | 'generating' | 'refining' | 'saving' | 'complete'

// ---------------------------------------------------------------------------
// BrewSessionRow — database row shape
// ---------------------------------------------------------------------------

export interface BrewSessionRow {
  id: number
  deck_id: number | null
  status: string
  path_type: 'commander' | 'concept' | null
  commander_name: string | null
  colour_identity: string | null
  concept_description: string | null
  brief_json: string | null
  skeleton_json: string | null
  refinement_history_json: string
  conversation_json: string
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Re-export ChatMessage from debrief types for shared use
// ---------------------------------------------------------------------------

export type { ChatMessage } from '@/lib/debrief-types'
