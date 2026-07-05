// ---------------------------------------------------------------------------
// POST /api/brew/positions
// Persist canvas card positions to the session's skeleton_json
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import type { CanvasCardPosition } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PositionsBody {
  sessionId: number
  canvasPositions: Record<string, CanvasCardPosition>
}

interface SkeletonJson {
  cards?: unknown[]
  suggestions?: unknown[]
  canvasPositions?: Record<string, CanvasCardPosition>
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = (await request.json()) as PositionsBody
    const { sessionId, canvasPositions } = body

    // --- Validate inputs ---
    if (!sessionId || typeof sessionId !== 'number') {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 })
    }

    if (!canvasPositions || typeof canvasPositions !== 'object') {
      return Response.json({ error: 'Invalid canvasPositions' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // --- Load existing skeleton_json ---
    const { data: row, error: fetchErr } = await supabase
      .from('brew_sessions')
      .select('skeleton_json')
      .eq('id', sessionId)
      .single()

    if (fetchErr || !row) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    // --- Merge canvasPositions into skeleton_json ---
    let skeleton: SkeletonJson = {}
    if (row.skeleton_json) {
      try {
        skeleton = JSON.parse(row.skeleton_json) as SkeletonJson
      } catch {
        skeleton = {}
      }
    }

    skeleton.canvasPositions = canvasPositions

    // --- Persist updated skeleton_json ---
    const { error: updateErr } = await supabase
      .from('brew_sessions')
      .update({ skeleton_json: JSON.stringify(skeleton), updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    if (updateErr) throw new Error(updateErr.message)

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[brew/positions] Unexpected error: ${message}`)
    return Response.json(
      { error: `Failed to persist positions: ${message}` },
      { status: 500 }
    )
  }
}
