/**
 * POST /api/allocation/resolve
 *
 * Redesigned in Phase 4: runs auto-assign for all Brew-stage decks' unresolved slots.
 * Only claims from free storage (Tier 1–2). Never clears existing assignments.
 * Never touches Boxed or Archived decks.
 *
 * Section 6f: "Becomes 'run auto-assign for all Brew-stage decks' unresolved slots,
 * free storage only,' never clearing existing assignments."
 */
import { requireAuth } from '@/lib/auth'
import { autoAssignAllBrewDecks } from '@/lib/auto-assign'

export async function POST() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  try {
    const summary = await autoAssignAllBrewDecks(userId)
    return Response.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[allocation/resolve] Auto-assign failed: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }
}
