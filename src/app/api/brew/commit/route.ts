import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import type { CommittedCommander } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// GUARD: This route participates in Oracle-native deck creation (brew flow).
// It MUST NOT import or invoke any Archidekt client functions (fetchDeck,
// fetchUserDecks, updateProxyTags, createDeck) or Playwright automation.
// Pushing to Archidekt is exclusively handled by POST /api/decks/[id]/push.
// See: deck-authority-split spec, Requirements 5.1, 5.2, 5.4.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Scryfall Types (minimal — only what we need for validation)
// ---------------------------------------------------------------------------

interface ScryfallCard {
  id: string
  name: string
  type_line: string
  color_identity: string[]
  legalities: Record<string, string>
  image_uris?: { art_crop?: string; normal?: string }
  card_faces?: Array<{ image_uris?: { art_crop?: string; normal?: string } }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetches a card from Scryfall by name or ID.
 * Respects Scryfall's rate-limit guidelines (50ms delay between calls).
 */
async function fetchFromScryfall(
  commanderName: string,
  scryfallId?: string
): Promise<ScryfallCard | null> {
  const url = scryfallId
    ? `https://api.scryfall.com/cards/${encodeURIComponent(scryfallId)}`
    : `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(commanderName)}`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'The-Oracle/1.0' },
  })

  if (!res.ok) return null
  return res.json() as Promise<ScryfallCard>
}

/**
 * Determines whether a Scryfall card is legal as a commander.
 * A card can be a commander if:
 * 1. It is legal/restricted in the commander format, AND
 * 2. Its type line includes "Legendary Creature" or it has explicit commander
 *    permission text (e.g. "can be your commander").
 */
function isLegalCommander(card: ScryfallCard): boolean {
  const legality = card.legalities?.commander
  if (legality !== 'legal' && legality !== 'restricted') return false

  const typeLine = card.type_line.toLowerCase()
  // Standard legendary creature check
  if (typeLine.includes('legendary') && typeLine.includes('creature')) return true
  // Planeswalker commanders (some have "can be your commander" text)
  if (typeLine.includes('legendary') && typeLine.includes('planeswalker')) return true

  return false
}

/**
 * Extracts the best art URL from a Scryfall card object.
 */
function getArtUrl(card: ScryfallCard): string {
  if (card.image_uris?.art_crop) return card.image_uris.art_crop
  if (card.card_faces?.[0]?.image_uris?.art_crop) return card.card_faces[0].image_uris.art_crop
  if (card.image_uris?.normal) return card.image_uris.normal
  if (card.card_faces?.[0]?.image_uris?.normal) return card.card_faces[0].image_uris.normal
  return ''
}

// ---------------------------------------------------------------------------
// POST /api/brew/commit
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const supabase = createAdminClient()

  // --- Parse and validate request body ---
  let body: { sessionId: number; commanderName: string; scryfallId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { sessionId, commanderName, scryfallId } = body

  if (!sessionId || typeof sessionId !== 'number') {
    return Response.json({ error: 'sessionId is required and must be a number' }, { status: 400 })
  }
  if (!commanderName || typeof commanderName !== 'string' || !commanderName.trim()) {
    return Response.json({ error: 'commanderName is required' }, { status: 400 })
  }

  // --- Verify session exists and is in exploring phase ---
  const { data: session, error: sessErr } = await supabase
    .from('brew_sessions')
    .select('id, status, decision_log_json')
    .eq('id', sessionId)
    .single()

  if (sessErr || !session) {
    return Response.json({ error: 'Brew session not found' }, { status: 404 })
  }

  if (session.status !== 'exploring') {
    return Response.json(
      { error: `Session is in '${session.status}' phase; commit is only valid during 'exploring'` },
      { status: 400 }
    )
  }

  // --- Validate commander against Scryfall ---
  const card = await fetchFromScryfall(commanderName.trim(), scryfallId)

  if (!card) {
    return Response.json(
      { error: `Commander "${commanderName}" not found on Scryfall` },
      { status: 400 }
    )
  }

  if (!isLegalCommander(card)) {
    return Response.json(
      { error: `"${card.name}" is not legal as a commander` },
      { status: 400 }
    )
  }

  // --- Derive archetype from decision log ---
  let archetype: string | null = null
  try {
    const decisionLog = JSON.parse(session.decision_log_json || '{}')
    const strategyEntries = decisionLog.strategy || []
    const archetypeEntry = strategyEntries.find(
      (entry: { key: string }) => entry.key?.toUpperCase() === 'ARCHETYPE'
    )
    if (archetypeEntry) {
      archetype = archetypeEntry.value
    }
  } catch {
    // If decision log is malformed, proceed without archetype
  }

  // --- Build committed commander data ---
  const colourIdentity = card.color_identity || []
  const committedCommander: CommittedCommander = {
    name: card.name,
    artUrl: getArtUrl(card),
    typeLine: card.type_line,
    colourIdentity,
    archetype,
  }

  // --- Update session: transition to building phase ---
  await supabase
    .from('brew_sessions')
    .update({
      status: 'building',
      commander_name: card.name,
      colour_identity: colourIdentity.join(''),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)

  return Response.json({
    success: true,
    commander: committedCommander,
  })
}
