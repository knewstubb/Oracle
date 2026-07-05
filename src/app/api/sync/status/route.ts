import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServerClient()
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
