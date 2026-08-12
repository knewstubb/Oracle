/**
 * Oracle Session by ID API
 * 
 * GET /api/oracle/sessions/[id] — Get session with messages
 * PATCH /api/oracle/sessions/[id] — Update session (name, status, archive)
 * DELETE /api/oracle/sessions/[id] — Delete session (hard delete)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionStatus = 'active' | 'exploring' | 'building' | 'complete'

interface UpdateSessionBody {
  sessionName?: string
  status?: SessionStatus
  commanderName?: string
  committedDeckId?: number
  archived?: boolean
}

// ---------------------------------------------------------------------------
// GET — Get session with messages
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params

  const supabase = createAdminClient()

  // Fetch session
  const { data: session, error: sessionError } = await supabase
    .from('oracle_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (sessionError) {
    if (sessionError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    console.error('[oracle/sessions/[id]] Error fetching session:', sessionError)
    return NextResponse.json({ error: sessionError.message }, { status: 500 })
  }

  // Fetch messages for this session
  const { data: messages, error: messagesError } = await supabase
    .from('oracle_messages')
    .select('id, role, content, created_at, context_type, context_deck_id')
    .eq('session_id', id)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (messagesError) {
    console.error('[oracle/sessions/[id]] Error fetching messages:', messagesError)
    return NextResponse.json({ error: messagesError.message }, { status: 500 })
  }

  // Transform messages to ChatMessage format
  const formattedMessages = (messages ?? []).map(msg => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant' | 'system',
    content: msg.content,
    timestamp: new Date(msg.created_at).getTime(),
  }))

  return NextResponse.json({
    session,
    messages: formattedMessages,
  })
}

// ---------------------------------------------------------------------------
// PATCH — Update session
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const body = (await request.json()) as UpdateSessionBody

  const supabase = createAdminClient()

  // Build update object
  const updates: Record<string, unknown> = {}

  if (body.sessionName !== undefined) {
    // Validate session name length
    if (body.sessionName && body.sessionName.length > 100) {
      return NextResponse.json(
        { error: 'Session name must be 100 characters or less' },
        { status: 400 }
      )
    }
    updates.session_name = body.sessionName
  }

  if (body.status !== undefined) {
    const validStatuses: SessionStatus[] = ['active', 'exploring', 'building', 'complete']
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    updates.status = body.status
  }

  if (body.commanderName !== undefined) {
    updates.commander_name = body.commanderName
  }

  if (body.committedDeckId !== undefined) {
    updates.committed_deck_id = body.committedDeckId
  }

  if (body.archived !== undefined) {
    updates.archived_at = body.archived ? new Date().toISOString() : null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  const { data: session, error } = await supabase
    .from('oracle_sessions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    console.error('[oracle/sessions/[id]] Error updating session:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ session })
}

// ---------------------------------------------------------------------------
// DELETE — Delete session (hard delete)
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params

  const supabase = createAdminClient()

  // Delete session (messages will cascade due to FK constraint)
  const { error } = await supabase
    .from('oracle_sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    console.error('[oracle/sessions/[id]] Error deleting session:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
