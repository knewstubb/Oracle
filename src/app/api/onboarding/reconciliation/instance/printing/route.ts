/**
 * PATCH /api/onboarding/reconciliation/instance/printing
 *
 * Sets or clears one instance's alternate printing override. The target printing
 * must share the imported printing's oracle_id and must be a printing the user
 * owns a real copy of (spec §12). If the instance was `sleeved` and the new
 * printing has no room, it is demoted to `planned` and `demoted: true` is
 * returned.
 *
 * Response: `{ success: true, demoted: boolean, view: ReconciliationView }`.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getImportReconciliation, setClaimPrinting, mapReconciliationError } from '@/lib/import-reconciliation'
import type { SetInstancePrintingBody } from '@/types/import-reconciliation'

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

  const { claimId, printingId, batchId } = body as Partial<SetInstancePrintingBody>

  if (typeof claimId !== 'number') {
    return Response.json({ error: 'claimId (number) is required' }, { status: 400 })
  }
  if (printingId !== null && printingId !== undefined && typeof printingId !== 'string') {
    return Response.json({ error: 'printingId must be a string or null' }, { status: 400 })
  }
  const sanitizedBatchId =
    typeof batchId === 'string' && batchId.trim() !== '' ? batchId.trim() : null

  try {
    const { demoted } = await setClaimPrinting(userId, claimId, printingId ?? null)
    const view = await getImportReconciliation(userId, {
      batchId: sanitizedBatchId,
      includeResolved: true,
    })
    return Response.json({ success: true, demoted, view })
  } catch (err) {
    const { status, token, message } = mapReconciliationError(err)
    return Response.json({ error: message, token }, { status })
  }
}
