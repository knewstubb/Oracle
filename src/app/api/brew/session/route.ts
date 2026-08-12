// ---------------------------------------------------------------------------
// /api/brew/session — Session CRUD for brew mode
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// POST — Create a new brew session with an associated deck
// The deck is created immediately (inactive, no cards) so it shows in the deck grid
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  try {
    const body = await request.json().catch(() => ({}))
    const action = body?.action ?? 'create'

    if (action === 'create') {
      const supabase = createAdminClient()

      // 1. Create the deck first (inactive, placeholder name)
      // Using negative IDs to avoid collision with imported decks (positive integers)
      const oracleId = -(Date.now() % 2147483647)
      const placeholderName = `New Brew ${new Date().toLocaleDateString()}`

      const { data: deck, error: deckError } = await supabase
        .from('decks')
        .insert({
          id: oracleId,
          name: placeholderName,
          is_active: false,
          card_count: 0,
          user_id: userId,
        })
        .select('id')
        .single()

      if (deckError) throw new Error(`Failed to create deck: ${deckError.message}`)

      // 2. Create the brew session linked to the deck
      const { data: session, error: sessionError } = await supabase
        .from('brew_sessions')
        .insert({
          deck_id: deck.id,
          status: 'exploring',
          decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}',
          user_id: userId,
        })
        .select('id')
        .single()

      if (sessionError) {
        // Rollback: delete the deck we just created
        await supabase.from('decks').delete().eq('id', deck.id)
        throw new Error(`Failed to create session: ${sessionError.message}`)
      }

      return Response.json({ sessionId: session.id, deckId: deck.id })
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}

// GET — Retrieve a session by ID
// Returns all persistable fields needed for session hydration (autosave loader)
// Validates: Requirements 7.1, 7.3
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('id')

    if (!sessionId) {
      return Response.json({ error: 'Session ID required' }, { status: 400 })
    }

    const id = Number(sessionId)
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: 'Invalid session ID' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: session, error } = await supabase
      .from('brew_sessions')
      .select('id, deck_id, conversation_json, decision_log_json, skeleton_json, status, commander_name, colour_identity, path_type, model_id, updated_at, created_at')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      return Response.json({ error: 'Failed to fetch session' }, { status: 500 })
    }

    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    return Response.json({
      id: session.id,
      deck_id: session.deck_id,
      conversation_json: session.conversation_json,
      decision_log_json: session.decision_log_json,
      skeleton_json: session.skeleton_json,
      status: session.status,
      commander_name: session.commander_name,
      colour_identity: session.colour_identity,
      path_type: session.path_type,
      model_id: session.model_id,
      updated_at: session.updated_at,
      created_at: session.created_at,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}


// PATCH — Update session status and commander info
// Used when transitioning from exploring to building phase
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = await request.json()
    const { sessionId, status, commanderName, colourIdentity } = body

    if (!sessionId || typeof sessionId !== 'number') {
      return Response.json({ error: 'Session ID required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    
    const updateFields: Partial<{
      status: string
      commander_name: string
      colour_identity: string
      updated_at: string
    }> = {
      updated_at: new Date().toISOString(),
    }
    
    if (status) updateFields.status = status
    if (commanderName) updateFields.commander_name = commanderName
    if (colourIdentity) updateFields.colour_identity = colourIdentity

    const { error } = await supabase
      .from('brew_sessions')
      .update(updateFields)
      .eq('id', sessionId)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
