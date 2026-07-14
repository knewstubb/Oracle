// ---------------------------------------------------------------------------
// POST /api/ai/brew/save
// Save the finalised skeleton as a new deck
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
import type { BrewSessionRow, DeckSkeleton, StrategyBrief } from '@/types/brew'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SaveBody {
  sessionId: number
  deckName: string
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
    const { sessionId, deckName } = body

    // --- Validate inputs ---
    if (!sessionId || typeof sessionId !== 'number') {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 })
    }
    if (!deckName || typeof deckName !== 'string' || deckName.trim().length === 0) {
      return Response.json({ error: 'deckName is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // --- Load session ---
    const { data: session, error: fetchErr } = await supabase
      .from('brew_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (fetchErr || !session) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.status !== 'refining') {
      return Response.json(
        { error: `Session is in '${session.status}', expected 'refining'` },
        { status: 409 }
      )
    }

    if (!session.skeleton_json) {
      return Response.json({ error: 'No skeleton to save' }, { status: 400 })
    }

    // --- Parse skeleton and validate ---
    const skeleton: DeckSkeleton = JSON.parse(session.skeleton_json)
    const totalCards = skeleton.categories.reduce((sum, cat) => sum + cat.cards.length, 0)

    if (totalCards !== 100) {
      return Response.json(
        { error: `Skeleton has ${totalCards} cards, expected 100` },
        { status: 400 }
      )
    }

    // --- Transition to 'saving' ---
    await supabase
      .from('brew_sessions')
      .update({ status: 'saving', updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    // --- Create deck + deck_cards ---
    let deckId: number

    try {
      // INSERT into decks — use a generated ID since brew decks are Oracle-native
      // Generate a unique ID for Oracle-native decks (Archidekt uses their own IDs)
      const generatedId = Date.now()
      const { data: deckData, error: deckErr } = await supabase
        .from('decks')
        .insert({
          id: generatedId,
          name: deckName.trim(),
          commander_name: skeleton.commanderName,
          colour_identity: skeleton.colourIdentity.join(','),
          user_id: userId,
          status: 'brew',
        })
        .select('id')
        .single()

      if (deckErr || !deckData) {
        throw new Error(deckErr?.message || 'Failed to create deck')
      }

      deckId = deckData.id

      // INSERT all skeleton cards into deck_cards
      const cardInserts = skeleton.categories.flatMap(category =>
        category.cards.map(card => ({
          deck_id: deckId,
          card_name: card.cardName,
          quantity: 1,
          categories: category.name,
          is_commander: card.cardName.toLowerCase() === skeleton.commanderName.toLowerCase(),
          user_id: userId,
        }))
      )

      // Insert in batches of 100
      for (let i = 0; i < cardInserts.length; i += 100) {
        const batch = cardInserts.slice(i, i + 100)
        const { error: cardErr } = await supabase.from('deck_cards').insert(batch)
        if (cardErr) throw new Error(cardErr.message)
      }

      // Update brew_sessions with deck_id
      await supabase
        .from('brew_sessions')
        .update({ deck_id: deckId })
        .eq('id', sessionId)
    } catch (txErr) {
      // Rollback: keep session in 'refining' so user can retry
      await supabase
        .from('brew_sessions')
        .update({ status: 'refining', updated_at: new Date().toISOString() })
        .eq('id', sessionId)

      const message = txErr instanceof Error ? txErr.message : 'Transaction failed'
      return Response.json(
        { error: `Save failed: ${message}` },
        { status: 500 }
      )
    }

    // --- Non-blocking: Section 6e Auto-assign from free storage (Tier 1–2 only) ---
    try {
      const { autoAssignDeck } = await import('@/lib/auto-assign')
      await autoAssignDeck(deckId!, userId)
    } catch (allocErr) {
      console.warn(
        '[brew/save] Auto-assign failed (non-blocking):',
        allocErr instanceof Error ? allocErr.message : allocErr
      )
    }

    // --- Non-blocking: Auto-populate Strategy Canvas ---
    try {
      const brief: StrategyBrief | null = session.brief_json ? JSON.parse(session.brief_json) : null
      if (brief) {
        await populateStrategyCanvas(deckId!, brief)
      }
    } catch (canvasErr) {
      console.warn(
        '[brew/save] Strategy canvas population failed (non-blocking):',
        canvasErr instanceof Error ? canvasErr.message : canvasErr
      )
    }

    // --- Transition to 'complete' ---
    await supabase
      .from('brew_sessions')
      .update({ status: 'complete', updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    return Response.json({ deckId: deckId! })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Failed to save deck: ${message}` },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// Strategy Canvas helper
// ---------------------------------------------------------------------------

/**
 * Auto-populate the strategy canvas from the Strategy Brief.
 * Writes primary win condition, bracket, and playstyle to the deck's strategy fields.
 */
async function populateStrategyCanvas(deckId: number, brief: StrategyBrief): Promise<void> {
  // Check if strategy table/columns exist — gracefully skip if not
  try {
    const supabase = createAdminClient()
    const strategyData = JSON.stringify({
      primaryWinCondition: brief.primaryWinCondition,
      secondaryWinCondition: brief.secondaryWinCondition,
      targetBracket: brief.targetBracket,
      playstyleDescription: brief.playstyleDescription,
      knownIncludes: brief.knownIncludes,
      budgetPreference: brief.budgetPreference,
    })

    // Try to update strategy_json if the column exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('decks') as any)
      .update({ strategy_json: strategyData })
      .eq('id', deckId)
  } catch {
    // strategy_json column may not exist yet — that's fine
    console.warn('[brew/save] strategy_json column not found — skipping canvas population')
  }
}
