/**
 * Card data refresh (local dev server).
 *
 * GET  → { lastSyncedAt, isStale, ageDays, totalPrintings, refresh: {phase, message, ...} }
 * POST → starts a background refresh and returns 202 straight away.
 *        409 if one is already running. The browser polls GET for progress.
 */

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getLastSync } from '@/lib/card-data-sync'
import { calculateCardDataStaleness, type CardDataStatus } from '@/lib/card-data-status'
import { getRefreshState, startRefresh } from '@/lib/card-data-refresh'

export const dynamic = 'force-dynamic'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const db = createAdminClient()
    const lastSyncedAt = await getLastSync(db)
    const staleness = calculateCardDataStaleness(lastSyncedAt)

    let totalPrintings: number | null = null
    const { count, error } = await db.from('ref_printings').select('*', { count: 'estimated', head: true })
    if (!error && count !== null) totalPrintings = count

    const body: CardDataStatus = {
      lastSyncedAt: staleness.lastSyncedAt,
      isStale: staleness.isStale,
      ageDays: staleness.ageDays,
      totalPrintings,
      refresh: getRefreshState(),
    }
    return Response.json(body)
  } catch (e) {
    console.error('[card-data] status failed', e)
    return Response.json({ error: 'Could not read card data status' }, { status: 500 })
  }
}

export async function POST() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  let db
  try {
    db = createAdminClient()
  } catch (e) {
    console.error('[card-data] refresh setup failed', e)
    return Response.json({ error: 'Card data refresh is not set up' }, { status: 500 })
  }

  const { started } = startRefresh(db)
  if (!started) {
    return Response.json(
      { error: 'A refresh is already running', refresh: getRefreshState() },
      { status: 409 }
    )
  }
  return Response.json({ started: true, refresh: getRefreshState() }, { status: 202 })
}
