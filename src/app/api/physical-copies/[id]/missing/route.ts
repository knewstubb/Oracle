/**
 * POST /api/physical-copies/[id]/missing — Mark a copy as Missing
 * DELETE /api/physical-copies/[id]/missing — Un-mark (mark as found)
 *
 * Note: Route path uses legacy name 'physical-copies' for backwards compat,
 * but internally uses 'user_copies' table.
 *
 * POST returns { affectedDeckIds } for client-side TanStack Query invalidation.
 * DELETE returns { cardName } for collection pool refresh.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { markCopyMissing, unmarkCopyMissing } from '@/lib/missing'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const copyId = parseInt(id, 10)
  if (isNaN(copyId)) {
    return Response.json({ error: 'Invalid copy ID' }, { status: 400 })
  }

  // Verify ownership
  const supabase = createAdminClient()
  const { data: copy, error: fetchErr } = await supabase
    .from('user_copies')
    .select('id')
    .eq('id', copyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (fetchErr) {
    return Response.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!copy) {
    return Response.json({ error: 'Copy not found' }, { status: 404 })
  }

  try {
    const result = await markCopyMissing(copyId, userId)
    console.info(
      `[missing] Marked copy ${copyId} as missing. Affected decks: [${result.affectedDeckIds.join(', ')}]`
    )
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const copyId = parseInt(id, 10)
  if (isNaN(copyId)) {
    return Response.json({ error: 'Invalid copy ID' }, { status: 400 })
  }

  // Verify ownership
  const supabase = createAdminClient()
  const { data: copy, error: fetchErr } = await supabase
    .from('user_copies')
    .select('id')
    .eq('id', copyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (fetchErr) {
    return Response.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!copy) {
    return Response.json({ error: 'Copy not found' }, { status: 404 })
  }

  try {
    const result = await unmarkCopyMissing(copyId, userId)
    console.info(`[missing] Un-marked copy ${copyId}. Card: ${result.cardName}`)
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
