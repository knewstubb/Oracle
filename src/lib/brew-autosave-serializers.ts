// ---------------------------------------------------------------------------
// Brew Session Autosave — Serialization/Deserialization Helpers
// ---------------------------------------------------------------------------
// Pure functions for converting session state to/from JSON strings for
// persistence in the brew_sessions table.
//
// Validates: Requirements 1.2, 1.3, 1.4, 1.5, 2.2, 2.3, 2.4, 3.2, 3.3, 3.4, 4.2
// ---------------------------------------------------------------------------

import type { ChatMessage } from '@/lib/debrief-types'
import type {
  DecisionLog,
  DeckState,
  DeckCard,
  CanvasCardPosition,
  ArchivedItem,
} from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of messages to persist */
const MAX_MESSAGES = 500

/** Maximum content length per message (characters) */
const MAX_CONTENT_LENGTH = 50_000

// ---------------------------------------------------------------------------
// Persisted Shapes
// ---------------------------------------------------------------------------

interface PersistedMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string // ISO 8601
  cost: number
}

interface PersistedSkeleton {
  cards: DeckCard[]
  suggestions: DeckCard[]
  canvasPositions: Record<string, CanvasCardPosition>
  explorationArchive: ArchivedItem[]
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Serialize messages for persistence.
 * - Caps at 500 messages (keeps the most recent 500)
 * - Trims content to 50k chars
 * - Outputs JSON with role, content, timestamp (ISO 8601), and cost fields
 */
export function serializeMessages(messages: ChatMessage[]): string {
  // Keep only the most recent MAX_MESSAGES
  const trimmed = messages.length > MAX_MESSAGES
    ? messages.slice(messages.length - MAX_MESSAGES)
    : messages

  const persisted: PersistedMessage[] = trimmed.map((msg) => ({
    role: msg.role === 'system' ? 'assistant' : msg.role,
    content: msg.content.length > MAX_CONTENT_LENGTH
      ? msg.content.slice(0, MAX_CONTENT_LENGTH)
      : msg.content,
    timestamp: new Date(msg.timestamp).toISOString(),
    cost: msg.cost ?? 0,
  }))

  return JSON.stringify(persisted)
}

/**
 * Deserialize messages from JSON string.
 * Returns ChatMessage[] or empty array on failure.
 */
export function deserializeMessages(json: string | null): ChatMessage[] {
  if (!json) return []

  try {
    const parsed = JSON.parse(json)

    if (!Array.isArray(parsed)) {
      console.warn('[brew-autosave] deserializeMessages: expected array, got', typeof parsed)
      return []
    }

    return parsed.map((msg: PersistedMessage, index: number) => ({
      id: `restored-${index}-${msg.timestamp}`,
      role: msg.role as ChatMessage['role'],
      content: msg.content ?? '',
      timestamp: new Date(msg.timestamp).getTime(),
      cost: msg.cost ?? 0,
    }))
  } catch (e) {
    console.warn('[brew-autosave] deserializeMessages: failed to parse JSON', e)
    return []
  }
}

// ---------------------------------------------------------------------------
// Decision Log
// ---------------------------------------------------------------------------

/**
 * Serialize the full DecisionLog structure as a JSON string.
 */
export function serializeDecisionLog(log: DecisionLog): string {
  return JSON.stringify(log)
}

/**
 * Deserialize decision log from JSON string.
 * Returns DecisionLog or default empty log on failure.
 */
export function deserializeDecisionLog(json: string | null): DecisionLog {
  const defaultLog: DecisionLog = {
    strategy: [],
    parameters: [],
    constraints: [],
  }

  if (!json) return defaultLog

  try {
    const parsed = JSON.parse(json)

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray(parsed.strategy) ||
      !Array.isArray(parsed.parameters) ||
      !Array.isArray(parsed.constraints)
    ) {
      console.warn('[brew-autosave] deserializeDecisionLog: invalid structure')
      return defaultLog
    }

    return {
      strategy: parsed.strategy,
      parameters: parsed.parameters,
      constraints: parsed.constraints,
    }
  } catch (e) {
    console.warn('[brew-autosave] deserializeDecisionLog: failed to parse JSON', e)
    return defaultLog
  }
}

// ---------------------------------------------------------------------------
// Deck State
// ---------------------------------------------------------------------------

/**
 * Serialize deck state for persistence.
 * Includes cards, suggestions, canvasPositions, explorationArchive.
 * Excludes isGenerating (transient field).
 */
export function serializeDeckState(deckState: DeckState): string {
  const skeleton: PersistedSkeleton = {
    cards: deckState.cards,
    suggestions: deckState.suggestions,
    canvasPositions: deckState.canvasPositions,
    explorationArchive: deckState.explorationArchive,
  }

  return JSON.stringify(skeleton)
}

/**
 * Deserialize deck state from skeleton_json.
 * Returns DeckState with isGenerating always false, or default empty DeckState on failure.
 */
export function deserializeDeckState(json: string | null): DeckState {
  const defaultState: DeckState = {
    cards: [],
    suggestions: [],
    isGenerating: false,
    canvasPositions: {},
    explorationArchive: [],
  }

  if (!json) return defaultState

  try {
    const parsed = JSON.parse(json)

    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('[brew-autosave] deserializeDeckState: invalid structure')
      return defaultState
    }

    return {
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      isGenerating: false, // Always false on hydration
      canvasPositions: typeof parsed.canvasPositions === 'object' && parsed.canvasPositions !== null
        ? parsed.canvasPositions
        : {},
      explorationArchive: Array.isArray(parsed.explorationArchive)
        ? parsed.explorationArchive
        : [],
    }
  } catch (e) {
    console.warn('[brew-autosave] deserializeDeckState: failed to parse JSON', e)
    return defaultState
  }
}
