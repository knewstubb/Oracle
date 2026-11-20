import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { CONDITION_OPTIONS } from '@/lib/card-details/labels'

/**
 * PATCH /api/collection/instances/condition
 *
 * Sets the condition of one physical copy. Writes the existing user_copies.condition column only.
 * Proxies and Missing copies have no condition, so they answer 409.
 *
 * Body: { copyId: number, condition: 'near_mint' | 'lightly_played' | 'moderately_played' | 'heavily_played' | 'damaged' }
 * Response: { copyId, condition }
 */
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { copyId?: unknown; condition?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { copyId, condition } = body
  if (typeof copyId !== 'number' || !Number.isInteger(copyId) || copyId <= 0) {
    return Response.json({ error: 'copyId is required and must be a number' }, { status: 400 })
  }
  if (typeof condition !== 'string' || !CONDITION_OPTIONS.some((o) => o.stored === condition)) {
    return Response.json({ error: 'condition must be one of: ' + CONDITION_OPTIONS.map((o) => o.stored).join(', ') }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: copy, error: readErr } = await supabase
    .from('user_copies')
    .select('id, is_proxy, missing')
    .eq('id', copyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (readErr) return Response.json({ error: readErr.message }, { status: 500 })
  if (!copy) return Response.json({ error: 'Copy not found or does not belong to user' }, { status: 404 })
  if (copy.is_proxy || copy.missing) {
    return Response.json({ error: 'A Proxy or Missing copy has no condition' }, { status: 409 })
  }

  const { error: updErr } = await supabase.from('user_copies').update({ condition }).eq('id', copyId).eq('user_id', userId)
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 })
  return Response.json({ copyId, condition })
}
