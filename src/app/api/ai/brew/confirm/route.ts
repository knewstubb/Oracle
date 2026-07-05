// ---------------------------------------------------------------------------
// POST /api/ai/brew/confirm
// Confirm the strategy brief and transition to 'generating'
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import type { BrewSessionRow } from '@/types/brew'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId } = body as { sessionId: number }

    // --- Validate sessionId ---
    if (!sessionId || typeof sessionId !== 'number' || !Number.isInteger(sessionId) || sessionId <= 0) {
      return Response.json({ error: 'Invalid session ID' }, { status: 400 })
    }

    const supabase = createServerClient()

    // --- Load session ---
    const { data: session, error: fetchErr } = await supabase
      .from('brew_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (fetchErr || !session) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.status !== 'confirming') {
      return Response.json(
        { error: `Session is in '${session.status}', expected 'confirming'` },
        { status: 409 }
      )
    }

    if (!session.brief_json) {
      return Response.json(
        { error: 'Session has no strategy brief to confirm' },
        { status: 400 }
      )
    }

    // --- Transition to 'generating' ---
    await supabase
      .from('brew_sessions')
      .update({ status: 'generating', updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Failed to confirm brief: ${message}` },
      { status: 500 }
    )
  }
}
