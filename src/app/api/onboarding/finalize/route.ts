/**
 * POST /api/onboarding/finalize
 *
 * Called when the user finishes the import (Go to Decks). Runs the single
 * finalize pass: for every card where owned real copies cover the sleeved
 * demand, assigns distinct owned copies to the claimed slots (retagging the
 * slot printing to the owned copy) and clears those claims. Cards still
 * over-allocated keep their claims (unresolved).
 */
import { requireAuth } from '@/lib/auth'
import { finalizeImportClaims } from '@/lib/import-sleeve-claims'

export async function POST() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  try {
    await finalizeImportClaims(userId)
    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
