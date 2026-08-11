// ---------------------------------------------------------------------------
// POST /api/ai/brew/generate
// Generate 100-card skeleton using Heavy Model + grounded data sources
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { buildSkeletonGenerationPrompt } from '@/lib/brew-prompts'
import type { StrategyBrief, DeckSkeleton } from '@/types/brew'

// Data layers for grounded card pools
import {
  getBuildsByCommander,
  getCardPoolForBuild,
  formatBuildCardsForPrompt,
  type BuildCard,
} from '@/lib/commander-build-data'
import {
  getCardsForAllSlots,
  getCardsByArchetype,
  formatSlotsForPrompt,
  ARCHETYPE_SLOTS,
} from '@/lib/scryfall-tags-data'
import {
  getBrewContext,
  findArchetypeForStrategy,
} from '@/lib/knowledge-data'

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

    // --- Query grounded data sources ---

    // 1. Load EDHREC build cards from ref_build_cards
    const edhrecData = await loadEdhrecBuildCards(brief.commanderName, brief)

    // 2. Query user collection filtered by colour identity
    const collectionCards = await queryCollectionByColourIdentity(brief.colourIdentity)

    // 3. Load Scryfall tagged cards for functional slots
    const scryfallSlots = await loadScryfallSlotCandidates(brief)

    // 4. Load knowledge context (archetype guide, deck fundamentals)
    const knowledgeContext = loadKnowledgeContext(brief)

    // --- Call Heavy Model with grounded prompt ---
    const prompt = buildSkeletonGenerationPrompt(
      brief,
      edhrecData.staples,
      collectionCards,
      edhrecData.fills,
      {
        knowledgeContext,
        scryfallSlots,
        cardPoolForSelection: edhrecData.cardPool,
      }
    )
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
 * Load EDHREC build cards from ref_build_cards database.
 * Returns staples (high inclusion), signature cards, and full card pool.
 */
async function loadEdhrecBuildCards(
  commanderName: string,
  brief: StrategyBrief
): Promise<{
  staples: Array<{ cardName: string; synergy: number }>
  fills: Array<{ cardName: string; price: number }>
  cardPool: string[]
}> {
  try {
    // Find builds for this commander
    const builds = await getBuildsByCommander(commanderName)

    if (builds.length === 0) {
      console.warn(`[brew/generate] No EDHREC builds found for ${commanderName}`)
      return { staples: [], fills: [], cardPool: [] }
    }

    // Try to match build to brief's strategy
    const bestBuild = findBestMatchingBuild(builds, brief)
    const buildId = bestBuild?.id ?? builds[0].id

    // Get full card pool for this build
    const cardPool = await getCardPoolForBuild(buildId)

    // Separate into staples (high inclusion) and fills (lower inclusion)
    const staples: Array<{ cardName: string; synergy: number }> = []
    const fills: Array<{ cardName: string; price: number }> = []

    for (const card of cardPool) {
      if (card.inclusionRate >= 50 || card.synergyScore >= 30) {
        staples.push({
          cardName: card.cardName,
          synergy: Math.round(card.synergyScore),
        })
      } else {
        fills.push({
          cardName: card.cardName,
          price: 0, // Price will be looked up separately if needed
        })
      }
    }

    // Sort staples by synergy descending
    staples.sort((a, b) => b.synergy - a.synergy)

    return {
      staples: staples.slice(0, 50), // Top 50 staples
      fills: fills.slice(0, 50), // Top 50 fills
      cardPool: cardPool.map(c => c.cardName),
    }
  } catch (error) {
    console.error('[brew/generate] Failed to load EDHREC data:', error)
    return { staples: [], fills: [], cardPool: [] }
  }
}

/**
 * Find the build that best matches the brief's strategy.
 */
