/**
 * POST /api/allocation/assign
 *
 * Atomic, per-row physical copy assignment. Implements Section 7 of the spec.
 *
 * Body:
 *   - deckCardsId: number — the target deck_cards row to assign
 *   - physicalCopyId: number — the physical_copies row to claim
 *   - tier: number — the tier of this assignment (for audit)
 *
 * Returns: { success, previousAssignment }
 *
 * CRITICAL: No cascade/backfill. When clearing the source row, do NOT trigger
 * any auto-resolution of the resulting gap. The gap stays unresolved per Section 6d.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { assertAtomicRpcBoolean, assertAtomicRpcOptionalId, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'
import type { AssignBody } from '@/types/placement-source'

interface PreviousAssignment {
  deckCardsId: number
  deckId: number
  deckName: string
  physicalCopyId: number
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: AssignBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { deckCardsId, physicalCopyId } = body

  if (!deckCardsId) {
    return Response.json({ error: 'deckCardsId is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ─── Tiers 1–4: Assign existing physical copy ──────────────────────
  if (!physicalCopyId) {
    return Response.json(
      { error: 'physicalCopyId is required' },
      { status: 400 }
    )
  }

  // Atomic assign via RPC — serialized with advisory lock, no race condition
  let rpcResult: {
    success: true
    cleared_from_deck_card_id: number | null
    already_assigned: boolean
  }
  try {
    const { data, error: rpcErr } = await (supabase.rpc as any)('assign_physical_copy', {
      p_target_deck_card_id: deckCardsId,
      p_copy_id: physicalCopyId,
      p_user_id: userId,
      // Manual route: the client cannot choose a placement source (contract §Validation 2).
      p_source: 'manual',
    })

    if (rpcErr) {
      // Only contention errors are stale; other P0001 errors describe a bad
      // target/input and must not be presented as a retryable race.
      if (rpcErr.message?.includes('copy_already_claimed')) {
        return Response.json(
          { error: 'That card was just claimed elsewhere. Refreshing available options.', stale: true },
          { status: 409 }
        )
      }
      if (rpcErr.message?.includes('target_not_found') || rpcErr.message?.includes('copy_not_found')) {
        return Response.json({ error: 'Assignment target or copy not found' }, { status: 404 })
      }
      if (rpcErr.message?.includes('target_filled') || rpcErr.message?.includes('card_identity_mismatch')) {
        return Response.json({ error: 'The selected copy cannot be assigned to this slot' }, { status: 409 })
      }
      if (rpcErr.message?.includes('unique') || rpcErr.code === '23505') {
        return Response.json(
          { error: 'That card was just claimed elsewhere. Refreshing available options.', stale: true },
          { status: 409 }
        )
      }
      return Response.json(
        { error: `Assignment failed: ${rpcErr.message}` },
        { status: 500 }
      )
    }

    const result = assertAtomicRpcSuccess(data, 'assign_physical_copy')
    rpcResult = {
      success: true,
      cleared_from_deck_card_id: assertAtomicRpcOptionalId(
        result,
        'cleared_from_deck_card_id',
        'assign_physical_copy'
      ),
      already_assigned: assertAtomicRpcBoolean(
        result,
        'already_assigned',
        'assign_physical_copy'
      ),
    }
  } catch (err) {
    // Catch any other constraint errors that might slip through
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('unique') || msg.includes('duplicate key')) {
      return Response.json(
        { error: 'That card was just claimed elsewhere. Refreshing available options.', stale: true },
        { status: 409 }
      )
    }
    return Response.json(
      { error: `Assignment failed: ${msg}` },
      { status: 500 }
    )
  }

  // If already assigned (idempotent), return success with no previous assignment
  if (rpcResult.already_assigned) {
    return Response.json({ success: true, previousAssignment: null })
  }

  // Build previousAssignment if the copy was pulled from another deck
  let previousAssignment: PreviousAssignment | null = null
  if (rpcResult.cleared_from_deck_card_id) {
    // Fetch the source deck info for the undo record
    const { data: sourceRow } = await supabase
      .from('deck_cards')
      .select(`
        id,
        deck_id,
        decks!deck_cards_deck_id_fkey(name)
      `)
      .eq('id', rpcResult.cleared_from_deck_card_id)
      .maybeSingle()

    if (sourceRow) {
      previousAssignment = {
        deckCardsId: sourceRow.id,
        deckId: sourceRow.deck_id,
        deckName: (sourceRow as any).decks?.name ?? `Deck ${sourceRow.deck_id}`,
        physicalCopyId,
      }
    }
  }

  return Response.json({
    success: true,
    previousAssignment,
  })
}
