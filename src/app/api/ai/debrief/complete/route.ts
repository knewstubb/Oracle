import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { buildDebriefSummary } from '@/lib/debrief-actions'
import type { Recommendation } from '@/lib/debrief-types'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = await request.json()
    const { sessionId } = body as { sessionId: number }

    // Validate sessionId
    if (!sessionId || typeof sessionId !== 'number' || !Number.isInteger(sessionId) || sessionId <= 0) {
      return Response.json({ error: 'Invalid session ID' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Validate session exists
    const { data: session, error: fetchErr } = await supabase
      .from('debrief_sessions')
      .select('id, deck_id, status, recommendations_json, current_rec_index')
      .eq('id', sessionId)
      .single()

    if (fetchErr || !session) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    // Validate session status is 'recommending'
    if (session.status !== 'recommending') {
      return Response.json(
        { error: `Session is in ${session.status} state, expected recommending` },
        { status: 409 }
      )
    }

    // Verify all recommendations have been actioned
    const recommendations: Recommendation[] = session.recommendations_json
      ? JSON.parse(session.recommendations_json)
      : []

    if ((session.current_rec_index ?? 0) < recommendations.length) {
      return Response.json(
        { error: 'Not all recommendations have been actioned' },
        { status: 409 }
      )
    }

    // Build the debrief summary
    const summary = await buildDebriefSummary(sessionId, session.deck_id)

    // Update session: status = 'complete', completed_at = now()
    const { error: updateErr } = await supabase
      .from('debrief_sessions')
      .update({
        status: 'complete',
        completed_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    if (updateErr) {
      return Response.json({ error: updateErr.message }, { status: 500 })
    }

    return Response.json({ summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Failed to complete debrief session: ${message}` },
      { status: 500 }
    )
  }
}
