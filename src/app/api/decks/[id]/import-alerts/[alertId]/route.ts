/**
 * POST /api/decks/[id]/import-alerts/[alertId]   body { action: 'fixed' | 'dismissed' }
 * 404 for an alert that is not the signed-in user's (or not open).
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { resolveAlert } from '@/lib/import-alerts'
import { isAlertAction } from '@/lib/import-alerts-types'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; alertId: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id, alertId } = await params
  const deckId = parseInt(id, 10)
  const alertNumber = parseInt(alertId, 10)
  if (isNaN(deckId) || isNaN(alertNumber)) return Response.json({ error: 'Invalid id' }, { status: 400 })
  let body: { action?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!isAlertAction(body.action)) return Response.json({ error: "action must be 'fixed' or 'dismissed'" }, { status: 400 })
  try {
    const ok = await resolveAlert(createAdminClient(), authResult.id, deckId, alertNumber, body.action)
    if (!ok) return Response.json({ error: 'Alert not found' }, { status: 404 })
    return Response.json({ success: true })
  } catch (err) {
    console.error(`[import-alerts] ${err instanceof Error ? err.message : String(err)}`)
    return Response.json({ error: 'Could not update alert' }, { status: 500 })
  }
}
