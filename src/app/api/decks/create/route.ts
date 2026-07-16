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

  const { data, error } = await supabase
    .from('decks')
    .insert({
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

  return Response.json({ deckId: data.id })
}
