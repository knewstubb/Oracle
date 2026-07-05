import { createServerClient } from '@/lib/supabase'

/**
 * GET /api/shared-cards/allocations
 *
 * Returns all tracked allocations from proxy_allocations table,
 * joined with deck names and written/unwritten status.
 */
export async function GET() {
  try {
    const supabase = createServerClient()

    const { data: rows, error } = await supabase
      .from('proxy_allocations')
      .select(`
        card_name,
        deck_id,
        role,
        written_to_archidekt,
        written_at,
        assigned_at,
        decks!inner ( name )
      `)
      .order('card_name')

    if (error) throw error

    const allocations = (rows || []).map((row) => {
      const deckInfo = row.decks as unknown as { name: string }
      return {
        cardName: row.card_name,
        deckId: row.deck_id,
        deckName: deckInfo?.name || '',
        role: row.role,
        writtenToArchidekt: Boolean(row.written_to_archidekt),
        writtenAt: row.written_at,
        assignedAt: row.assigned_at,
      }
    })

    // Sort by deck name within each card
    allocations.sort((a, b) => {
      const nameCompare = a.cardName.localeCompare(b.cardName)
      if (nameCompare !== 0) return nameCompare
      return a.deckName.localeCompare(b.deckName)
    })

    return Response.json({ allocations })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[allocations] Error: ${message}`)
    return Response.json(
      { allocations: [], error: `Unexpected error: ${message}` },
      { status: 500 }
    )
  }
}
