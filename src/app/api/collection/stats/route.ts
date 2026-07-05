import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const supabase = createAdminClient()

  try {
    // Total rows in collection
    const { count: totalCards, error: countErr } = await supabase
      .from('collection')
      .select('*', { count: 'exact', head: true })

    if (countErr) throw countErr

    // Unique card names — fetch distinct card_name column
    const { data: uniqueData, error: uniqueErr } = await supabase
      .from('collection')
      .select('card_name')

    if (uniqueErr) throw uniqueErr

    const uniqueNames = new Set((uniqueData || []).map((r) => r.card_name)).size

    // Total copies (sum of quantity)
    const { data: quantityData, error: qtyErr } = await supabase
      .from('collection')
      .select('quantity')

    if (qtyErr) throw qtyErr

    const totalCopies = (quantityData || []).reduce(
      (sum, row) => sum + (row.quantity ?? 0),
      0
    )

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
