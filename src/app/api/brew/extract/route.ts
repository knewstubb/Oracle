// ---------------------------------------------------------------------------
// POST /api/brew/extract
// Haiku decision extraction — accepts Sonnet response text, extracts decisions
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase'
import { categorizeDecision, DECISION_TYPES } from '@/lib/brew-v2-decisions'
import type { DecisionEntry, DecisionLog } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractBody {
  sessionId: number
  responseText: string
}

interface RawExtraction {
  type: string
  key: string
  value: string
  source_quote: string
  confidence: number
}

// ---------------------------------------------------------------------------
// System prompt for Haiku decision extraction
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `You are a decision extraction assistant for a Magic: The Gathering Commander deck brewing session.

Your job is to analyze an AI assistant's response from a deck brewing conversation and extract any high-confidence strategic decisions the user and assistant have agreed upon.

Extract ONLY decisions that are clearly stated or confirmed. Do not infer or guess.

Decision types to extract:
- colour_identity: The colour identity discussed (e.g. "Orzhov (WB)", "Sultai (BUG)")
- bracket: The power level bracket (e.g. "3", "3-4")
- archetype: The deck archetype (e.g. "Aristocrats", "Voltron", "Spellslinger")
- playstyle: How the deck plays (e.g. "Engine-based value", "Aggressive tempo")
- win_approach: How the deck wins (e.g. "Drain via sacrifice loops", "Commander damage")
- known_card_includes: Specific cards the user wants included (e.g. "Smothering Tithe")
- constraints: Limitations on the build (e.g. "No infinite combos", "Budget under $200")
- exclusions: Cards or strategies explicitly excluded (e.g. "No stax pieces")

For each extraction, provide:
- type: one of the decision types above
- key: a short uppercase label (e.g. "ARCHETYPE", "COLOUR IDENTITY")
- value: the extracted value
- source_quote: the exact phrase from the response that supports this extraction
- confidence: a number 0-1 indicating confidence (only include if >= 0.7)

Respond with a JSON array of extractions. If no decisions can be extracted, return an empty array [].

Example response:
[
  {
    "type": "archetype",
    "key": "ARCHETYPE",
    "value": "Aristocrats",
    "source_quote": "An aristocrats strategy focused on sacrifice loops",
    "confidence": 0.9
  }
]

Respond ONLY with the JSON array. No markdown fences, no explanation.`

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ExtractBody
    const { sessionId, responseText } = body

    // --- Validate inputs ---
    if (!sessionId || typeof sessionId !== 'number') {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 })
    }
    if (!responseText || typeof responseText !== 'string' || responseText.trim().length === 0) {
      return Response.json({ error: 'responseText cannot be empty' }, { status: 400 })
    }

    const supabase = createServerClient()

    // --- Load session ---
    const { data: session, error: fetchErr } = await supabase
      .from('brew_sessions')
      .select('id, decision_log_json')
      .eq('id', sessionId)
      .single()

    if (fetchErr || !session) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    // --- Invoke Haiku for extraction ---
    const anthropic = new Anthropic()

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: EXTRACTION_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Extract any strategic decisions from this brew session response:\n\n${responseText.trim()}`,
        },
      ],
    })

    // --- Parse Haiku response ---
    const rawText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    let rawExtractions: RawExtraction[] = []
    try {
      const parsed = JSON.parse(rawText)
      if (Array.isArray(parsed)) {
        rawExtractions = parsed
      }
    } catch {
      // If Haiku returns malformed JSON, return empty extractions silently
      return Response.json({ entries: [] })
    }

    // --- Filter high-confidence extractions and build DecisionEntry[] ---
    const validTypes = Object.values(DECISION_TYPES) as string[]
    const now = Date.now()

    const entries: DecisionEntry[] = rawExtractions
      .filter(
        (ext) =>
          ext.confidence >= 0.7 &&
          validTypes.includes(ext.type) &&
          ext.key &&
          ext.value &&
          ext.source_quote
      )
      .map((ext) => ({
        id: `${ext.type}-${now}-${Math.random().toString(36).slice(2, 8)}`,
        key: ext.key.toUpperCase(),
        value: ext.value,
        sourceQuote: ext.source_quote,
        timestamp: now,
      }))

    // --- Apply categorizeDecision to assign sections ---
    const categorizedEntries = entries.map((entry) => ({
      ...entry,
      section: categorizeDecision(entry),
    }))

    // --- Persist to decision_log_json ---
    const existingLog: DecisionLog = JSON.parse(session.decision_log_json || '{"strategy":[],"parameters":[],"constraints":[]}')

    for (const entry of categorizedEntries) {
      const { section, ...decisionEntry } = entry
      if (section === 'Strategy') {
        existingLog.strategy.push(decisionEntry)
      } else if (section === 'Parameters') {
        existingLog.parameters.push(decisionEntry)
      } else if (section === 'Constraints') {
        existingLog.constraints.push(decisionEntry)
      }
      // Entries with null section (unrecognized type) are silently dropped
    }

    await supabase
      .from('brew_sessions')
      .update({ decision_log_json: JSON.stringify(existingLog), updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    // --- Return extracted entries with section assignments ---
    return Response.json({ entries: categorizedEntries })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Failed to extract decisions: ${message}` },
      { status: 500 }
    )
  }
}
