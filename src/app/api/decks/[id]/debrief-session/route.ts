import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId) || deckId <= 0) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Query the most recent debrief session where status is 'complete' or 'recommending'
  const { data: session, error: sessionErr } = await supabase
    .from('debrief_sessions')
    .select('id, deck_id, status, recommendations_json, created_at')
    .eq('deck_id', deckId)
    .in('status', ['complete', 'recommending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (sessionErr) {
    return Response.json({ error: sessionErr.message }, { status: 500 })
  }

  if (!session) {
    return Response.json(null)
  }

  // Compute total_fixes from recommendations_json (it's a JSON array)
  let total_fixes = 0
  try {
    const recommendations = session.recommendations_json
      ? JSON.parse(session.recommendations_json)
      : []
    total_fixes = Array.isArray(recommendations) ? recommendations.length : 0
  } catch {
    total_fixes = 0
  }

  // Query debrief_actions for this session (excluding 'error' actions)
  const { data: actions, error: actionsErr } = await supabase
    .from('debrief_actions')
    .select('id, action_type, cut_card, add_card')
    .eq('session_id', session.id)
    .neq('action_type', 'error')

  if (actionsErr) {
    return Response.json({ error: actionsErr.message }, { status: 500 })
  }

  const actionsArr = actions ?? []
  const reviewed_fixes = actionsArr.length
  const applied = actionsArr.filter(a => a.action_type === 'applied').length
  const skipped = actionsArr.filter(a => a.action_type !== 'applied').length
  const pending = total_fixes - reviewed_fixes

  // Build changes array from actions
  const changes = actionsArr.map(a => ({
    from: a.cut_card,
    to: a.add_card,
    skipped: a.action_type !== 'applied',
  }))

  return Response.json({
    id: session.id,
    date: session.created_at,
    total_fixes,
    reviewed_fixes,
    applied,
    skipped,
    pending,
    changes,
  })
}
