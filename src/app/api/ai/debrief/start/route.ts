import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { buildInvestigatorSystemPrompt } from '@/lib/debrief-prompts'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deckId } = body as { deckId: number }

    // Validate deckId is a positive integer
    if (!deckId || typeof deckId !== 'number' || !Number.isInteger(deckId) || deckId <= 0) {
      return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Verify deck exists
    const { data: deck, error: deckErr } = await supabase
      .from('decks')
      .select('id, name, commander_name')
      .eq('id', deckId)
      .single()

    if (deckErr || !deck) {
      return Response.json({ error: 'Deck not found' }, { status: 404 })
    }

    // Verify deck has cards
    const { data: cardCountData, error: cardCountErr } = await supabase
      .from('deck_cards')
      .select('quantity')
      .eq('deck_id', deckId)

    if (cardCountErr) {
      return Response.json({ error: cardCountErr.message }, { status: 500 })
    }

    const total = (cardCountData ?? []).reduce((sum, row) => sum + (row.quantity ?? 0), 0)
    if (total === 0) {
      return Response.json({ error: 'Deck has no cards' }, { status: 400 })
    }

    // Check no active session exists for this deck
    const { data: activeSession } = await supabase
      .from('debrief_sessions')
      .select('id')
      .eq('deck_id', deckId)
      .in('status', ['investigating', 'analysing'])
      .limit(1)
      .single()

    if (activeSession) {
      return Response.json(
        { error: 'Active debrief session exists for this deck' },
        { status: 409 }
      )
    }

    // Insert new session with status 'investigating'
    const { data: newSession, error: insertErr } = await supabase
      .from('debrief_sessions')
      .insert({
        deck_id: deckId,
        status: 'investigating',
        user_id: '00000000-0000-0000-0000-000000000000',
      })
      .select('id')
      .single()

    if (insertErr || !newSession) {
      return Response.json(
        { error: `Failed to create session: ${insertErr?.message || 'Unknown error'}` },
        { status: 500 }
      )
    }

    const sessionId = newSession.id

    // Generate first investigator message using buildInvestigatorSystemPrompt
    const commanderName = deck.commander_name || 'your commander'
    const _systemPrompt = buildInvestigatorSystemPrompt(commanderName, deck.name)

    const firstMessage = `Hey! I'd love to help you debrief your last game with ${commanderName}. How did things go — was it a win, a loss, or a draw? And what was the general vibe of the table?`

    return Response.json({ sessionId, firstMessage })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Failed to start debrief session: ${message}` },
      { status: 500 }
    )
  }
}
