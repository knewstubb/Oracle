// ---------------------------------------------------------------------------
// POST /api/brew/assess
// Per-card assessment via Haiku — returns pros, cons, fit_score, fit_note
// ---------------------------------------------------------------------------
// Requirements: 7.3, 7.4, 7.5, 7.6, 11.4, 11.6
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { deserializeCache, serializeCache } from '@/lib/brew-v2-assessment-cache'
import type { CardAssessment } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssessRequest {
  sessionId: number
  cardName: string
  deckContext: {
    commander: string
    strategy?: string
    existingCards?: string[]
  }
}

interface SessionRow {
  id: number
  assessment_cache_json: string | null
}

// ---------------------------------------------------------------------------
// System prompt for card assessment
// ---------------------------------------------------------------------------

const ASSESSMENT_SYSTEM_PROMPT = `You are a Magic: The Gathering Commander deckbuilding assistant specialising in card evaluation.

Your task is to assess a specific card's fit within a given deck context. You will receive:
- The card name to assess
- The deck's commander
- The deck's strategy (if provided)
- Other cards already in the deck (if provided)

Provide your assessment as a JSON object with exactly this structure:
{
  "pros": ["string", "string"],       // 2-3 specific pros for this card in THIS deck
  "cons": ["string", "string"],       // 1-2 specific cons for this card in THIS deck
  "fit_score": 7,                     // Integer 1-10, how well it fits this specific deck
  "fit_note": "string"                // 2-3 sentences explaining the card's role and fit in this deck context
}

Rules:
- Pros and cons must be specific to the deck context, not generic card evaluation
- fit_score 8-10 = strong fit, 5-7 = reasonable fit, 1-4 = poor fit
- fit_note should reference the commander and strategy where relevant
- Return ONLY the JSON object, no markdown fences or extra text`

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = (await request.json()) as AssessRequest
    const { sessionId, cardName, deckContext } = body

    // --- Validate inputs ---
    if (!sessionId || typeof sessionId !== 'number' || !Number.isInteger(sessionId) || sessionId <= 0) {
      return Response.json({ error: 'Invalid session ID' }, { status: 400 })
    }

    if (!cardName || typeof cardName !== 'string' || cardName.trim().length === 0) {
      return Response.json({ error: 'Card name is required' }, { status: 400 })
    }

    if (!deckContext || typeof deckContext !== 'object' || !deckContext.commander) {
      return Response.json({ error: 'Deck context with commander is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // --- Load session ---
    const { data: session, error: fetchErr } = await supabase
      .from('brew_sessions')
      .select('id, assessment_cache_json')
      .eq('id', sessionId)
      .single()

    if (fetchErr) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    // --- Check assessment cache ---
    const cache = deserializeCache(session.assessment_cache_json)
    const cached = cache.get(cardName)

    if (cached) {
      return Response.json({ assessment: cached, cached: true })
    }

    // --- Build user prompt with deck context ---
    const contextParts: string[] = [
      `Card to assess: ${cardName.trim()}`,
      `Commander: ${deckContext.commander}`,
    ]

    if (deckContext.strategy) {
      contextParts.push(`Deck strategy: ${deckContext.strategy}`)
    }

    if (deckContext.existingCards && deckContext.existingCards.length > 0) {
      const cardList = deckContext.existingCards.slice(0, 40).join(', ')
      contextParts.push(`Other cards in deck: ${cardList}`)
    }

    const userPrompt = contextParts.join('\n')

    // --- Call Haiku with cache_control on system prompt ---
    const anthropic = new Anthropic()
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: ASSESSMENT_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    })

    // --- Parse response ---
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const assessment = parseAssessment(text)

    if (!assessment) {
      return Response.json(
        { error: 'Failed to parse assessment from model response' },
        { status: 502 }
      )
    }

    // --- Cache result ---
    cache.set(cardName, assessment)
    await supabase
      .from('brew_sessions')
      .update({ assessment_cache_json: serializeCache(cache), updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    return Response.json({ assessment, cached: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Assessment failed: ${message}` },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parses the Haiku model response text into a validated CardAssessment.
 * Returns null if parsing or validation fails.
 */
function parseAssessment(text: string): CardAssessment | null {
  try {
    // Strip potential markdown fences
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    const parsed = JSON.parse(cleaned)

    // Validate structure
    if (!Array.isArray(parsed.pros) || parsed.pros.length === 0) return null
    if (!Array.isArray(parsed.cons) || parsed.cons.length === 0) return null
    if (typeof parsed.fit_score !== 'number') return null
    if (typeof parsed.fit_note !== 'string' || parsed.fit_note.length === 0) return null

    // Clamp fit_score to 1-10
    const fit_score = Math.max(1, Math.min(10, Math.round(parsed.fit_score)))

    return {
      pros: parsed.pros.filter((p: unknown): p is string => typeof p === 'string').slice(0, 3),
      cons: parsed.cons.filter((c: unknown): c is string => typeof c === 'string').slice(0, 2),
      fit_score,
      fit_note: parsed.fit_note,
    }
  } catch {
    return null
  }
}
