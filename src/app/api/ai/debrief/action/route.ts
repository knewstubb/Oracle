import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { applyCardSwap, logDebriefAction } from '@/lib/debrief-actions'
import { formatDebriefNoteEntry } from '@/lib/debrief-prompts'
import { resolveOwnership } from '@/lib/ownership-resolver'
import { appendNote } from '@/lib/deck-documentation-store'
import type { Recommendation, DebriefSessionRow } from '@/lib/debrief-types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, recommendationIndex, actionType } = body as {
      sessionId: number
      recommendationIndex: number
      actionType: 'applied' | 'skipped' | 'disagreed'
    }

    // Validate inputs
    if (!sessionId || typeof sessionId !== 'number') {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 })
    }

    if (typeof recommendationIndex !== 'number' || recommendationIndex < 0) {
      return Response.json({ error: 'Invalid recommendationIndex' }, { status: 400 })
    }

    if (!['applied', 'skipped', 'disagreed'].includes(actionType)) {
      return Response.json({ error: 'Invalid actionType' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Validate session exists with status 'recommending'
    const { data: session, error: fetchErr } = await supabase
      .from('debrief_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (fetchErr || !session) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.status !== 'recommending') {
      return Response.json(
        { error: `Session is in ${session.status} state, expected recommending` },
        { status: 409 }
      )
    }

    // Validate recommendationIndex matches current_rec_index
    if (recommendationIndex !== session.current_rec_index) {
      return Response.json(
        { error: 'Invalid recommendation index' },
        { status: 400 }
      )
    }

    // Load recommendation at index from recommendations_json
    if (!session.recommendations_json) {
      return Response.json(
        { error: 'No recommendations found on session' },
        { status: 400 }
      )
    }

    const recommendations: Recommendation[] = JSON.parse(session.recommendations_json)

    if (recommendationIndex >= recommendations.length) {
      return Response.json(
        { error: 'Recommendation index out of bounds' },
        { status: 400 }
      )
    }

    const rec = recommendations[recommendationIndex]

    if (actionType === 'applied') {
      // a. Apply card swap
      const swapResult = await applyCardSwap(session.deck_id, rec.cutCard, rec.addCard)

      if (!swapResult.success) {
        // Log error action
        await logDebriefAction(sessionId, 'error', rec.cutCard, rec.addCard, rec.reason, false)

        return Response.json(
          { success: false, error: swapResult.error },
          { status: 200 }
        )
      }

      // b. Run Ownership Resolver (non-blocking — try/catch)
      try {
        await resolveOwnership()
      } catch (err) {
        console.warn('Ownership resolver failed (non-blocking):', err)
      }

      // c. Log to local notes (non-blocking — try/catch)
      let noteLogged = false
      try {
        const noteEntry = formatDebriefNoteEntry(sessionId, {
          cutCard: rec.cutCard,
          addCard: rec.addCard,
          reason: rec.reason,
        })
        await appendNote(session.deck_id, noteEntry)
        noteLogged = true
      } catch (err) {
        console.warn('Note logging failed (non-blocking):', err)
      }

      // d. Log action
      await logDebriefAction(sessionId, 'applied', rec.cutCard, rec.addCard, rec.reason, noteLogged)
    } else {
      // actionType === 'skipped' or 'disagreed'
      await logDebriefAction(sessionId, actionType, rec.cutCard, rec.addCard, rec.reason, false)
    }

    // Increment current_rec_index on the session
    const { error: updateErr } = await supabase
      .from('debrief_sessions')
      .update({ current_rec_index: (session.current_rec_index ?? 0) + 1 })
      .eq('id', sessionId)

    if (updateErr) {
      return Response.json({ error: updateErr.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Action failed: ${message}` },
      { status: 500 }
    )
  }
}
