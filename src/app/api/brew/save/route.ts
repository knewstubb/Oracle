// ---------------------------------------------------------------------------
// POST /api/brew/save
// Save a brew session as concept, draft, or active deck
//
// GUARD: This route creates Oracle-native decks. It MUST NOT import or invoke
// any Archidekt client functions (fetchDeck, fetchUserDecks, updateProxyTags,
// createDeck) or Playwright automation. Pushing to Archidekt is exclusively
// handled by the Manual Push route: POST /api/decks/[id]/push.
// See: deck-authority-split spec, Requirements 5.1, 5.2, 5.4.
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import type { DecisionLog, DeckCard } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SaveBody {
  sessionId: number
  mode: 'concept' | 'brewing' | 'in_rotation'
  decisionLog?: DecisionLog
  deckCards?: DeckCard[]
  deckName?: string
}

interface BrewSessionRow {
  id: number
  deck_id: number | null
  status: string
  commander_name: string | null
  colour_identity: string | null
  decision_log_json: string | null
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  try {
    const body = (await request.json()) as SaveBody
    const { sessionId, mode, decisionLog, deckCards, deckName } = body

    // --- Validate inputs ---
    if (!sessionId || typeof sessionId !== 'number') {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 })
    }

    if (!mode || !['concept', 'brewing', 'in_rotation'].includes(mode)) {
      return Response.json(
        { error: 'Invalid mode — must be "concept", "brewing", or "in_rotation"' },
        { status: 400 }
      )
    }

    if ((mode === 'brewing' || mode === 'in_rotation') && (!deckCards || !Array.isArray(deckCards))) {
      return Response.json(
        { error: 'deckCards array is required for brew and boxed modes' },
        { status: 400 }
      )
    }

    if ((mode === 'brewing' || mode === 'in_rotation') && (!deckName || typeof deckName !== 'string' || deckName.trim().length === 0)) {
      return Response.json(
        { error: 'deckName is required for brew and boxed modes' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // --- Load session ---
    const { data: session, error: fetchErr } = await supabase
      .from('brew_sessions')
      .select('id, deck_id, status, commander_name, colour_identity, decision_log_json')
      .eq('id', sessionId)
      .single()

    if (fetchErr || !session) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    // --- Validate mode matches session phase ---
    if (mode === 'concept' && session.status !== 'exploring') {
      return Response.json(
        { error: `Cannot save as concept — session is in '${session.status}', expected 'exploring'` },
        { status: 409 }
      )
    }

    if ((mode === 'brewing' || mode === 'in_rotation') && session.status !== 'building') {
      return Response.json(
        { error: `Cannot save as ${mode} — session is in '${session.status}', expected 'building'` },
        { status: 409 }
      )
    }

    // --- Handle each mode ---
    let deckId: number | undefined

    if (mode === 'concept') {
      // Save decision log to session, keep status 'exploring'
      const logJson = decisionLog
        ? JSON.stringify(decisionLog)
        : session.decision_log_json ?? '{"strategy":[],"parameters":[],"constraints":[]}'

      await supabase
        .from('brew_sessions')
        .update({ decision_log_json: logJson, updated_at: new Date().toISOString() })
        .eq('id', sessionId)

      return Response.json({ success: true })
    }

    if (mode === 'brewing' || mode === 'in_rotation') {
      const deckStatus = mode === 'in_rotation' ? 'in_rotation' : 'brewing'

      try {
        if (session.deck_id) {
          // Update existing deck
          deckId = session.deck_id

          await supabase
            .from('decks')
            .update({ name: deckName!.trim(), status: deckStatus, card_count: deckCards!.length })
            .eq('id', deckId)

          // Clear existing deck_cards and re-insert
          await supabase.from('deck_cards').delete().eq('deck_id', deckId)
        } else {
          // Create new deck — generate a unique ID for Oracle-native decks
          // Using negative IDs to avoid collision with Archidekt-sourced IDs (positive integers)
          const oracleId = -(Date.now() % 2147483647)

          const { data: newDeck, error: deckErr } = await supabase
            .from('decks')
            .insert({
              id: oracleId,
              name: deckName!.trim(),
              commander_name: session.commander_name,
              colour_identity: session.colour_identity,
              card_count: deckCards!.length,
              status: deckStatus,
              user_id: userId,
            })
            .select('id')
            .single()

          if (deckErr || !newDeck) throw new Error(deckErr?.message || 'Failed to create deck')
          deckId = newDeck.id

          // Link session to new deck
          await supabase
            .from('brew_sessions')
            .update({ deck_id: deckId })
            .eq('id', sessionId)
        }

        // Insert deck cards
        const cardsToInsert = deckCards!.map((card) => {
          const categories = [card.primary_category, ...card.additional_categories].join(',')
          const isCommander = session.commander_name
            ? card.card_name.toLowerCase() === session.commander_name.toLowerCase()
            : false
          return {
            deck_id: deckId!,
            card_name: card.card_name,
            quantity: 1,
            categories,
            is_commander: isCommander,
            user_id: userId,
          }
        })

        if (cardsToInsert.length > 0) {
          const { error: insertErr } = await supabase.from('deck_cards').insert(cardsToInsert)
          if (insertErr) throw new Error(insertErr.message)
        }

        // Update session status
        const newSessionStatus = mode === 'in_rotation' ? 'complete' : 'building'
        await supabase
          .from('brew_sessions')
          .update({ status: newSessionStatus, updated_at: new Date().toISOString() })
          .eq('id', sessionId)
      } catch (txErr) {
        const message = txErr instanceof Error ? txErr.message : 'Transaction failed'
        return Response.json(
          { error: `Save failed: ${message}` },
          { status: 500 }
        )
      }

      return Response.json({ success: true, deckId })
    }

    // Should not reach here given validation above
    return Response.json({ error: 'Unhandled mode' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[brew/save] Unexpected error: ${message}`)
    return Response.json(
      { error: `Failed to save: ${message}` },
      { status: 500 }
    )
  }
}
