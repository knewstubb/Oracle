/**
 * GET /api/decks/[id]/import-alerts
 * Open "skipped move" alerts for one deck (contract import-intent §6). Read plus marking stale alerts fixed.
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { listOpenAlerts } from '@/lib/import-alerts'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const deckId = parseInt((await params).id, 10)
  if (isNaN(deckId)) return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  try {
    const alerts = await listOpenAlerts(createAdminClient(), authResult.id, deckId)
    return Response.json({ alerts })
  } catch (err) {
    console.error(`[import-alerts] ${err instanceof Error ? err.message : String(err)}`)
    return Response.json({ error: 'Could not load alerts' }, { status: 500 })
  }
}
