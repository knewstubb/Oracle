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
      const { error: deleteErr, count } = await supabase
        .from('deck_cards')
        .delete()
        .eq('deck_id', deckId)
        .in('id', body.cardIds)

      if (deleteErr) {
        return Response.json({ error: deleteErr.message }, { status: 500 })
      }

      return Response.json({
        success: true,
        operation: 'delete',
        affected: count ?? body.cardIds.length,
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

      return Response.json({
        success: true,
        operation: 'move-category',
        affected: count ?? body.cardIds.length,
        category: primaryTrimmed,
      })
    }

    case 'add-proxy': {
      // For add-proxy, we need to:
      // 1. Get the card names for each card ID
      // 2. Create proxy physical copies
      // 3. Link them to the deck_cards rows
      // 
      // This is a multi-step operation but doesn't violate atomicity rules
      // since adding a proxy to an unowned slot is idempotent — the invariant
      // is that a slot can have a copy or not, and we're filling empty slots.

      // Get card details
      const { data: cardDetails, error: detailsErr } = await supabase
        .from('deck_cards')
        .select('id, card_name, copy_id')
        .eq('deck_id', deckId)
        .in('id', body.cardIds)

      if (detailsErr) {
        return Response.json({ error: detailsErr.message }, { status: 500 })
      }

      // Filter to cards that don't already have a copy assigned
      const slotsNeedingProxy = cardDetails?.filter(c => c.copy_id === null) ?? []

      if (slotsNeedingProxy.length === 0) {
        return Response.json({
          success: true,
          operation: 'add-proxy',
          affected: 0,
          message: 'All selected cards already have copies assigned',
        })
      }

      let successCount = 0
      const errors: string[] = []

      // Process each card that needs a proxy
      for (const slot of slotsNeedingProxy) {
        try {
          // Get oracle_id for the card
          const { data: printing } = await supabase
            .from('ref_printings')
            .select('oracle_id')
            .eq('name', slot.card_name)
            .limit(1)
            .single()

          if (!printing?.oracle_id) {
            errors.push(`No oracle_id found for ${slot.card_name}`)
            continue
          }

          // Check if user_cards entry exists
          let { data: userCard } = await supabase
            .from('user_cards')
            .select('id')
            .eq('user_id', userId)
            .eq('oracle_id', printing.oracle_id)
            .maybeSingle()

          // Create user_cards entry if needed
          if (!userCard) {
            const { data: newUserCard, error: insertErr } = await supabase
              .from('user_cards')
              .insert({
                user_id: userId,
                oracle_id: printing.oracle_id,
                card_name: slot.card_name,
              })
              .select('id')
              .single()

            if (insertErr) {
              errors.push(`Failed to create user_cards for ${slot.card_name}: ${insertErr.message}`)
              continue
            }
            userCard = newUserCard
          }

          // Create proxy physical copy
          const { data: newCopy, error: copyErr } = await supabase
            .from('user_copies')
            .insert({
              user_id: userId,
              card_id: userCard.id,
              is_proxy: true,
              is_foil: false,
            })
            .select('id')
            .single()

          if (copyErr) {
            errors.push(`Failed to create proxy for ${slot.card_name}: ${copyErr.message}`)
            continue
          }

          // Link to deck_cards
          const { error: linkErr } = await supabase
            .from('deck_cards')
            .update({
              copy_id: newCopy.id,
              ownership_status: 'proxy',
            })
            .eq('id', slot.id)

          if (linkErr) {
            errors.push(`Failed to link proxy to ${slot.card_name}: ${linkErr.message}`)
            continue
          }

          successCount++
        } catch (err) {
          errors.push(`Unexpected error for ${slot.card_name}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      return Response.json({
        success: successCount > 0,
        operation: 'add-proxy',
        affected: successCount,
        errors: errors.length > 0 ? errors : undefined,
      })
    }

    default:
      return Response.json({ error: 'Unknown operation' }, { status: 400 })
  }
}
