import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * POST /api/collection/instances/add-proxy
 *
 * Creates a new physical_copies row with is_proxy=true for the given oracle_id.
 * Used when the Instance Panel shows a shortfall and the user wants to add a proxy.
 *
 * Body: { oracleId: string }
 *
 * Validates: Requirements 10.6
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

  // Resolve card_definition_id from oracle_id
  const { data: cardDef, error: cdErr } = await (supabase as any)
    .from('card_definitions')
    .select('id')
    .eq('oracle_id', oracleId)
    .limit(1)
    .maybeSingle()

  if (cdErr) {
    return Response.json({ error: cdErr.message }, { status: 500 })
  }

  if (!cardDef) {
    return Response.json({ error: 'Card definition not found for oracle_id' }, { status: 404 })
  }

  // Insert a new physical copy with is_proxy=true
  const { data: newCopy, error: insertErr } = await (supabase as any)
    .from('physical_copies')
    .insert({
      card_definition_id: cardDef.id,
      is_proxy: true,
      is_foil: false,
      user_id: authResult.id,
      source_tag: 'manual',
    })
    .select('id')
    .single()

  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 })
  }

  return Response.json({ created: true, physicalCopyId: newCopy.id }, { status: 201 })
}
