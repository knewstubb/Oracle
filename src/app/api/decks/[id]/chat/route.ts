/**
 * POST /api/decks/[id]/chat
 * 
 * Chat with Oracle about an existing deck. Supports any deck state.
 * SSE streaming response with tool-use loop for card lookups.
 */

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { runToolLoop } from '@/lib/tool-executor'
import type { ToolLoopOptions } from '@/lib/tool-executor'
import type { ToolStreamEvent } from '@/lib/tool-types'
import { TOOL_USE_SYSTEM_PROMPT } from '@/lib/brew-tool-prompt'
import { getModelConfig, calculateCost, DEFAULT_MODEL_ID } from '@/lib/ai-models'
import { createProviderAdapter, ProviderConfigError } from '@/lib/provider-factory'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getUserPreferences, formatPlayerContextPrompt } from '@/lib/user-preferences'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatBody {
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  modelId?: string
}

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

function buildDeckChatPrompt(
  deckName: string,
  commanderName: string,
  deckType: string | null,
  cardCount: number,
  cards: Array<{ name: string; category: string; quantity: number }>,
  playerContext: string
): string {
  // Build a summary of the deck by category
  const byCategory: Record<string, string[]> = {}
  for (const card of cards) {
    const cat = card.category || 'Other'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(card.quantity > 1 ? `${card.quantity}x ${card.name}` : card.name)
  }
  
  const deckSummary = Object.entries(byCategory)
    .map(([cat, names]) => `${cat} (${names.length}):\n${names.map(n => `  - ${n}`).join('\n')}`)
    .join('\n\n')

  return `You are Oracle — a peer-level deckbuilding collaborator for Commander (EDH). You're discussing an existing deck with the user.

=== DECK CONTEXT ===
Deck: ${deckName}
Commander: ${commanderName}
Format: ${deckType || 'commander'}
Card Count: ${cardCount}

=== CURRENT DECKLIST ===
${deckSummary}

=== PERSONALITY ===
- You're discussing an existing deck, not building from scratch
- Be helpful with strategy questions, card suggestions, cuts, and gameplay advice
- Push back when reasonable — if a suggested change would hurt the deck, say so
- Keep messages SHORT. One concept per message. Use bullet points.
- ALWAYS wrap Magic card names in [[double brackets]] like [[Sol Ring]]

${playerContext}

=== CARD ACCURACY (STRICT) ===
1. ONLY name cards you are 100% certain exist with their EXACT printed name.
2. Use tools to verify card data when available.
3. ALWAYS wrap Magic card names in [[double brackets]] — the UI uses these for hover previews.

=== WHAT YOU CAN HELP WITH ===
- Strategy advice for playing the deck
- Card suggestions (adds, cuts, swaps)
- Mana base analysis
- Combo identification
- Meta/matchup discussion
- Budget alternatives
- Explaining card synergies

When suggesting cards to add or cut, be specific about WHY and what role they fill.`
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id: deckIdStr } = await params
  const deckId = parseInt(deckIdStr, 10)
  if (isNaN(deckId) || deckId <= 0) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  let body: ChatBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { message, history = [], modelId = DEFAULT_MODEL_ID } = body
  if (!message || typeof message !== 'string') {
    return Response.json({ error: 'Missing message field' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Load deck data
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('id, name, commander_name, deck_type, card_count, user_id')
    .eq('id', deckId)
    .single()

  if (deckError || !deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  // Verify ownership
  if (deck.user_id !== userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Load deck cards
  const { data: deckCards, error: cardsError } = await supabase
    .from('deck_cards')
    .select('card_name, categories, quantity')
    .eq('deck_id', deckId)

  if (cardsError) {
    return Response.json({ error: 'Failed to load deck cards' }, { status: 500 })
  }

  // Parse categories
  const cards = (deckCards || []).map(c => {
    let category = 'Other'
    try {
      const parsed = JSON.parse(c.categories || '[]')
      if (Array.isArray(parsed) && parsed[0]) {
        category = parsed[0].replace(/\(top\)|\(bottom\)/gi, '').trim()
      }
    } catch { /* */ }
    return { name: c.card_name, category, quantity: c.quantity || 1 }
  })

  // Get player preferences for context
  const prefs = await getUserPreferences(userId)
  const playerContext = formatPlayerContextPrompt(prefs)

  // Build system prompt
  const systemPrompt = buildDeckChatPrompt(
    deck.name,
    deck.commander_name || 'Unknown Commander',
    deck.deck_type,
    deck.card_count || cards.length,
    cards,
    playerContext
  )

  // Get model config
  const modelConfig = getModelConfig(modelId)
  if (!modelConfig) {
    return Response.json({ error: `Unknown model: ${modelId}` }, { status: 400 })
  }

  // Create provider adapter
  let adapter
  try {
    adapter = createProviderAdapter(modelConfig)
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      return Response.json({ error: err.message }, { status: 500 })
    }
    throw err
  }

  // Build message history
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: message },
  ]

  // SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
      }

      try {
        const toolLoopOptions: ToolLoopOptions = {
          adapter,
          model: modelConfig.modelId,
          system: `${systemPrompt}\n\n${TOOL_USE_SYSTEM_PROMPT}`,
          messages,
          maxTokens: 4096,
          userId,
          onToolEvent: (event: ToolStreamEvent) => {
            if (event.type === 'tool_status') {
              send(JSON.stringify({ type: 'tool_status', tool_name: event.tool_name, status: event.status }))
            }
          },
        }

        const result = await runToolLoop(toolLoopOptions)

        // Stream the text as raw data for client accumulation
        // Send in chunks to enable progressive display
        const TEXT_CHUNK_SIZE = 50
        const fullText = result.text
        for (let i = 0; i < fullText.length; i += TEXT_CHUNK_SIZE) {
          const chunk = fullText.slice(i, i + TEXT_CHUNK_SIZE)
          send(JSON.stringify(chunk)) // JSON-encoded string
        }

        // Log usage (optional — can track deck chat costs separately)
        if (result.usage) {
          const cost = calculateCost(modelId, result.usage.inputTokens, result.usage.outputTokens)
          console.log(`[deck-chat] deckId=${deckId} model=${modelId} cost=$${cost.toFixed(4)}`)
        }

        // Send done signal
        send('[DONE]')

      } catch (err) {
        console.error('[deck-chat] Error:', err)
        send(JSON.stringify({ type: 'error', message: (err as Error).message }))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
