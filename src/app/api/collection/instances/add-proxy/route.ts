import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { assertAtomicRpcIdList, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'

/**
 * POST /api/collection/instances/add-proxy
 *
 * Creates a proxy copy in the user's default storage location through the
 * atomic collection-insert RPC. Allocation into a deck slot is separate and
 * uses add_proxy_to_slot.
 *
 * Body: { oracleId: string }
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  let body: { oracleId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { oracleId } = body
  if (!oracleId) {
    return Response.json({ error: 'oracleId is required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: card, error: cardErr } = await supabase
    .from('user_cards')
    .select('id')
    .eq('oracle_id', oracleId)
    .eq('user_id', authResult.id)
    .maybeSingle()

  if (cardErr) {
    return Response.json({ error: cardErr.message }, { status: 500 })
  }

  if (!card) {
    return Response.json({ error: 'Card definition not found for oracle_id' }, { status: 404 })
  }

  const { data, error: insertErr } = await supabase.rpc('insert_user_copies', {
    p_user_id: authResult.id,
    p_rows: [
      {
        card_id: card.id,
        finish: 'nonfoil',
        is_proxy: true,
        source_tag: 'manual',
        location_id: null,
      },
    ],
  })

  if (insertErr) {
    if (insertErr.message.includes('card_not_found')) {
      return Response.json({ error: 'Card definition not found for oracle_id' }, { status: 404 })
    }
    return Response.json({ error: insertErr.message }, { status: 500 })
  }

  const result = assertAtomicRpcSuccess(data, 'insert_user_copies')
  const insertedIds = assertAtomicRpcIdList(
    result,
    'inserted_ids',
    'insert_user_copies',
    1
  )

  return Response.json({ created: true, physicalCopyId: insertedIds[0] }, { status: 201 })
}
