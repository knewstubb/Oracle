/**
 * POST /api/physical-copies/[id]/missing — Mark a physical copy as Missing
 * DELETE /api/physical-copies/[id]/missing — Un-mark (mark as found)
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
  const physicalCopyId = parseInt(id, 10)
  if (isNaN(physicalCopyId)) {
    return Response.json({ error: 'Invalid physical copy ID' }, { status: 400 })
  }

  // Verify ownership
  const supabase = createAdminClient()
  const { data: copy, error: fetchErr } = await supabase
    .from('physical_copies')
    .select('id')
    .eq('id', physicalCopyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (fetchErr) {
    return Response.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!copy) {
    return Response.json({ error: 'Physical copy not found' }, { status: 404 })
  }

  try {
    const result = await markCopyMissing(physicalCopyId, userId)
    console.info(
      `[missing] Marked copy ${physicalCopyId} as missing. Affected decks: [${result.affectedDeckIds.join(', ')}]`
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
  const physicalCopyId = parseInt(id, 10)
  if (isNaN(physicalCopyId)) {
    return Response.json({ error: 'Invalid physical copy ID' }, { status: 400 })
  }

  // Verify ownership
  const supabase = createAdminClient()
  const { data: copy, error: fetchErr } = await supabase
    .from('physical_copies')
    .select('id')
    .eq('id', physicalCopyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (fetchErr) {
    return Response.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!copy) {
    return Response.json({ error: 'Physical copy not found' }, { status: 404 })
  }

  try {
    const result = await unmarkCopyMissing(physicalCopyId, userId)
    console.info(`[missing] Un-marked copy ${physicalCopyId}. Card: ${result.cardName}`)
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
