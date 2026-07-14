import { createAdminClient } from '@/lib/supabase'
import { fetchDeck } from '@/lib/archidekt-client'
import { importDeck } from '@/lib/deck-import-legacy'
import { requireAuth } from '@/lib/auth'
import { NextRequest } from 'next/server'

interface ReimportRequest {
  confirmed: boolean
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const deckId = parseInt(id, 10)

  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Validate that the deck exists and was previously imported
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, name, last_synced_at')
    .eq('id', deckId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: `Database error: ${deckErr.message}` }, { status: 500 })
  }

  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  if (!deck.last_synced_at) {
    return Response.json(
      { error: 'Deck has not been previously imported from Archidekt. Use the import flow instead.' },
      { status: 400 }
    )
  }

  // Parse and validate request body
  let body: ReimportRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Confirmation gate: return 409 if not confirmed
  if (body.confirmed !== true) {
    return Response.json(
      {
        requiresConfirmation: true,
        warning: `Re-importing "${deck.name}" will overwrite all local edits (card changes, proxy allocations, printing selections, categories) with the current Archidekt version. This cannot be undone.`,
      },
      { status: 409 }
    )
  }

  // Confirmed: fetch from Archidekt and re-import
  try {
    const archidektDeck = await fetchDeck(deckId)
    await importDeck(archidektDeck, authResult.id)

    return Response.json({
      success: true,
      deck: {
        id: deckId,
        name: archidektDeck.name,
        cardCount: archidektDeck.cards.length,
        reimportedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    return Response.json(
      {
        error: 'Re-import failed',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    )
  }
}
