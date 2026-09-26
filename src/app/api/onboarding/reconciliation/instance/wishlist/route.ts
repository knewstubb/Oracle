/**
 * PATCH /api/onboarding/reconciliation/instance/wishlist
 *
 * Toggles the per-instance wishlist flag. This is deliberately inert: it changes
 * no count, no resolution, and no `deck_cards` row (spec §9, P11).
 *
 * Response: `{ success: true, view: ReconciliationView }`.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getImportReconciliation, setClaimWishlist, mapReconciliationError } from '@/lib/import-reconciliation'
import type { SetInstanceWishlistBody } from '@/types/import-reconciliation'

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { claimId, wishlisted, batchId } = body as Partial<SetInstanceWishlistBody>

  if (typeof claimId !== 'number') {
    return Response.json({ error: 'claimId (number) is required' }, { status: 400 })
  }
  if (typeof wishlisted !== 'boolean') {
    return Response.json({ error: 'wishlisted (boolean) is required' }, { status: 400 })
  }
  const sanitizedBatchId =
    typeof batchId === 'string' && batchId.trim() !== '' ? batchId.trim() : null

  try {
    await setClaimWishlist(userId, claimId, wishlisted)
    const view = await getImportReconciliation(userId, {
      batchId: sanitizedBatchId,
      includeResolved: true,
    })
    return Response.json({ success: true, view })
  } catch (err) {
    const { status, token, message } = mapReconciliationError(err)
    return Response.json({ error: message, token }, { status })
  }
}
