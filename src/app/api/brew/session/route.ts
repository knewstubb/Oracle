// ---------------------------------------------------------------------------
// /api/brew/session — Session CRUD for brew mode
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const DEFAULT_USER_ID = process.env.SUPABASE_DEFAULT_USER_ID ?? '00000000-0000-0000-0000-000000000000'

// POST — Create a new brew session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const action = body?.action ?? 'create'

    if (action === 'create') {
      const supabase = createServerClient()
      const { data, error } = await supabase
        .from('brew_sessions')
        .insert({
          status: 'exploring',
          decision_log_json: '{"strategy":[],"parameters":[],"constraints":[]}',
          user_id: DEFAULT_USER_ID,
        })
        .select('id')
        .single()

      if (error) throw new Error(error.message)

      return Response.json({ sessionId: data.id })
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

    const supabase = createServerClient()
    const { data: session, error } = await supabase
      .from('brew_sessions')
      .select('id, conversation_json, decision_log_json, skeleton_json, status, commander_name, colour_identity, path_type, model_id, updated_at, created_at')
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
