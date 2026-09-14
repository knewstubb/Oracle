/**
 * POST /api/decks/[id]/cards/bulk
 *
 * Perform bulk operations on multiple cards within a deck.
 * 
 * Operations:
 * - delete: Remove multiple cards from the deck
 * - move-category: Move multiple cards to a new category
 * - add-proxy: Add proxy copies to multiple unowned/claimed slots
 *
 * Body: { operation: string, cardIds: number[], payload?: object }
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { serializeCategories } from '@/lib/categoryUtils'
import { assertAtomicRpcCount, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'
import { createVersionSnapshot, BULK_CHANGE_THRESHOLD } from '@/lib/deck-versions'

type BulkOperation = 'delete' | 'move-category' | 'add-proxy'

interface BulkRequestBody {
  operation: BulkOperation
  cardIds: number[]
  payload?: {
    // For move-category
    primary_category?: string
    additional_categories?: string[]
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const deckId = parseInt(id, 10)

  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const body = (await request.json()) as BulkRequestBody

  // Validate required fields
  if (!body.operation || !Array.isArray(body.cardIds) || body.cardIds.length === 0) {
    return Response.json(
      { error: 'operation and cardIds (non-empty array) are required' },
      { status: 400 }
    )
  }

  const validOperations: BulkOperation[] = ['delete', 'move-category', 'add-proxy']
  if (!validOperations.includes(body.operation)) {
    return Response.json(
      { error: `Invalid operation. Valid: ${validOperations.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Verify deck ownership
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, user_id')
    .eq('id', deckId)
    .single()

  if (deckErr || !deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  if (deck.user_id !== userId) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  // Verify all card IDs belong to this deck
  const { data: cards, error: cardsErr } = await supabase
    .from('deck_cards')
    .select('id')
    .eq('deck_id', deckId)
    .in('id', body.cardIds)

  if (cardsErr) {
    return Response.json({ error: cardsErr.message }, { status: 500 })
  }

  const foundIds = new Set(cards?.map(c => c.id) ?? [])
  const invalidIds = body.cardIds.filter(id => !foundIds.has(id))

  if (invalidIds.length > 0) {
    return Response.json(
      { error: `Cards not found in this deck: ${invalidIds.join(', ')}` },
      { status: 404 }
    )
  }

  // Execute the operation
  switch (body.operation) {
    case 'delete': {
      const { data: deleteResult, error: deleteErr } = await (supabase.rpc as any)(
        'apply_ai_deck_delta',
        {
          p_deck_id: deckId,
          p_user_id: userId,
          p_additions: [],
          p_remove_deck_card_ids: body.cardIds,
        }
      )

      if (deleteErr) {
        if (deleteErr.message?.includes('deck_not_found') || deleteErr.message?.includes('deck_card_not_found')) {
          return Response.json({ error: 'Cards not found in this deck' }, { status: 404 })
        }
        return Response.json({ error: deleteErr.message }, { status: 500 })
      }

      const result = assertAtomicRpcSuccess(deleteResult, 'apply_ai_deck_delta')
      const affected = assertAtomicRpcCount(
        result,
        'removed_count',
        'apply_ai_deck_delta',
        body.cardIds.length
      )

      // Create version snapshot if bulk change threshold met
      if (affected >= BULK_CHANGE_THRESHOLD) {
        await createVersionSnapshot(
          deckId,
          userId,
          'bulk_change',
          `Removed ${affected} cards`
        )
      }

      return Response.json({
        success: true,
        operation: 'delete',
        affected,
      })
    }

    case 'move-category': {
      if (!body.payload?.primary_category) {
        return Response.json(
          { error: 'payload.primary_category is required for move-category' },
          { status: 400 }
        )
      }

      const primaryTrimmed = body.payload.primary_category.trim()
      const additionalTrimmed = (body.payload.additional_categories ?? []).map(c => c.trim())

      // Validate category cap
      if (additionalTrimmed.length > 2) {
        return Response.json(
          { error: 'additional_categories must have at most 2 entries' },
          { status: 400 }
        )
      }

      const serialized = serializeCategories({
        primary_category: primaryTrimmed,
        additional_categories: additionalTrimmed,
      })

      const { error: updateErr, count } = await supabase
        .from('deck_cards')
        .update({ categories: serialized })
        .eq('deck_id', deckId)
        .in('id', body.cardIds)

      if (updateErr) {
        return Response.json({ error: updateErr.message }, { status: 500 })
      }

      const affected = count ?? body.cardIds.length

      // Create version snapshot if bulk change threshold met
      if (affected >= BULK_CHANGE_THRESHOLD) {
        await createVersionSnapshot(
          deckId,
          userId,
          'bulk_change',
          `Moved ${affected} cards to "${primaryTrimmed}"`
        )
      }

      return Response.json({
        success: true,
        operation: 'move-category',
        affected,
        category: primaryTrimmed,
      })
    }

    case 'add-proxy': {
      // Resolve all selected slots first, then create every proxy and sleeve it in
      // one Postgres transaction. No per-slot loop can leave a partial batch.
      const { data: cardDetails, error: detailsErr } = await supabase
        .from('deck_cards')
        .select('id, card_name, copy_id')
        .eq('deck_id', deckId)
        .in('id', body.cardIds)

      if (detailsErr) {
        return Response.json({ error: detailsErr.message }, { status: 500 })
      }

      const slotsNeedingProxy = cardDetails?.filter(c => c.copy_id === null) ?? []
      if (slotsNeedingProxy.length === 0) {
        return Response.json({
          success: true,
          operation: 'add-proxy',
          affected: 0,
          message: 'All selected cards already have copies assigned',
        })
      }

      const { data, error: proxyErr } = await supabase.rpc('add_proxies_to_slots', {
        p_user_id: userId,
        p_assignments: slotsNeedingProxy.map(slot => ({
          deck_card_id: slot.id,
          card_name: slot.card_name,
        })),
      })

      if (proxyErr) {
        if (proxyErr.message.includes('target_not_found')) {
          return Response.json({ error: 'One or more deck card slots were not found' }, { status: 404 })
        }
        if (proxyErr.message.includes('target_filled')) {
          return Response.json({ error: 'One or more selected slots are already resolved' }, { status: 409 })
        }
        if (proxyErr.message.includes('card_printing_not_found')) {
          return Response.json({ error: 'A selected card could not be resolved to a printing' }, { status: 404 })
        }
        return Response.json({ error: `Failed to add proxies: ${proxyErr.message}` }, { status: 500 })
      }

      const result = assertAtomicRpcSuccess(data, 'add_proxies_to_slots')
      const affected = assertAtomicRpcCount(
        result,
        'created_count',
        'add_proxies_to_slots',
        slotsNeedingProxy.length
      )

      if (affected >= BULK_CHANGE_THRESHOLD) {
        await createVersionSnapshot(
          deckId,
          userId,
          'bulk_change',
          `Added ${affected} proxy copies`
        )
      }

      return Response.json({
        success: true,
        operation: 'add-proxy',
        affected,
      })
    }

    default:
      return Response.json({ error: 'Unknown operation' }, { status: 400 })
  }
}
