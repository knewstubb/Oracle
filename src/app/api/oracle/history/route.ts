/**
 * GET /api/oracle/history
 * Returns the user's Oracle conversation history for a specific context
 * 
 * Query params:
 *   contextType: 'collection' | 'deck' | 'deck-list' | 'forge' | 'workbench' | 'general'
 *   deckId?: number (required when contextType is 'deck')
 * 
 * DELETE /api/oracle/history
 * Clears the user's Oracle conversation history for a specific context
 * 
 * Query params:
 *   contextType: string (optional - if omitted, clears ALL history)
 *   deckId?: number (optional - if omitted with contextType='deck', clears all deck chats)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { searchParams } = new URL(request.url)
  const contextType = searchParams.get('contextType') ?? 'general'
  const deckIdParam = searchParams.get('deckId')
  const deckId = deckIdParam ? parseInt(deckIdParam, 10) : null

  const supabase = createAdminClient()

  // Build query based on context
  let query = supabase
    .from('oracle_messages')
    .select('id, role, content, created_at, context_type, context_deck_id')
    .eq('user_id', userId)
    .eq('context_type', contextType)

  // For deck context, filter by specific deck
  if (contextType === 'deck' && deckId) {
    query = query.eq('context_deck_id', deckId)
  } else if (contextType !== 'deck') {
    // For non-deck contexts, ensure we're not pulling deck-specific messages
    query = query.is('context_deck_id', null)
  }

  const { data: messages, error } = await query
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) {
    console.error('[oracle/history] Error fetching messages:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Transform to the ChatMessage format expected by the frontend
  const formattedMessages = (messages ?? []).map(msg => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant' | 'system',
    content: msg.content,
    timestamp: new Date(msg.created_at).getTime(),
  }))

  return NextResponse.json({ messages: formattedMessages })
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { searchParams } = new URL(request.url)
  const contextType = searchParams.get('contextType')
  const deckIdParam = searchParams.get('deckId')
  const deckId = deckIdParam ? parseInt(deckIdParam, 10) : null

  const supabase = createAdminClient()

  // Build delete query based on context
  let query = supabase
    .from('oracle_messages')
    .delete()
    .eq('user_id', userId)

  if (contextType) {
    query = query.eq('context_type', contextType)
    
    // For deck context with specific deckId, only clear that deck's history
    if (contextType === 'deck' && deckId) {
      query = query.eq('context_deck_id', deckId)
    }
  }
  // If no contextType specified, delete ALL messages for this user

  const { error } = await query

  if (error) {
    console.error('[oracle/history] Error clearing messages:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
