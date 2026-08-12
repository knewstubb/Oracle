/**
 * GET /api/decks/[id]/build
 * 
 * Returns available builds for this deck's commander and detects the best match
 * based on the deck's current card list.
 * 
 * Response: {
 *   currentBuildId: string | null,
 *   detectedBuild: { id, archetype, theme, score } | null,
 *   availableBuilds: Array<{ id, archetype, theme, deckCount, deckPercentage }>
 * }
 * 
 * POST /api/decks/[id]/build
 * 
 * Sets the deck's build_id.
 * 
 * Body: { buildId: string | null }
 * Response: { success: true }
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

interface BuildCard {
  card_name: string
  synergy_score: number
  inclusion_rate: number
  is_signature: boolean
  is_staple: boolean
}

interface Build {
  id: string
  archetype: string | null
  theme: string | null
  edhrec_theme_slug: string
  deck_count: number
  deck_percentage: number
}

interface BuildMatch {
  id: string
  archetype: string | null
  theme: string | null
  score: number
  matchedCards: number
  totalBuildCards: number
}

/**
 * Detect the best matching build for a deck based on card overlap.
 * 
 * Scoring:
 * - Each card in the deck that appears in the build's card list adds to the score
 * - Signature cards (high synergy + high inclusion) are weighted 3x
 * - Staple cards (>50% inclusion) are weighted 1.5x
 * - Regular cards are weighted 1x
 * - Final score is normalized to 0-100 based on % of deck covered
 */
async function detectBuild(
  supabase: ReturnType<typeof createAdminClient>,
  commanderId: string,
  deckCardNames: string[]
): Promise<BuildMatch | null> {
  // Get all builds for this commander
  const { data: builds } = await supabase
    .from('ref_commander_builds')
    .select('id, archetype, theme, edhrec_theme_slug, deck_count')
    .eq('commander_id', commanderId)
    .order('deck_count', { ascending: false })

  if (!builds || builds.length === 0) return null

  const deckCards = new Set(deckCardNames.map(n => n.toLowerCase()))
  let bestMatch: BuildMatch | null = null

  for (const build of builds) {
    // Get cards for this build
    const { data: buildCards } = await supabase
      .from('ref_build_cards')
      .select('card_name, synergy_score, inclusion_rate, is_signature, is_staple')
      .eq('build_id', build.id)

    if (!buildCards || buildCards.length === 0) continue

    let score = 0
    let matchedCards = 0

    for (const card of buildCards) {
      if (deckCards.has(card.card_name.toLowerCase())) {
        matchedCards++
        // Weight signature cards highest, staples medium, regular cards base
        if (card.is_signature) {
          score += 3
        } else if (card.is_staple) {
          score += 1.5
        } else {
          score += 1
        }
      }
    }

    // Normalize: score as percentage of deck size that matches weighted build cards
    // A perfect match would be ~30-40% of the deck (60-70% is lands/staples shared across builds)
    const normalizedScore = Math.min(100, Math.round((matchedCards / deckCards.size) * 250))

    if (!bestMatch || normalizedScore > bestMatch.score) {
      bestMatch = {
        id: build.id,
        archetype: build.archetype,
        theme: build.theme,
        score: normalizedScore,
        matchedCards,
        totalBuildCards: buildCards.length,
      }
    }
  }

  // Only return if we have a reasonable match (>30% confidence)
  if (bestMatch && bestMatch.score < 30) {
    return null
  }

  return bestMatch
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const deckId = parseInt(id, 10)

  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Get deck with commander info
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, build_id, commander_name')
    .eq('id', deckId)
    .eq('user_id', userId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  // Get commander ID from ref_commanders
  const { data: commander } = await supabase
    .from('ref_commanders')
    .select('id')
    .eq('display_name', deck.commander_name)
    .maybeSingle()

  if (!commander) {
    // Commander not in our database — no builds available
    return Response.json({
      currentBuildId: deck.build_id,
      detectedBuild: null,
      availableBuilds: [],
    })
  }

  // Get available builds for this commander
  const { data: builds } = await supabase
    .from('ref_commander_builds')
    .select('id, archetype, theme, edhrec_theme_slug, deck_count, deck_percentage')
    .eq('commander_id', commander.id)
    .order('deck_count', { ascending: false })

  // Get deck cards for detection
  const { data: deckCards } = await supabase
    .from('deck_cards')
    .select('card_name')
    .eq('deck_id', deckId)
    .eq('is_commander', false)

  const cardNames = (deckCards ?? []).map(c => c.card_name)

  // Detect best match if deck has cards
  let detectedBuild: BuildMatch | null = null
  if (cardNames.length > 5) {
    detectedBuild = await detectBuild(supabase, commander.id, cardNames)
  }

  return Response.json({
    currentBuildId: deck.build_id,
    detectedBuild,
    availableBuilds: (builds ?? []).map(b => ({
      id: b.id,
      archetype: b.archetype,
      theme: b.theme,
      slug: b.edhrec_theme_slug,
      deckCount: b.deck_count,
      deckPercentage: b.deck_percentage,
    })),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const deckId = parseInt(id, 10)

  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  let body: { buildId: string | null }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify deck belongs to user
  const { data: deck } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  // Update build_id
  const { error: updateErr } = await supabase
    .from('decks')
    .update({ build_id: body.buildId })
    .eq('id', deckId)

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  return Response.json({ success: true })
}
