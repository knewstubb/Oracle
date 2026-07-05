import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('decks')
    .select('last_synced_at')
    .order('last_synced_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .single()

  if (error) {
    // No rows or other issue — return null
    return Response.json({ lastSyncedAt: null })
  }

  return Response.json({
    lastSyncedAt: data?.last_synced_at ?? null,
  })
}
