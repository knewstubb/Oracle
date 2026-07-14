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
 * For Tier 5 (print new proxy):
 *   - deckCardsId: number
 *   - createProxy: true
 *   - cardDefinitionId: number — which card to create a proxy for
 *
 * Returns: { success, previousAssignment, physicalCopyId? }
 *
 * CRITICAL: No cascade/backfill. When clearing the source row, do NOT trigger
 * any auto-resolution of the resulting gap. The gap stays unresolved per Section 6d.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

interface AssignBody {
  deckCardsId: number
  physicalCopyId?: number
  tier?: number
  createProxy?: boolean
  cardDefinitionId?: number
}

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

  const { deckCardsId, physicalCopyId, createProxy, cardDefinitionId } = body

  if (!deckCardsId) {
    return Response.json({ error: 'deckCardsId is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ─── Tier 5: Create a new proxy and assign it ───────────────────────
  if (createProxy) {
    if (!cardDefinitionId) {
      return Response.json(
        { error: 'cardDefinitionId is required for proxy creation' },
        { status: 400 }
      )
    }

    // Create new physical_copies row with is_proxy = true
    const { data: newCopy, error: createErr } = await supabase
      .from('physical_copies')
      .insert({
        card_definition_id: cardDefinitionId,
        user_id: userId,
        is_proxy: true,
        condition: 'near_mint',
      })
      .select('id')
      .single()

    if (createErr || !newCopy) {
      return Response.json(
        { error: `Failed to create proxy: ${createErr?.message ?? 'unknown'}` },
        { status: 500 }
      )
    }

    // Assign it to the target deck_cards row
    const { error: assignErr } = await supabase
      .from('deck_cards')
      .update({
        physical_copy_id: newCopy.id,
        ownership_status: 'proxy',
      })
      .eq('id', deckCardsId)

    if (assignErr) {
      return Response.json(
        { error: `Failed to assign proxy: ${assignErr.message}` },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      previousAssignment: null,
      physicalCopyId: newCopy.id,
    })
  }

  // ─── Tiers 1–4: Assign existing physical copy ──────────────────────
  if (!physicalCopyId) {
    return Response.json(
      { error: 'physicalCopyId is required (or set createProxy: true)' },
      { status: 400 }
    )
  }

  // Atomic assign via RPC — serialized with advisory lock, no race condition
  let rpcResult: { success: boolean; cleared_from_deck_card_id: number | null; already_assigned: boolean }
  try {
    const { data, error: rpcErr } = await supabase.rpc('assign_physical_copy', {
      p_target_deck_card_id: deckCardsId,
      p_physical_copy_id: physicalCopyId,
    })

    if (rpcErr) {
      // Specific: copy is held by an allocate=true deck — not a free candidate
      if (rpcErr.message?.includes('copy_already_claimed') || rpcErr.code === 'P0001') {
        return Response.json(
          { error: 'That card was just claimed elsewhere. Refreshing available options.', stale: true },
          { status: 409 }
        )
      }
      // Belt-and-suspenders: catch unique constraint violations
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

    rpcResult = data as any
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
