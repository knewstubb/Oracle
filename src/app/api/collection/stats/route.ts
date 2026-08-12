import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const supabase = createAdminClient()

  try {
    // Total rows in collection
    const { count: totalCards, error: countErr } = await supabase
      .from('user_copies')
      .select('*', { count: 'exact', head: true })

    if (countErr) throw countErr

    // Unique card names — count distinct user_cards entries
    const { count: uniqueNames, error: uniqueErr } = await supabase
      .from('user_cards')
      .select('*', { count: 'exact', head: true })

    if (uniqueErr) throw uniqueErr

    // Total copies = total rows in user_copies (each row is one physical copy)
    const totalCopies = totalCards ?? 0

    // Last import date from sync_meta
    const { data: metaRow } = await supabase
      .from('sync_meta')
      .select('value')
      .eq('key', 'last_collection_import')
      .single()

    const lastImportDate = metaRow?.value ?? null

    return Response.json({
      totalCards: totalCards ?? 0,
      uniqueNames,
      totalCopies,
      lastImportDate,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
