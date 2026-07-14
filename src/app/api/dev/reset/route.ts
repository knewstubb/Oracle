/**
 * POST /api/dev/reset
 *
 * DEV ONLY — Clears all user data for the authenticated user.
 * Deletes: deck_cards, decks, physical_copies, card_definitions, brew_sessions.
 * Does NOT delete the user account itself.
 */
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function POST() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const supabase = createAdminClient()
  const errors: string[] = []

  // Order matters — FK constraints require child tables first
  const tables = [
    'deck_cards',
    'deck_documentation',
    'decks',
    'physical_copies',
    'card_definitions',
    'brew_sessions',
  ]

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('user_id', userId)

    if (error) {
      errors.push(`${table}: ${error.message}`)
    }
  }

  if (errors.length > 0) {
    return Response.json({ success: false, errors }, { status: 500 })
  }

  return Response.json({ success: true, message: 'All user data cleared.' })
}
