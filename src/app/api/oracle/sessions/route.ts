/**
 * Oracle Sessions API
 * 
 * POST /api/oracle/sessions — Create a new session
 * GET /api/oracle/sessions — List sessions with pagination and filtering
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionType = 'exploration' | 'deck' | 'collection' | 'general'
type SessionStatus = 'active' | 'exploring' | 'building' | 'complete'

interface CreateSessionBody {
  sessionType: SessionType
  contextDeckId?: number
  commanderName?: string
  sessionName?: string
}

// ---------------------------------------------------------------------------
// POST — Create a new session
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const body = (await request.json()) as CreateSessionBody
  const { sessionType, contextDeckId, commanderName, sessionName } = body

  // Validate session type
  const validTypes: SessionType[] = ['exploration', 'deck', 'collection', 'general']
  if (!validTypes.includes(sessionType)) {
    return NextResponse.json(
      { error: 'Invalid session type' },
      { status: 400 }
    )
  }

  // Deck context requires a deck ID
  if (sessionType === 'deck' && !contextDeckId) {
    return NextResponse.json(
      { error: 'contextDeckId is required for deck sessions' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Determine initial status based on type
  const initialStatus: SessionStatus = sessionType === 'exploration' ? 'exploring' : 'active'

  const { data: session, error } = await supabase
    .from('oracle_sessions')
    .insert({
      user_id: userId,
      session_type: sessionType,
      context_deck_id: contextDeckId ?? null,
      commander_name: commanderName ?? null,
      session_name: sessionName ?? null,
      status: initialStatus,
      message_count: 0,
    })
    .select()
    .single()

  if (error) {
    console.error('[oracle/sessions] Error creating session:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ session })
}

// ---------------------------------------------------------------------------
// GET — List sessions with pagination and filtering
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { searchParams } = new URL(request.url)
  
  // Pagination
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)
  
  // Filters
  const sessionType = searchParams.get('type') as SessionType | null
  const includeArchived = searchParams.get('includeArchived') === 'true'
  const deckId = searchParams.get('deckId')

  const supabase = createAdminClient()

  let query = supabase
    .from('oracle_sessions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Filter by session type
  if (sessionType) {
    query = query.eq('session_type', sessionType)
  }

  // Filter by archived status
  if (!includeArchived) {
    query = query.is('archived_at', null)
  }

  // Filter by deck context
  if (deckId) {
    query = query.eq('context_deck_id', parseInt(deckId, 10))
  }

  const { data: sessions, error, count } = await query

  if (error) {
    console.error('[oracle/sessions] Error listing sessions:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    sessions: sessions ?? [],
    total: count ?? 0,
    limit,
    offset,
  })
}
