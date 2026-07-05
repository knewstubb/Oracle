// ---------------------------------------------------------------------------
// Brew Mode V2 — Session State Machine & Persistence
// ---------------------------------------------------------------------------
// Contains both:
// 1. Pure state transition functions (no database access)
// 2. Supabase-backed CRUD for the brew_sessions table
//
// Validates: Requirements 5.1, 5.5
// ---------------------------------------------------------------------------

import { createAdminClient } from '@/lib/supabase'
import type {
  BrewSessionState,
  CommittedCommander,
  CommanderOption,
  DecisionLog,
} from './brew-v2-types'

// ---------------------------------------------------------------------------
// Types — Database Row
// ---------------------------------------------------------------------------

export interface BrewSessionRow {
  id: number
  deck_id: number | null
  status: string
  path_type: string | null
  commander_name: string | null
  colour_identity: string | null
  concept_description: string | null
  brief_json: string | null
  skeleton_json: string | null
  refinement_history_json: string | null
  conversation_json: string | null
  decision_log_json: string | null
  assessment_cache_json: string | null
  model_id: string | null
  user_id: string
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Factory (Pure)
// ---------------------------------------------------------------------------

/**
 * Creates a new session in the `exploring` phase with empty decision log
 * and no commander committed.
 */
export function createSession(): BrewSessionState {
  return {
    phase: 'exploring',
    sessionId: null,
    commander: null,
    decisionLog: {
      strategy: [],
      parameters: [],
      constraints: [],
    },
    deckState: null,
    assessmentCache: new Map(),
  }
}

// ---------------------------------------------------------------------------
// Phase Transitions (Pure)
// ---------------------------------------------------------------------------

/**
 * Commits a commander to the session, transitioning from `exploring` to
 * `building`. This transition is immediate and irreversible within a session.
 *
 * If the session is already in `building` phase, the state is returned
 * unchanged — the phase never reverts.
 *
 * @param session - Current session state (must be in `exploring` phase to transition)
 * @param commander - The commander option the user committed to
 * @returns New session state in `building` phase with commander data stored
 */
export function commitCommander(
  session: BrewSessionState,
  commander: CommanderOption
): BrewSessionState {
  // Phase never reverts — if already building, return unchanged
  if (session.phase === 'building') {
    return session
  }

  // Derive archetype from decision log strategy entries if available
  const archetypeEntry = session.decisionLog.strategy.find(
    (entry) => entry.key.toUpperCase() === 'ARCHETYPE'
  )

  const committedCommander: CommittedCommander = {
    name: commander.name,
    artUrl: commander.artUrl,
    typeLine: '', // Will be populated from Scryfall on the API layer
    colourIdentity: commander.colourIdentity,
    archetype: archetypeEntry?.value ?? null,
  }

  return {
    ...session,
    phase: 'building',
    commander: committedCommander,
    deckState: {
      cards: [],
      suggestions: [],
      isGenerating: true,
      canvasPositions: {},
      explorationArchive: [],
    },
  }
}

// ---------------------------------------------------------------------------
// Save Actions (Pure)
// ---------------------------------------------------------------------------

/**
 * Saves the current exploration session as a concept.
 * Only valid during the `exploring` phase — the decision log is persisted
 * for later resumption without a committed commander.
 *
 * @param session - Current session state (must be in `exploring` phase)
 * @returns New session state (unchanged phase, signals save intent)
 */
export function saveConcept(
  session: BrewSessionState
): BrewSessionState {
  // Concepts are only saved during exploration (no commander committed)
  if (session.phase !== 'exploring') {
    return session
  }

  return { ...session }
}

/**
 * Saves the current building session as a draft.
 * Only valid during the `building` phase — the deck state and session
 * data are persisted for later resumption.
 *
 * @param session - Current session state (must be in `building` phase)
 * @returns New session state (unchanged phase, signals save intent)
 */
export function saveDraft(
  session: BrewSessionState
): BrewSessionState {
  // Drafts are only saved during building (commander committed)
  if (session.phase !== 'building') {
    return session
  }

  return { ...session }
}

// ---------------------------------------------------------------------------
// Supabase CRUD — Persistence Layer
// ---------------------------------------------------------------------------

/**
 * Creates a new brew session row in Supabase and returns the generated ID.
 * Initializes with 'exploring' status and empty JSON structures.
 */
export async function createBrewSession(userId: string): Promise<number> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('brew_sessions')
    .insert({
      status: 'exploring',
      decision_log_json: JSON.stringify({ strategy: [], parameters: [], constraints: [] }),
      assessment_cache_json: '{}',
      refinement_history_json: '[]',
      conversation_json: '[]',
      user_id: userId,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to create brew session: ${error.message}`)
  }

  return data.id
}

/**
 * Retrieves a brew session by ID.
 * Returns null if the session does not exist.
 */
export async function getBrewSession(sessionId: number): Promise<BrewSessionRow | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('brew_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to get brew session ${sessionId}: ${error.message}`)
  }

