/**
 * GET /api/sync
 *
 * DECK AUTHORITY SPLIT: This route ONLY imports new decks (decks on Archidekt
 * that have no corresponding row in Oracle's `decks` table) and syncs
 * collection data. Previously-imported decks are NEVER re-fetched or overwritten.
 *
 * To re-import a specific deck, use POST /api/decks/[id]/reimport with confirmation.
 *
 * Validates: Requirements 1.4, 6.1, 6.2, 6.4, 7.4
 */
import { syncNewDecksOnly } from '@/lib/sync'

export async function GET() {
  try {
    const results = await syncNewDecksOnly()
    return Response.json(results)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
