// ---------------------------------------------------------------------------
// POST /api/brew/skeleton
// Sonnet skeleton generation — SSE streaming response
// Generates a deck skeleton with primary_category + additional_categories per card
// ---------------------------------------------------------------------------
// Requirements: 11.3, 14.4, 14.5
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase'
import type { DeckCard } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkeletonBody {
  sessionId: number
}

interface SessionRow {
  id: number
  status: string
  commander_name: string | null
  colour_identity: string | null
  decision_log_json: string | null
}

interface SkeletonResponse {
  cards: DeckCard[]
  suggestions: DeckCard[]
}

// ---------------------------------------------------------------------------
// Skeleton Generation System Prompt
// ---------------------------------------------------------------------------

const SKELETON_SYSTEM_PROMPT = `You are a Commander (EDH) deckbuilding engine. Your job is to generate a complete deck skeleton for a given commander based on the player's strategy decisions.

=== OUTPUT FORMAT ===

You MUST respond with a JSON object containing exactly two arrays: "cards" and "suggestions".

Each card object has this shape:
{
  "card_name": "Exact Card Name",
  "primary_category": "Category Name",
  "additional_categories": ["Category A", "Category B"],
  "ownership_status": "not_owned",
  "cmc": 3,
  "type_line": "Creature — Human Wizard",
  "oracle_text": "When this creature enters..."
}

=== RULES ===

1. Generate exactly 99 cards for the "cards" array (excluding commander).
2. Generate 10-15 cards for the "suggestions" array (alternative options the player might prefer).
3. Every card MUST be a real Magic: The Gathering card with its EXACT printed name.
4. Every card MUST be legal in Commander format.
5. Every card MUST be within the commander's colour identity.
6. Set ownership_status to "not_owned" for all cards (the client will reconcile with collection data).

=== CATEGORIES ===

Use these primary_category values:
- "Ramp" — mana acceleration (10-12 cards)
- "Draw" — card advantage (10-12 cards)
- "Removal" — single-target removal (5-7 cards)
- "Board Wipe" — mass removal (2-3 cards)
- "Protection" — counterspells, hexproof effects, indestructible (3-5 cards)
- "Win Condition" — primary paths to victory (3-5 cards)
- "Alt Win Condition" — backup/alternative win paths (2-3 cards)
- "Lands" — non-basic utility lands, dual lands, fetches (35-37 total including basics)
- Plus deck-specific categories based on the strategy (e.g., "Sacrifice Outlet", "Recursion", "Token Generator", "Tribal Payoff", etc.)

additional_categories should capture secondary roles a card fills (e.g., a creature that also draws cards gets primary "Draw" and additional ["Creature", "Synergy Piece"]).

=== STRATEGY CONTEXT ===

Use the decision log to inform your card choices:
- Strategy entries tell you the archetype and win approach
- Parameter entries tell you colour identity, bracket, and measurable goals
- Constraint entries tell you what to avoid (no infinite combos, no stax, etc.)

=== QUALITY BAR ===

- Prioritize synergy with the commander over generic staples
- Include redundant effects for key engine pieces (don't rely on a single card)
- Respect the power level (bracket 3-4 = focused but not pubstomping)
- Include a healthy mana base with appropriate fixing for the colour count
- Balance CMC curve: low (0-2), mid (3-4), high (5+) in roughly 40/35/25 ratio for nonlands

=== RESPONSE ===

Output ONLY the JSON object. No markdown fences, no explanation text, no preamble.
Start with { and end with }.`

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as SkeletonBody
    const { sessionId } = body

    // --- Validate inputs ---
    if (!sessionId || typeof sessionId !== 'number' || !Number.isInteger(sessionId) || sessionId <= 0) {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 })
    }

    const supabase = createServerClient()

    // --- Load session and validate state ---
    const { data: session, error: fetchErr } = await supabase
      .from('brew_sessions')
      .select('id, status, commander_name, colour_identity, decision_log_json')
      .eq('id', sessionId)
      .single()

    if (fetchErr || !session) {
      return Response.json({ error: 'Brew session not found' }, { status: 404 })
    }

    if (session.status !== 'building') {
      return Response.json(
        { error: `Session is in '${session.status}' phase; skeleton generation requires 'building' phase` },
        { status: 400 }
      )
    }

    if (!session.commander_name) {
      return Response.json(
        { error: 'No commander committed for this session' },
        { status: 400 }
      )
    }

    // --- Build context from decision log ---
    const decisionContext = buildDecisionContext(session)

    // --- Stream the response ---
    const encoder = new TextEncoder()
    let fullResponse = ''

    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Emit initial status
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'status', message: 'Starting skeleton generation...' })}\n\n`
            )
          )

          const anthropic = new Anthropic()

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'status', message: `Building deck for ${session.commander_name}...` })}\n\n`
            )
          )

          const stream = await anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 16384,
            system: [
              {
                type: 'text',
                text: SKELETON_SYSTEM_PROMPT,
                cache_control: { type: 'ephemeral' },
              },
            ],
            messages: [
              {
                role: 'user',
                content: decisionContext,
              },
            ],
          })

          // Track progress for status updates
          let tokenCount = 0
          const statusThresholds = [500, 2000, 5000, 8000, 12000]
          let nextThreshold = 0

          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              const text = event.delta.text
              fullResponse += text
              tokenCount += text.length

              // Emit progress status at thresholds
              if (
                nextThreshold < statusThresholds.length &&
                tokenCount >= statusThresholds[nextThreshold]
              ) {
                const progressMessages = [
                  'Selecting core engine cards...',
                  'Building mana base...',
                  'Adding interaction suite...',
                  'Evaluating synergy pieces...',
                  'Finalising suggestions...',
                ]
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'status', message: progressMessages[nextThreshold] })}\n\n`
                  )
                )
                nextThreshold++
              }
            }
          }

          // --- Parse the completed response ---
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'status', message: 'Parsing deck skeleton...' })}\n\n`
            )
          )

          const skeleton = parseSkeleton(fullResponse)

          if (!skeleton) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'error', message: 'Failed to parse skeleton from model response' })}\n\n`
              )
            )
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
            return
          }

          // --- Enrich cards with CMC/type data from Supabase mtg_cards ---
          // The model may not reliably provide cmc values. Resolve from DB.
          try {
            const allCardNames = [
              ...skeleton.cards.map(c => c.card_name),
              ...skeleton.suggestions.map(c => c.card_name),
            ]
            const { data: cardData } = await supabase
              .from('mtg_cards')
              .select('name, mana_value, type_line, oracle_text')
              .in('name', allCardNames)

            if (cardData && cardData.length > 0) {
              const cardMap = new Map(cardData.map(c => [c.name, c]))
              for (const card of skeleton.cards) {
                const dbCard = cardMap.get(card.card_name)
                if (dbCard) {
                  if (card.cmc === 0 && dbCard.mana_value != null) card.cmc = dbCard.mana_value
                  if (!card.type_line && dbCard.type_line) card.type_line = dbCard.type_line
                  if (!card.oracle_text && dbCard.oracle_text) card.oracle_text = dbCard.oracle_text
                }
              }
              for (const card of skeleton.suggestions) {
                const dbCard = cardMap.get(card.card_name)
                if (dbCard) {
                  if (card.cmc === 0 && dbCard.mana_value != null) card.cmc = dbCard.mana_value
                  if (!card.type_line && dbCard.type_line) card.type_line = dbCard.type_line
                  if (!card.oracle_text && dbCard.oracle_text) card.oracle_text = dbCard.oracle_text
                }
              }
            }
          } catch {
            // Enrichment failure is non-critical — cards still work without CMC
            console.warn('[brew/skeleton] Card enrichment from mtg_cards failed — CMC may be 0 for some cards')
          }

          // --- Persist skeleton to session ---
          await supabase
            .from('brew_sessions')
            .update({ skeleton_json: JSON.stringify(skeleton), updated_at: new Date().toISOString() })
            .eq('id', sessionId)

          // --- Emit complete event with parsed cards ---
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'complete', cards: skeleton.cards, suggestions: skeleton.suggestions })}\n\n`
            )
          )

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          const errMessage =
            err instanceof Error ? err.message : 'Stream error'
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', message: errMessage })}\n\n`
            )
          )
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Skeleton generation failed: ${errMessage}` },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a user-facing context string from the session's decision log
 * and commander information for the skeleton generation prompt.
 */
function buildDecisionContext(session: SessionRow): string {
  const parts: string[] = []

  // Commander info
  parts.push(`Commander: ${session.commander_name}`)
  if (session.colour_identity) {
    parts.push(`Colour Identity: ${session.colour_identity.split('').join(', ')}`)
  }

  // Parse decision log
  try {
    const log = JSON.parse(
      session.decision_log_json || '{"strategy":[],"parameters":[],"constraints":[]}'
    )

    if (log.strategy && log.strategy.length > 0) {
      parts.push('')
      parts.push('=== Strategy Decisions ===')
      for (const entry of log.strategy) {
        parts.push(`- ${entry.key}: ${entry.value}`)
      }
    }

    if (log.parameters && log.parameters.length > 0) {
      parts.push('')
      parts.push('=== Parameters ===')
      for (const entry of log.parameters) {
        parts.push(`- ${entry.key}: ${entry.value}`)
      }
    }

    if (log.constraints && log.constraints.length > 0) {
      parts.push('')
      parts.push('=== Constraints ===')
      for (const entry of log.constraints) {
        parts.push(`- ${entry.key}: ${entry.value}`)
      }
    }
  } catch {
    // If decision log is malformed, proceed with just commander info
  }

  // Default constraints from player context
  parts.push('')
  parts.push('=== Player Context ===')
  parts.push('- Bracket: 3-4 (casual-competitive)')
  parts.push('- No infinite combos (house rule)')
  parts.push('- No stax or mass land destruction')
  parts.push('- Prefers engine-based strategies that build and overwhelm')
  parts.push('- Prioritize synergy over generic goodstuff')

  parts.push('')
  parts.push('Generate the full 99-card deck skeleton with suggestions. Respond with JSON only.')

  return parts.join('\n')
}

/**
 * Parses the Sonnet response into a validated SkeletonResponse.
 * Returns null if parsing or validation fails.
 */
function parseSkeleton(text: string): SkeletonResponse | null {
  try {
    // Strip potential markdown fences
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    const parsed = JSON.parse(cleaned)

    // Validate top-level structure
    if (!parsed || typeof parsed !== 'object') return null
    if (!Array.isArray(parsed.cards) || parsed.cards.length === 0) return null
    if (!Array.isArray(parsed.suggestions)) return null

    // Validate and normalize cards
    const cards = parsed.cards
      .filter(isValidDeckCard)
      .map(normalizeDeckCard)

    const suggestions = parsed.suggestions
      .filter(isValidDeckCard)
      .map(normalizeDeckCard)

    if (cards.length === 0) return null

    return { cards, suggestions }
  } catch {
    return null
  }
}

/**
 * Validates that a parsed object has the minimum required DeckCard fields.
 */
function isValidDeckCard(card: unknown): card is Record<string, unknown> {
  if (!card || typeof card !== 'object') return false
  const c = card as Record<string, unknown>
  return (
    typeof c.card_name === 'string' &&
    c.card_name.length > 0 &&
    typeof c.primary_category === 'string' &&
    c.primary_category.length > 0
  )
}

/**
 * Normalizes a parsed card object into a well-typed DeckCard.
 */
function normalizeDeckCard(card: Record<string, unknown>): DeckCard {
  return {
    card_name: card.card_name as string,
    primary_category: card.primary_category as string,
    additional_categories: Array.isArray(card.additional_categories)
      ? (card.additional_categories as unknown[]).filter(
          (c): c is string => typeof c === 'string'
        )
      : [],
    ownership_status: 'not_owned',
    cmc: typeof card.cmc === 'number' ? card.cmc : 0,
    type_line: typeof card.type_line === 'string' ? card.type_line : '',
    oracle_text: typeof card.oracle_text === 'string' ? card.oracle_text : '',
    edhrec_inclusion: typeof card.edhrec_inclusion === 'number' ? card.edhrec_inclusion : undefined,
    price_ck: typeof card.price_ck === 'number' ? card.price_ck : undefined,
  }
}
