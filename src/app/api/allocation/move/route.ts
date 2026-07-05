/**
 * POST /api/allocation/move
 *
 * Preview-confirm pattern for card movement.
 * - confirm=false (or missing): returns a preview of what would change
 * - confirm=true: executes the movement and returns results
 *
 * Validates: Requirements 3.1
 */

import { NextRequest } from 'next/server'
import { planCardMovement, executeCardMovement } from '@/lib/card-movement'
import type { MoveCardCommand } from '@/lib/card-movement'

interface MoveRequestBody {
  cardName: string
  fromDeckId: number
  toDeckId: number
  scryfallId?: string
  confirm?: boolean
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MoveRequestBody

    // --- Validation ---
    if (!body.cardName || typeof body.cardName !== 'string') {
      return Response.json(
        { success: false, error: 'cardName is required and must be a string' },
        { status: 400 }
      )
    }

    if (!body.fromDeckId || typeof body.fromDeckId !== 'number') {
      return Response.json(
        { success: false, error: 'fromDeckId is required and must be a number' },
        { status: 400 }
      )
    }

    if (!body.toDeckId || typeof body.toDeckId !== 'number') {
      return Response.json(
        { success: false, error: 'toDeckId is required and must be a number' },
        { status: 400 }
      )
    }

    if (body.fromDeckId === body.toDeckId) {
      return Response.json(
        { success: false, error: 'fromDeckId and toDeckId must be different' },
        { status: 400 }
      )
    }

    const command: MoveCardCommand = {
      cardName: body.cardName,
      fromDeckId: body.fromDeckId,
      toDeckId: body.toDeckId,
      scryfallId: body.scryfallId,
    }

    if (body.confirm) {
      // Execute the movement
      const result = await executeCardMovement(command)

      if (!result.success) {
        return Response.json(
          { success: false, error: result.error },
          { status: 422 }
        )
      }

      return Response.json({
        success: true,
        executed: true,
        archidektResults: result.archidektResults,
        affectedDeckResults: result.affectedDeckResults,
      })
    } else {
      // Preview only — plan the movement
      const preview = await planCardMovement(command)

      if (!preview.success) {
        return Response.json(
          { success: false, error: preview.error },
          { status: 422 }
        )
      }

      return Response.json({
        success: true,
        executed: false,
        preview: {
          allocationChanges: preview.allocationChanges,
          archidektWrites: preview.archidektWrites,
          affectedDecks: preview.affectedDecks,
        },
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[allocation/move] Unexpected error: ${message}`)
    return Response.json(
      { success: false, error: `Unexpected error: ${message}` },
      { status: 500 }
    )
  }
}
