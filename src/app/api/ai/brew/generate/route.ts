// ---------------------------------------------------------------------------
// POST /api/ai/brew/generate
// Generate 100-card skeleton using Heavy Model + data sources
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { buildSkeletonGenerationPrompt } from '@/lib/brew-prompts'
import type { BrewSessionRow, StrategyBrief, DeckSkeleton } from '@/types/brew'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollectionRow {
  card_name: string
  quantity: number
}

interface DeckCardRow {
  card_name: string
  deck_id: number
}

interface DeckNameRow {
  id: number
  name: string
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = await request.json()
    const { sessionId } = body as { sessionId: number }

    // --- Validate sessionId ---
    if (!sessionId || typeof sessionId !== 'number' || !Number.isInteger(sessionId) || sessionId <= 0) {
      return Response.json({ error: 'Invalid session ID' }, { status: 400 })
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

    if (session.status !== 'generating') {
      return Response.json(
        { error: `Session is in '${session.status}', expected 'generating'` },
        { status: 409 }
      )
    }

    if (!session.brief_json) {
      return Response.json({ error: 'No strategy brief found' }, { status: 400 })
    }

    // --- Parse brief ---
    const brief: StrategyBrief = JSON.parse(session.brief_json)

    // --- Query data sources ---

    // 1. EDHREC staples (placeholder — no MCP in API routes yet)
    const edhrecStaples = getPlaceholderEdhrecStaples(brief.commanderName)

    // 2. Query user collection filtered by colour identity
    const collectionCards = await queryCollectionByColourIdentity(brief.colourIdentity)

    // 3. Scryfall fill candidates (placeholder — no MCP in API routes yet)
    const scryfallFills = getPlaceholderScryfallFills(brief)

    // --- Call Heavy Model ---
    const prompt = buildSkeletonGenerationPrompt(brief, edhrecStaples, collectionCards, scryfallFills)
    const anthropic = new Anthropic()

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    // --- Parse skeleton from response ---
    const skeleton = parseSkeleton(responseText)

    if (!skeleton) {
      return Response.json(
        { error: 'Failed to parse skeleton from model response' },
        { status: 500 }
      )
    }

    // --- Validate card count ---
    const totalCards = skeleton.categories.reduce((sum, cat) => sum + cat.cards.length, 0)
    if (totalCards !== 100) {
      // Attempt to fix by adjusting totalCards field but still return
      skeleton.totalCards = totalCards
      console.warn(`[brew/generate] Skeleton has ${totalCards} cards instead of 100`)
    }

    // --- Annotate cards with ownership and proxy conflicts ---
    await annotateSkeleton(skeleton)

    // --- Sort within each category: owned → proxy_candidate → not_owned ---
    for (const category of skeleton.categories) {
      category.cards.sort((a, b) => {
        const order = { owned: 0, proxy_candidate: 1, not_owned: 2 }
        return order[a.ownershipStatus] - order[b.ownershipStatus]
      })
    }

    // --- Store skeleton and transition to 'refining' ---
    await supabase
      .from('brew_sessions')
      .update({ skeleton_json: JSON.stringify(skeleton), status: 'refining', updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    return Response.json({ skeleton })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Failed to generate skeleton: ${message}` },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// Data source helpers
// ---------------------------------------------------------------------------

/**
 * Query the user's collection filtered by colour identity.
 * Returns cards where the card's colour identity is a subset of the commander's.
 */
async function queryCollectionByColourIdentity(
  commanderCI: string[]
): Promise<Array<{ cardName: string; owned: boolean }>> {
  try {
    const supabase = createAdminClient()
    const { data: rows, error } = await supabase
      .from('collection')
      .select('card_name, quantity')
      .limit(200)

    if (error || !rows) return []

    return rows.map(row => ({
      cardName: row.card_name,
      owned: (row.quantity ?? 0) > 0,
    }))
  } catch {
    return []
  }
}

/**
 * Placeholder EDHREC staples until MCP integration is added.
 */
function getPlaceholderEdhrecStaples(
  _commanderName: string
): Array<{ cardName: string; synergy: number }> {
  // Return empty — the model has inherent knowledge of Commander staples
  // Real implementation will query EDHREC MCP tool
  return []
}

/**
 * Placeholder Scryfall fill candidates until MCP integration is added.
 */
function getPlaceholderScryfallFills(
  _brief: StrategyBrief
): Array<{ cardName: string; price: number }> {
  // Return empty — the model has inherent knowledge of available cards
  // Real implementation will query Scryfall MCP tool
  return []
}

// ---------------------------------------------------------------------------
// Skeleton parsing and annotation
// ---------------------------------------------------------------------------

/**
 * Parse a DeckSkeleton from model JSON response.
 */
function parseSkeleton(text: string): DeckSkeleton | null {
  try {
    // Try code block first
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
    const jsonStr = codeBlockMatch ? codeBlockMatch[1] : text

    // Find JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*"categories"[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    // Validate basic structure
    if (!parsed.commanderName || !Array.isArray(parsed.categories)) return null

    // Normalise the skeleton
    const skeleton: DeckSkeleton = {
      commanderName: parsed.commanderName,
      colourIdentity: Array.isArray(parsed.colourIdentity) ? parsed.colourIdentity : [],
      totalCards: typeof parsed.totalCards === 'number' ? parsed.totalCards : 100,
      categories: parsed.categories.map((cat: Record<string, unknown>) => ({
        name: String(cat.name || 'Unknown'),
        cards: Array.isArray(cat.cards)
          ? (cat.cards as Array<Record<string, unknown>>).map(card => ({
              cardName: String(card.cardName || ''),
              ownershipStatus: ['owned', 'proxy_candidate', 'not_owned'].includes(String(card.ownershipStatus))
                ? String(card.ownershipStatus)
                : 'not_owned',
              price: typeof card.price === 'number' ? card.price : null,
              proxyConflict: card.proxyConflict || undefined,
              overBudget: Boolean(card.overBudget),
              accepted: false,
            }))
          : [],
      })),
    }

    return skeleton
  } catch {
    return null
  }
}

/**
 * Annotate skeleton cards with ownership status and proxy conflicts from the database.
 */
async function annotateSkeleton(skeleton: DeckSkeleton): Promise<void> {
  try {
    const supabase = createAdminClient()

    // Get all cards in other decks for proxy conflict detection
    const { data: deckCards } = await supabase.from('deck_cards').select('card_name, deck_id')
    const { data: deckNames } = await supabase.from('decks').select('id, name')

    const deckNameMap = new Map((deckNames ?? []).map(d => [d.id, d.name]))
    const cardDeckMap = new Map<string, { deckName: string; deckId: number }>()

    for (const dc of deckCards ?? []) {
      const name = dc.card_name.toLowerCase()
      if (!cardDeckMap.has(name)) {
        cardDeckMap.set(name, {
          deckName: deckNameMap.get(dc.deck_id) || 'Unknown Deck',
          deckId: dc.deck_id,
        })
      }
    }

    // Check collection for ownership
    let collectionMap: Map<string, number>
    try {
      const { data: collectionRows } = await supabase.from('collection').select('card_name, quantity')
      collectionMap = new Map((collectionRows ?? []).map(r => [r.card_name.toLowerCase(), r.quantity ?? 0]))
    } catch {
      collectionMap = new Map()
    }

    // Annotate each card
    for (const category of skeleton.categories) {
      for (const card of category.cards) {
        const cardNameLower = card.cardName.toLowerCase()

        // Ownership status
        const ownedQty = collectionMap.get(cardNameLower) || 0
        if (ownedQty > 0) {
          // Check if already used in another deck (proxy candidate)
          if (cardDeckMap.has(cardNameLower)) {
            card.ownershipStatus = 'proxy_candidate'
            card.proxyConflict = cardDeckMap.get(cardNameLower)
          } else {
            card.ownershipStatus = 'owned'
          }
        } else {
          card.ownershipStatus = 'not_owned'
        }
      }
    }
  } catch {
    // If annotation fails, leave ownership as model-provided
    console.warn('[brew/generate] Annotation failed — using model-provided ownership')
  }
}
