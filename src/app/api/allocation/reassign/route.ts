/**
 * POST /api/allocation/reassign
 *
 * Manual override to reassign which deck holds the original for a specific card.
 * Accepts { cardName: string, targetDeckId: number } and pins the original to the target deck,
 * then reruns the ownership resolver to cascade changes across all decks sharing that card.
 *
 * Returns the updated allocation state for that card across all decks.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 8.1, 8.2
 */

import { NextRequest } from 'next/server'
import { setPriorityOverride, getAllocationsForCard } from '@/lib/allocation-store'
import { resolveOwnership } from '@/lib/ownership-resolver'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cardName, targetDeckId } = body

    // Validate input
    if (!cardName || typeof cardName !== 'string' || !cardName.trim()) {
      return Response.json(
        { success: false, error: 'cardName must be a non-empty string' },
        { status: 400 }
      )
    }

    if (targetDeckId == null || typeof targetDeckId !== 'number' || !Number.isInteger(targetDeckId) || targetDeckId <= 0) {
      return Response.json(
        { success: false, error: 'targetDeckId must be a positive integer' },
        { status: 400 }
      )
    }

    // Set the priority override to pin the original to the target deck
    await setPriorityOverride(cardName.trim(), targetDeckId, 'pin_original')

    // Rerun the ownership resolver to cascade changes to all decks containing this card
    await resolveOwnership()

    // Return the updated allocation state for this card across all decks
    const allocations = await getAllocationsForCard(cardName.trim())

    return Response.json({
      success: true,
      cardName: cardName.trim(),
      targetDeckId,
      allocations,
      count: allocations.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[allocation/reassign] Unexpected error: ${message}`)
    return Response.json(
      { success: false, error: `Unexpected error: ${message}` },
      { status: 500 }
    )
  }
}
