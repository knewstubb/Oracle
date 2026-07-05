/**
 * PUT /api/decks/[id]/cards/[cardId]/categories
 *
 * Update the categories for a specific card within a deck.
 * Validates the category cap (1 primary + max 2 secondary) and no duplicates.
 *
 * Validates: Requirements 1.1, 1.2, 2.1, 2.2, 2.3
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { serializeCategories } from '@/lib/categoryUtils'

interface CategoriesRequestBody {
  primary_category: string
  additional_categories: string[]
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const { id, cardId } = await params
    const deckId = parseInt(id, 10)
    const cardIdNum = parseInt(cardId, 10)

    // --- Validate route params ---
    if (isNaN(deckId) || isNaN(cardIdNum)) {
      return Response.json(
        { success: false, error: 'Invalid deck ID or card ID' },
        { status: 400 }
      )
    }

    // --- Parse body ---
    const body = (await request.json()) as CategoriesRequestBody

    // --- Validate primary_category ---
    if (
      !body.primary_category ||
      typeof body.primary_category !== 'string' ||
      body.primary_category.trim() === ''
    ) {
      return Response.json(
        { success: false, error: 'primary_category is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    // --- Validate additional_categories ---
    if (!Array.isArray(body.additional_categories)) {
      return Response.json(
        { success: false, error: 'additional_categories must be an array' },
        { status: 400 }
      )
    }

    if (body.additional_categories.length > 2) {
      return Response.json(
        { success: false, error: 'additional_categories must have at most 2 entries' },
        { status: 400 }
      )
    }

    // --- Validate no duplicates between primary and additional ---
    const primaryTrimmed = body.primary_category.trim()
    const additionalTrimmed = body.additional_categories.map((c) => c.trim())

    if (additionalTrimmed.includes(primaryTrimmed)) {
      return Response.json(
        { success: false, error: 'additional_categories must not contain the primary_category' },
        { status: 400 }
      )
    }

    // Also check for duplicates within additional_categories
    const uniqueAdditional = new Set(additionalTrimmed)
    if (uniqueAdditional.size !== additionalTrimmed.length) {
      return Response.json(
        { success: false, error: 'additional_categories must not contain duplicate entries' },
        { status: 400 }
      )
    }

    // --- Serialize categories ---
    const serialized = serializeCategories({
      primary_category: primaryTrimmed,
      additional_categories: additionalTrimmed,
    })

    // --- Update via Supabase ---
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('deck_cards')
      .update({ categories: serialized })
      .eq('id', cardIdNum)
      .eq('deck_id', deckId)
      .select()
      .single()

    if (error || !data) {
      return Response.json(
        { success: false, error: 'Card not found in this deck' },
        { status: 404 }
      )
    }

    return Response.json(data, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[decks/cards/categories] Unexpected error: ${message}`)
    return Response.json(
      { success: false, error: `Unexpected error: ${message}` },
      { status: 500 }
    )
  }
}
