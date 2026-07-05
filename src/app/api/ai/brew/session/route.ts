// ---------------------------------------------------------------------------
// GET /api/ai/brew/session
// Retrieve brew session — active or by ID
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import type { BrewSessionRow } from '@/types/brew'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const supabase = createAdminClient()

    const { searchParams } = new URL(request.url)
    const active = searchParams.get('active')
    const id = searchParams.get('id')

    // --- Query by active session ---
    if (active === 'true') {
      const { data: session } = await supabase
        .from('brew_sessions')
        .select('*')
        .not('status', 'in', '("complete","abandoned")')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      return Response.json({ session: session || null })
    }

    // --- Query by specific session ID ---
    if (id) {
      const sessionId = parseInt(id, 10)
      if (isNaN(sessionId) || sessionId <= 0) {
        return Response.json({ error: 'Invalid session ID' }, { status: 400 })
      }

      const { data: session, error: fetchErr } = await supabase
        .from('brew_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (fetchErr || !session) {
        return Response.json({ error: 'Session not found' }, { status: 404 })
      }

      return Response.json({ session })
    }

    // --- Neither active nor id provided ---
    return Response.json(
      { error: "Provide either '?active=true' or '?id={sessionId}'" },
      { status: 400 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Failed to fetch brew session: ${message}` },
      { status: 500 }
    )
  }
}
