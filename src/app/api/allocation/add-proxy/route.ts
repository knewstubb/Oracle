/**
 * POST /api/allocation/add-proxy
 *
 * Atomically creates a proxy physical_copies row and assigns it to a deck slot.
 * Used from Claimed, Open, and Unowned chip popovers in the Cards Tab,
 * and from the Picklist's "Print Proxy" flow.
 *
 * Body: { deckCardsId: number, cardDefinitionId: number }
 * Returns: { success: true, physicalCopyId: number }
 *
 * The proxy is created with:
 * - is_proxy = true
 * - source_tag = 'manual'
 * - scryfall_printing_id = defaulted from oracle_to_printings (first available)
 * - storage_location_id = null (goes straight to the deck, not storage)
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { deckCardsId: number; cardDefinitionId: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { deckCardsId, cardDefinitionId } = body

  if (!deckCardsId || !cardDefinitionId) {
    return Response.json(
      { error: 'deckCardsId and cardDefinitionId are required' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  try {
    // Verify the deck_cards row belongs to this user and is unresolved
    const { data: deckCard, error: dcErr } = await supabase
      .from('deck_cards')
      .select('id, deck_id, physical_copy_id')
      .eq('id', deckCardsId)
      .eq('user_id', userId)
      .maybeSingle()

    if (dcErr || !deckCard) {
      return Response.json({ error: 'Deck card slot not found' }, { status: 404 })
    }

    if (deckCard.physical_copy_id !== null) {
      return Response.json(
        { error: 'Slot is already resolved — cannot add proxy to an occupied slot' },
        { status: 409 }
      )
    }

    // Verify the card_definition belongs to this user and get oracle_id for printing lookup
    const { data: cardDef, error: cdErr } = await supabase
      .from('card_definitions')
      .select('id, oracle_id')
      .eq('id', cardDefinitionId)
      .eq('user_id', userId)
      .maybeSingle()

    if (cdErr || !cardDef) {
      return Response.json({ error: 'Card definition not found' }, { status: 404 })
    }

    // Resolve a default printing from oracle_to_printings (best-effort, fall back to null)
    let scryfallPrintingId: string | null = null
    if (cardDef.oracle_id) {
      const { data: printing } = await supabase
        .from('oracle_to_printings')
        .select('scryfall_printing_id')
        .eq('oracle_id', cardDef.oracle_id)
        .limit(1)
        .maybeSingle()

      if (printing?.scryfall_printing_id) {
        scryfallPrintingId = printing.scryfall_printing_id
      }
    }

    // Step 1: Create the proxy physical_copies row
    const { data: newCopy, error: createErr } = await supabase
      .from('physical_copies')
      .insert({
        card_definition_id: cardDefinitionId,
        is_proxy: true,
        is_foil: false,
        source_tag: 'manual',
        scryfall_printing_id: scryfallPrintingId,
        user_id: userId,
      })
      .select('id')
      .single()

    if (createErr || !newCopy) {
      return Response.json(
        { error: `Failed to create proxy: ${createErr?.message ?? 'unknown error'}` },
        { status: 500 }
      )
    }

    // Step 2: Assign the new proxy to the deck slot
    const { error: assignErr } = await supabase
      .from('deck_cards')
      .update({
        physical_copy_id: newCopy.id,
        ownership_status: 'proxy',
      })
      .eq('id', deckCardsId)

    if (assignErr) {
      // Rollback: delete the created copy since assignment failed
      await supabase.from('physical_copies').delete().eq('id', newCopy.id)
      return Response.json(
        { error: `Failed to assign proxy to slot: ${assignErr.message}` },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      physicalCopyId: newCopy.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
