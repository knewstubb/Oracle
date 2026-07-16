/**
 * POST /api/decks/create
 *
 * Creates a new empty deck with the specified format and commander (if applicable).
 * Used by the manual deck creation flow.
 *
 * Body: {
 *   name: string
 *   format: string (from format-config)
 *   commanderName?: string (required for Commander format)
 *   commanderScryfallId?: string
 *   colourIdentity?: string
 * }
 *
 * Returns: { deckId: number }
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: {
    name: string
    format: string
    commanderName?: string
    commanderScryfallId?: string
    colourIdentity?: string
  }

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name, format, commanderName, commanderScryfallId, colourIdentity } = body

  if (!name || !name.trim()) {
    return Response.json({ error: 'Deck name is required' }, { status: 400 })
  }

  if (!format) {
    return Response.json({ error: 'Format is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Generate a unique deck ID (decks table uses explicit IDs, not auto-increment)
  const deckId = Math.floor(Math.random() * 2147483647)

  const { data, error } = await supabase
    .from('decks')
    .insert({
      id: deckId,
      name: name.trim(),
      format,
      status: 'brew',
      allocate: false,
      commander_name: commanderName ?? null,
      commander_scryfall_id: commanderScryfallId ?? null,
      colour_identity: colourIdentity ?? null,
      card_count: 0,
      user_id: userId,
    })
    .select('id')
    .single()

  if (error) {
    return Response.json({ error: `Failed to create deck: ${error.message}` }, { status: 500 })
  }

  // If commander format, add the commander as the first deck_cards row
  if (commanderName && format === 'commander') {
    await supabase
      .from('deck_cards')
      .insert({
        deck_id: deckId,
        card_name: commanderName.trim(),
        scryfall_id: commanderScryfallId ?? null,
        quantity: 1,
        is_commander: true,
        user_id: userId,
      })

    // Update card count
    await supabase
      .from('decks')
      .update({ card_count: 1 })
      .eq('id', deckId)
  }

  return Response.json({ deckId: data.id })
}
