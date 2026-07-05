import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const sessionId = parseInt(id, 10)

  if (isNaN(sessionId)) {
    return Response.json({ error: 'Invalid session ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: session, error: fetchErr } = await supabase
    .from('brew_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .single()

  if (fetchErr || !session) {
    return Response.json({ error: 'Brew session not found' }, { status: 404 })
  }

  // Only allow deletion of sessions that haven't been completed/saved
  if (session.status === 'complete') {
    return Response.json(
      { error: 'Cannot delete a completed brew session.' },
      { status: 403 }
    )
  }

  const { error: deleteErr } = await supabase
    .from('brew_sessions')
    .delete()
    .eq('id', sessionId)

  if (deleteErr) {
    return Response.json({ error: deleteErr.message }, { status: 500 })
  }

  return Response.json({ success: true })
}
