/**
 * GET /api/decks/[id]/versions
 * List all versions for a deck
 *
 * POST /api/decks/[id]/versions
 * Create a new version snapshot
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import type { VersionTriggerType, CreateVersionResult, DeckVersion } from '@/lib/deck-versions'

interface CreateVersionBody {
  trigger_type: VersionTriggerType
  trigger_details?: string
  version_name?: string
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const deckId = parseInt(id, 10)

  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify deck ownership
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, user_id')
    .eq('id', deckId)
    .single()

  if (deckErr || !deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  if (deck.user_id !== userId) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  // Get all versions for this deck
  const { data: versions, error: versionsErr } = await supabase
    .from('deck_versions')
    .select('*')
    .eq('deck_id', deckId)
    .order('version_number', { ascending: false })

  if (versionsErr) {
    return Response.json({ error: versionsErr.message }, { status: 500 })
  }

  return Response.json({
    versions: versions as DeckVersion[],
    count: versions?.length ?? 0,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const deckId = parseInt(id, 10)

  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const body = (await request.json()) as CreateVersionBody

  // Validate trigger_type
  const validTriggers: VersionTriggerType[] = ['manual', 'import', 'bulk_change', 'session_end', 'milestone']
  if (!body.trigger_type || !validTriggers.includes(body.trigger_type)) {
    return Response.json(
      { error: `Invalid trigger_type. Valid: ${validTriggers.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Call the RPC function to create the version
  const { data, error } = await supabase.rpc('create_deck_version', {
    p_deck_id: deckId,
    p_user_id: userId,
    p_trigger_type: body.trigger_type,
    p_trigger_details: body.trigger_details ?? null,
    p_version_name: body.version_name ?? null,
  })

  if (error) {
    if (error.message.includes('deck_not_found')) {
      return Response.json({ error: 'Deck not found' }, { status: 404 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data as CreateVersionResult, { status: 201 })
}
