/**
 * POST /api/onboarding/collection
 *
 * Warm-start Phase 1: Imports the user's full Archidekt collection.
 * Must complete BEFORE any deck import/resolution.
 *
 * Returns: CollectionImportResult
 */
import { requireAuth } from '@/lib/auth'
import { importArchidektCollection } from '@/lib/warm-start-import'

// Allow up to 120s for this function (collection has ~2900 entries at 25/page = 116 pages)
export const maxDuration = 120

export async function POST() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  try {
    const result = await importArchidektCollection(userId)
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Surface privacy errors as 403 with a clear message
    if (message.includes('private') || message.includes('Public')) {
      return Response.json({ error: message }, { status: 403 })
    }
    console.error('[onboarding/collection] Import failed:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
