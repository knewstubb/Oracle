/**
 * POST /api/onboarding/finalize
 *
 * Called when the user finishes the import (Go to Decks). Runs the single
 * materialization pass: for every card whose remaining real-copy demand fits
 * supply, applies each deck's recorded decision (sleeve → assign a distinct
 * owned copy; proxy → create the printing-matched proxy and sleeve it; release
 * → drop the claim, slot stays Planned). Cards still over-committed keep their
 * claims as the settled record behind the deck-list conflict badge.
 *
 * Scoped to the current import batch when `batchId` is provided, so this run can
 * never materialize another run's leftover claims.
 *
 * Returns the per-outcome counts so the client can confirm the pass actually
 * ran, rather than assuming success from a 200 response.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { finalizeImportClaims } from '@/lib/import-sleeve-claims'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let batchId: string | null = null
  try {
    const body = (await request.json()) as { batchId?: string } | null
    if (body && typeof body.batchId === 'string' && body.batchId.trim() !== '') {
      batchId = body.batchId
    }
  } catch {
    // No body (or invalid JSON) → finalize the user's unsettled claims.
    batchId = null
  }

  try {
    const result = await finalizeImportClaims(userId, batchId)
    return Response.json({
      success: true,
      finalizedCount: result.finalizedCount,
      proxiedCount: result.proxiedCount,
      releasedCount: result.releasedCount,
      leftOpenCount: result.leftOpenCount,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
