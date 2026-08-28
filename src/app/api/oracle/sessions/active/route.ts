/**
 * Active Oracle Session API
 * 
 * GET /api/oracle/sessions/active — Get active session for context (respects 4-hour window)
 * 
 * Query params:
 *   type: 'exploration' | 'deck' | 'collection' | 'general' (required)
 *   deckId: number (required for type='deck')
 * 
 * Returns the most recent session for the given context if it's within
 * the 4-hour activity window. Otherwise returns null, indicating a new
 * session should be created.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionType = 'exploration' | 'deck' | 'collection' | 'general'

// ---------------------------------------------------------------------------
// GET — Get active session for context
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { searchParams } = new URL(request.url)
  const sessionType = searchParams.get('type') as SessionType | null
  const deckIdParam = searchParams.get('deckId')
  const deckId = deckIdParam ? parseInt(deckIdParam, 10) : null

  // Validate required params
  if (!sessionType) {
    return NextResponse.json(
      { error: 'type parameter is required' },
      { status: 400 }
    )
  }

  const validTypes: SessionType[] = ['exploration', 'deck', 'collection', 'general']
  if (!validTypes.includes(sessionType)) {
    return NextResponse.json(
      { error: 'Invalid session type' },
      { status: 400 }
    )
  }

  if (sessionType === 'deck' && !deckId) {
    return NextResponse.json(
      { error: 'deckId is required for deck sessions' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Use the RPC function for atomic session lookup with 4-hour window
  const { data, error } = await supabase.rpc('get_active_oracle_session', {
    p_user_id: userId,
    p_session_type: sessionType,
    p_context_deck_id: deckId,
    p_window_hours: 4,
  })

  if (error) {
    console.error('[oracle/sessions/active] Error fetching active session:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // RPC returns an array; get first result or null
  const session = data && data.length > 0 ? data[0] : null

  // Debug: log what the RPC returned
  console.log('[oracle/sessions/active] RPC returned:', {
    sessionType,
    sessionFound: !!session,
    sessionId: session?.id,
    sessionName: session?.session_name,
    lastMessageAt: session?.last_message_at,
    startedAt: session?.started_at,
    windowHours: 4,
  })

  if (!session) {
    // No active session within window — client should create a new one
    return NextResponse.json({ session: null, shouldCreateNew: true })
  }

  // Fetch messages for this session
  const { data: messages, error: messagesError } = await supabase
    .from('oracle_messages')
    .select('id, role, content, created_at')
    .eq('session_id', session.id)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (messagesError) {
    console.error('[oracle/sessions/active] Error fetching messages:', messagesError)
    // Return session without messages rather than failing entirely
    return NextResponse.json({ session, messages: [], shouldCreateNew: false })
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
    shouldCreateNew: false,
  })
}