function findBestMatchingBuild(
  builds: Array<{ id: string; archetype: string | null; theme: string | null; deckCount: number }>,
  brief: StrategyBrief
): { id: string } | null {
  const keywords = [
    brief.primaryWinCondition,
    brief.secondaryWinCondition,
    brief.playstyleDescription,
  ]
    .join(' ')
    .toLowerCase()

  for (const build of builds) {
    // Check archetype match
    if (build.archetype && keywords.includes(build.archetype.toLowerCase())) {
      return build
    }
    // Check theme match
    if (build.theme && keywords.includes(build.theme.toLowerCase())) {
      return build
    }
  }

  // Default to most popular build
  return builds.sort((a, b) => b.deckCount - a.deckCount)[0] ?? null
}

/**
 * Load Scryfall tagged cards for functional deck slots.
 * Returns cards grouped by slot (sacrifice outlets, removal, etc.)
 */
async function loadScryfallSlotCandidates(
  brief: StrategyBrief
): Promise<string> {
  try {
    // Detect archetype from brief
    const archetypeMatch = findArchetypeForStrategy([
      brief.primaryWinCondition,
      brief.playstyleDescription,
    ])

    if (!archetypeMatch || !ARCHETYPE_SLOTS[archetypeMatch.archetype.toLowerCase()]) {
      // Fallback: get generic archetype cards
      const cards = await getCardsByArchetype('control', {
        colorIdentity: brief.colourIdentity.join(''),
        limit: 30,
      })
      if (cards.length === 0) return ''
      return `\n### Suggested Cards by Role\n${cards.map(c => `- ${c.cardName}`).join('\n')}`
    }

    // Get cards for all slots in this archetype
    const slotCards = await getCardsForAllSlots(archetypeMatch.archetype, {
      colorIdentity: brief.colourIdentity.join(''),
      limitPerSlot: 15,
    })

    return formatSlotsForPrompt(slotCards)
  } catch (error) {
    console.error('[brew/generate] Failed to load Scryfall slots:', error)
    return ''
  }
}

/**
 * Load knowledge context (archetype guide, deck fundamentals).
 */
function loadKnowledgeContext(brief: StrategyBrief): string {
  try {
    // Detect archetype
    const archetypeMatch = findArchetypeForStrategy([
      brief.primaryWinCondition,
      brief.secondaryWinCondition ?? '',
      brief.playstyleDescription,
    ])

    // Load relevant knowledge files
    const context = getBrewContext({
      archetype: archetypeMatch?.archetype,
      includeFundamentals: true,
    })

    return context
  } catch (error) {
    console.error('[brew/generate] Failed to load knowledge context:', error)
    return ''
  }
}

/**
 * Query the user's collection filtered by colour identity.
 * Returns cards where the card's colour identity is a subset of the commander's.
 */
async function queryCollectionByColourIdentity(
  commanderCI: string[]
): Promise<Array<{ cardName: string; owned: boolean }>> {
  try {
    const supabase = createAdminClient()
    // user_copies doesn't have card_name directly — join through user_cards
    const { data: rows, error } = await supabase
      .from('user_copies')
      .select(`
        id,
        user_cards!user_copies_card_id_fkey ( card_name )
      `)
      .eq('is_proxy', false)
      .limit(200)

    if (error || !rows) return []

    // Aggregate by card name
    const cardMap = new Map<string, boolean>()
    for (const row of rows) {
      const cardInfo = row.user_cards as unknown as { card_name: string } | null
      if (cardInfo?.card_name) {
        cardMap.set(cardInfo.card_name, true)
      }
    }

    return Array.from(cardMap.entries()).map(([cardName]) => ({
      cardName,
      owned: true,
    }))
  } catch {
    return []
  }
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
    // user_copies has card_id FK to user_cards which has card_name
    let collectionMap: Map<string, number>
    try {
      const { data: collectionRows } = await supabase
        .from('user_copies')
        .select(`
          card_id,
          user_cards!user_copies_card_id_fkey ( card_name )
        `)
        .eq('is_proxy', false)
      
      // Aggregate by card name (count copies)
      collectionMap = new Map()
      for (const row of collectionRows ?? []) {
        const cardInfo = row.user_cards as unknown as { card_name: string } | null
        if (!cardInfo?.card_name) continue
        const key = cardInfo.card_name.toLowerCase()
        collectionMap.set(key, (collectionMap.get(key) ?? 0) + 1)
      }
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
