/**
 * POST /api/decks/import/ownership
 *
 * READ ONLY. Tells the deck-import review what the signed-in owner already has of the
 * listed cards: which copies are free, and which are sleeved in other decks.
 * Never writes. Never returns copy ids. Every query is filtered by the signed-in user.
 * Contract: docs/oracle/contracts/import-intent.md §3.
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { loadOwnershipFacts, validateOwnershipRequest } from '@/lib/import-ownership'
import type { OwnershipRequest } from '../../../../../../docs/oracle/contracts/import-intent.types'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const problem = validateOwnershipRequest(body)
  if (problem) return Response.json({ error: problem }, { status: 400 })

  try {
    const facts = await loadOwnershipFacts(createAdminClient(), authResult.id, body as OwnershipRequest)
    return Response.json(facts)
  } catch (err) {
    console.error('[import/ownership]', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Could not check your collection' }, { status: 500 })
  }
}