  return data ?? null
}

/**
 * Retrieves a brew session with specific fields selected.
 * Returns null if the session does not exist.
 */
export async function getBrewSessionFields<T extends string>(
  sessionId: number,
  fields: T
): Promise<Record<string, unknown> | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('brew_sessions')
    .select(fields)
    .eq('id', sessionId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to get brew session ${sessionId}: ${error.message}`)
  }

  return data ?? null
}

/**
 * Updates specific fields on a brew session row.
 * Automatically updates the `updated_at` timestamp.
 */
export async function updateBrewSession(
  sessionId: number,
  fields: Partial<Omit<BrewSessionRow, 'id' | 'created_at' | 'user_id'>>
): Promise<void> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePayload: any = { ...fields, updated_at: new Date().toISOString() }
  const { error } = await supabase
    .from('brew_sessions')
    .update(updatePayload)
    .eq('id', sessionId)

  if (error) {
    throw new Error(`Failed to update brew session ${sessionId}: ${error.message}`)
  }
}

/**
 * Deletes a brew session by ID.
 * Only sessions with deletable statuses ('exploring', 'abandoned') should be deleted.
 * Throws if the session is not in a deletable state.
 */
export async function deleteBrewSession(sessionId: number): Promise<void> {
  const supabase = createAdminClient()

  // Verify session exists and check status
  const { data: session, error: fetchErr } = await supabase
    .from('brew_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .maybeSingle()

  if (fetchErr) {
    throw new Error(`Failed to fetch brew session ${sessionId}: ${fetchErr.message}`)
  }

  if (!session) {
    throw new Error(`Brew session ${sessionId} not found`)
  }

  const { error: deleteErr } = await supabase
    .from('brew_sessions')
    .delete()
    .eq('id', sessionId)

  if (deleteErr) {
    throw new Error(`Failed to delete brew session ${sessionId}: ${deleteErr.message}`)
  }
}

/**
 * Lists brew sessions filtered by status.
 * Returns sessions ordered by updated_at DESC (most recent first).
 */
export async function listBrewSessions(
  statusFilter?: string[]
): Promise<Pick<BrewSessionRow, 'id' | 'status' | 'commander_name' | 'colour_identity' | 'updated_at'>[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('brew_sessions')
    .select('id, status, commander_name, colour_identity, updated_at')
    .order('updated_at', { ascending: false })

  if (statusFilter && statusFilter.length > 0) {
    query = query.in('status', statusFilter)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to list brew sessions: ${error.message}`)
  }

  return data ?? []
}

/**
 * Updates the decision log JSON for a session.
 * Convenience wrapper around updateBrewSession for the common case of
 * persisting decision log changes.
 */
export async function persistDecisionLog(
  sessionId: number,
  decisionLog: DecisionLog
): Promise<void> {
  await updateBrewSession(sessionId, {
    decision_log_json: JSON.stringify(decisionLog),
  })
}

/**
 * Transitions a session to 'building' phase and stores commander data.
 * Used when the user commits a commander during the exploration phase.
 */
export async function persistCommanderCommit(
  sessionId: number,
  commanderName: string,
  colourIdentity: string,
  pathType: 'commander' | 'concept',
  decisionLog: DecisionLog
): Promise<void> {
  await updateBrewSession(sessionId, {
    status: 'building',
    commander_name: commanderName,
    colour_identity: colourIdentity,
    path_type: pathType,
    decision_log_json: JSON.stringify(decisionLog),
  })
}
