/**
 * POST /api/allocation/replace-with-original
 *
 * Atomically replaces a proxy in a deck slot with a free original copy.
 * The slot's physical_copy_id is updated in a single UPDATE (never empty),
 * and the outgoing proxy is moved to a chosen storage location.
 *
 * Body: {
 *   deckCardsId?: number              — the deck_cards row currently holding the proxy
 *   proxyPhysicalCopyId?: number      — alternative: look up deck_cards by physical_copy_id
 *   originalPhysicalCopyId: number    — the free original copy to swap in
 *   proxyStorageLocationId: number | null — where the outgoing proxy goes (null = Unsorted)
 * }
 *
 * Returns: { success: true }
 *
 * Guarantees:
 * - Deck completeness never transiently drops (single UPDATE swaps physical_copy_id)
 * - The proxy is NOT deleted — it moves to the chosen storage location
 * - The slot's ownership_status becomes 'original'
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

interface ReplaceBody {
  deckCardsId?: number
  proxyPhysicalCopyId?: number
  originalPhysicalCopyId: number
  proxyStorageLocationId: number | null
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: ReplaceBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { deckCardsId: providedDeckCardsId, proxyPhysicalCopyId: bodyProxyPcId, originalPhysicalCopyId, proxyStorageLocationId } = body

  if (!originalPhysicalCopyId) {
    return Response.json(
      { error: 'originalPhysicalCopyId is required' },
      { status: 400 }
    )
  }

  if (!providedDeckCardsId && !bodyProxyPcId) {
    return Response.json(
      { error: 'Either deckCardsId or proxyPhysicalCopyId is required' },
      { status: 400 }
    )
  }

  if (proxyStorageLocationId === undefined) {
    return Response.json(
      { error: 'proxyStorageLocationId is required (use null for Unsorted)' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  try {
    // Resolve deckCardsId — either provided directly or looked up via proxyPhysicalCopyId
    let deckCardsId = providedDeckCardsId
    if (!deckCardsId && bodyProxyPcId) {
      const { data: dcRow, error: dcLookupErr } = await supabase
        .from('deck_cards')
        .select('id')
        .eq('physical_copy_id', bodyProxyPcId)
        .eq('user_id', userId)
        .maybeSingle()

      if (dcLookupErr || !dcRow) {
        return Response.json({ error: 'Could not find deck slot for this proxy' }, { status: 404 })
      }
      deckCardsId = dcRow.id
    }

    // 1. Verify the deck_cards row belongs to this user and currently holds a proxy
    const { data: deckCard, error: dcErr } = await supabase
      .from('deck_cards')
      .select('id, deck_id, physical_copy_id, ownership_status, user_id')
      .eq('id', deckCardsId)
      .eq('user_id', userId)
      .maybeSingle()

    if (dcErr || !deckCard) {
      return Response.json({ error: 'Deck card slot not found' }, { status: 404 })
    }

    if (deckCard.ownership_status !== 'proxy' || !deckCard.physical_copy_id) {
      return Response.json(
        { error: 'Slot does not contain a proxy — cannot replace' },
        { status: 409 }
      )
    }

    const outgoingProxyId = deckCard.physical_copy_id

    // 2. Verify the original physical copy exists, belongs to this user, and is NOT a proxy
    const { data: originalCopy, error: ocErr } = await supabase
      .from('physical_copies')
      .select('id, is_proxy')
      .eq('id', originalPhysicalCopyId)
      .eq('user_id', userId)
      .maybeSingle()

    if (ocErr || !originalCopy) {
      return Response.json({ error: 'Original physical copy not found' }, { status: 404 })
    }

    if (originalCopy.is_proxy) {
      return Response.json(
        { error: 'Target copy is also a proxy — must be an original' },
        { status: 400 }
      )
    }

    // 3. Verify the original is free (not assigned to any deck)
    const { data: assignedSlots, error: asErr } = await supabase
      .from('deck_cards')
      .select('id')
      .eq('physical_copy_id', originalPhysicalCopyId)
      .limit(1)

    if (asErr) {
      return Response.json({ error: `Check failed: ${asErr.message}` }, { status: 500 })
    }

    if (assignedSlots && assignedSlots.length > 0) {
      return Response.json(
        { error: 'Original copy is already assigned to a deck — not free' },
        { status: 409 }
      )
    }

    // 4. ATOMIC SWAP: Update deck_cards to point to the original (single UPDATE)
    //    This ensures the slot is never empty between unlink and relink.
    const { error: swapErr } = await supabase
      .from('deck_cards')
      .update({
        physical_copy_id: originalPhysicalCopyId,
        ownership_status: 'original',
      })
      .eq('id', deckCardsId)

    if (swapErr) {
      return Response.json(
        { error: `Swap failed: ${swapErr.message}` },
        { status: 500 }
      )
    }

    // 5. Move the outgoing proxy to the chosen storage location
    const { error: moveErr } = await supabase
      .from('physical_copies')
      .update({
        storage_location_id: proxyStorageLocationId,
      })
      .eq('id', outgoingProxyId)

    if (moveErr) {
      // The swap already succeeded — log but don't fail the whole operation
      console.error(
        `[replace-with-original] Swap succeeded but proxy storage move failed: ${moveErr.message}`
      )
    }

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
