/**
 * PATCH /api/onboarding/reconciliation/instance
 *
 * Sets one import instance's state to `planned`, `sleeved` or `proxy`. The RPC
 * rejects `sleeved` when the effective printing has no free copy, even if a
 * stale client thinks it does (P1).
 *
 * Response: `{ success: true, view: ReconciliationView }` with resolved rows
 * included so the row the user just resolved stays on screen (spec §14).
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getImportReconciliation, setClaimState, mapReconciliationError } from '@/lib/import-reconciliation'
import { INSTANCE_STATES, LEGACY_STATE_MAP } from '@/types/import-reconciliation'
import type { InstanceState, SetInstanceStateBody } from '@/types/import-reconciliation'

const VALID_STATES = new Set<string>([...INSTANCE_STATES, ...Object.keys(LEGACY_STATE_MAP)])

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

  const { claimId, state, batchId } = body as Partial<SetInstanceStateBody>

  if (typeof claimId !== 'number') {
    return Response.json({ error: 'claimId (number) is required' }, { status: 400 })
  }
  if (typeof state !== 'string' || !VALID_STATES.has(state)) {
    return Response.json({ error: "state must be 'planned', 'sleeved' or 'proxy'" }, { status: 400 })
  }

  const canonicalState: InstanceState =
    (LEGACY_STATE_MAP as Record<string, InstanceState>)[state] ?? (state as InstanceState)
  const sanitizedBatchId =
    typeof batchId === 'string' && batchId.trim() !== '' ? batchId.trim() : null

  try {
    await setClaimState(userId, claimId, canonicalState)
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
