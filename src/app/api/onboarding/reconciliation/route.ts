/**
 * GET /api/onboarding/reconciliation?batchId=<uuid>&includeResolved=true|false
 *
 * Returns the full T-22 reconciliation view for an import batch. When no
 * `batchId` is given, every unsettled claim for the authenticated user is
 * returned. `includeResolved` defaults to `false` so a full reload hides rows
 * that are already resolved (spec §14).
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getImportReconciliation, mapReconciliationError } from '@/lib/import-reconciliation'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const rawBatchId = request.nextUrl.searchParams.get('batchId')
  const batchId = rawBatchId && rawBatchId.trim() !== '' ? rawBatchId.trim() : null
  const includeResolved = request.nextUrl.searchParams.get('includeResolved') === 'true'

  try {
    const view = await getImportReconciliation(userId, { batchId, includeResolved })
    return Response.json(view)
  } catch (err) {
    const { status, token, message } = mapReconciliationError(err)
    return Response.json({ error: message, token }, { status })
  }
}
