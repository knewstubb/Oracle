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
 * Body: { oracleId: string, printingId?: string, finish?: 'nonfoil' | 'foil' | 'etched' }
 *
 * The copy records a printing (D-038): the caller may name one with
 * `printingId`; otherwise the newest printing of the card is used. A copy is
 * never created without a printing. `finish` defaults to 'nonfoil' (D-004).
 */

const ALLOWED_FINISHES = ['nonfoil', 'foil', 'etched'] as const
type AllowedFinish = (typeof ALLOWED_FINISHES)[number]

function isAllowedFinish(value: unknown): value is AllowedFinish {
  return typeof value === 'string' && (ALLOWED_FINISHES as readonly string[]).includes(value)
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  let body: { oracleId?: string; printingId?: string; finish?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { oracleId } = body
  if (!oracleId) {
    return Response.json({ error: 'oracleId is required' }, { status: 400 })
  }

  if (body.finish !== undefined && !isAllowedFinish(body.finish)) {
    return Response.json(
      { error: `finish must be one of: ${ALLOWED_FINISHES.join(', ')}` },
      { status: 400 }
    )
  }
  const finish: AllowedFinish = isAllowedFinish(body.finish) ? body.finish : 'nonfoil'

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

  // D-038: a proxy records a printing, never none. Prefer an explicit printing
  // from the caller, otherwise the newest printing of the card.
  const requestedPrintingId = body.printingId?.trim() || null
  let printingId = requestedPrintingId

  if (!printingId) {
    const { data: newestPrinting, error: printingErr } = await supabase
      .from('ref_printings')
      .select('scryfall_id')
      .eq('oracle_id', oracleId)
      .order('released_at', { ascending: false, nullsFirst: false })
      .order('scryfall_id', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (printingErr) {
      return Response.json({ error: printingErr.message }, { status: 500 })
    }

    printingId = newestPrinting?.scryfall_id ?? null
  }

  if (!printingId) {
    return Response.json(
      { error: 'No printing found for this card' },
      { status: 404 }
    )
  }

  const { data, error: insertErr } = await supabase.rpc('insert_user_copies', {
    p_user_id: authResult.id,
    p_rows: [
      {
        card_id: card.id,
        printing_id: printingId,
        finish,
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
