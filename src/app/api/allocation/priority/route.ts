/**
 * PUT /api/allocation/priority
 *
 * Update deck priority ordering for the allocation algorithm.
 * Lower priority number = higher precedence for receiving originals.
 *
 * Validates: Requirements 7.2
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { setDeckPriority } from '@/lib/allocation-store'
import { requireAuth } from '@/lib/auth'

interface PriorityRequestBody {
  deckId: number
  priority: number
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  try {
    const body = (await request.json()) as PriorityRequestBody

    // --- Validation ---
    if (!body.deckId || typeof body.deckId !== 'number') {
      return Response.json(
        { success: false, error: 'deckId is required and must be a number' },
        { status: 400 }
      )
    }

    if (body.priority === undefined || typeof body.priority !== 'number') {
      return Response.json(
        { success: false, error: 'priority is required and must be a number' },
        { status: 400 }
      )
    }

    if (body.priority < 1) {
      return Response.json(
        { success: false, error: 'priority must be at least 1' },
        { status: 400 }
      )
    }

    // Verify the deck exists
    const supabase = createAdminClient()
    const { data: deck, error: deckErr } = await supabase
      .from('decks')
      .select('id, name')
      .eq('id', body.deckId)
      .single()

    if (deckErr || !deck) {
      return Response.json(
        { success: false, error: `Deck with ID ${body.deckId} does not exist` },
        { status: 404 }
      )
    }

    await setDeckPriority(body.deckId, body.priority, userId)

    return Response.json({
      success: true,
      deckId: body.deckId,
      deckName: deck.name,
      priority: body.priority,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[allocation/priority] Unexpected error: ${message}`)
    return Response.json(
      { success: false, error: `Unexpected error: ${message}` },
      { status: 500 }
    )
  }
}
