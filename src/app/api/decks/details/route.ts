import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { computeUnresolvedStatuses } from '@/lib/card-status'
import {
  computePipDistribution,
  computeUnresolvedCounts,
  fetchAllDeckCardRows,
  fetchManaCosts,
  isCountableCard,
} from '@/lib/deck-list-data'

/**
 * The slow numbers for the deck-list tiles: colour pips, and how many of each
 * deck's unresolved cards are available, claimed or unowned. Split from
 * GET /api/decks so the tiles show first and these fill in when this answers.
 */
export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const supabase = createAdminClient()
  const { rows, error } = await fetchAllDeckCardRows(supabase, userId)
  if (error) return Response.json({ error }, { status: 500 })

  const names = [...new Set(rows.map(r => r.card_name))]
  const unresolvedNames = [...new Set(
    rows.filter(r => r.copy_id == null && isCountableCard(r.categories)).map(r => r.card_name)
  )]

  const [manaCostMap, statusMap] = await Promise.all([
    names.length > 0 ? fetchManaCosts(supabase, names) : Promise.resolve(new Map<string, string>()),
    unresolvedNames.length > 0
      ? computeUnresolvedStatuses(unresolvedNames, userId)
      : Promise.resolve(new Map<string, 'available' | 'alternate' | 'claimed' | 'unowned' | 'failed'>()),
  ])

  return Response.json({
    pips: computePipDistribution(rows, manaCostMap),
    unresolved: computeUnresolvedCounts(rows, statusMap),
  })
}
