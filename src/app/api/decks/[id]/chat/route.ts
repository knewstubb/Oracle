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
import { buildDeckChatPrompt } from '@/lib/deck-chat-prompt'
import { loadDeckSlotFacts, formatDeckSlotFactsForPrompt, type DeckFactsClient } from '@/lib/deck-chat-facts'
import { DECK_CHAT_CONTEXT, isDeckChatEditToolsEnabled } from '@/lib/tool-registry'
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

  // Read-only proxy/gap facts for this deck (null = could not be loaded)
  const slotFacts = await loadDeckSlotFacts(supabase as unknown as DeckFactsClient, deckId, deck.deck_type, deck.commander_name)
  const editToolsEnabled = isDeckChatEditToolsEnabled()

  // Build system prompt
  const systemPrompt = buildDeckChatPrompt(
    deck.name,
    deck.commander_name || 'Unknown Commander',
    deck.deck_type,
    deck.card_count || cards.length,
    cards,
    playerContext,
    { editToolsEnabled, slotFacts: formatDeckSlotFactsForPrompt(slotFacts) }
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
          deckId,
          // Suggest-only by default: edit tools are gated by ORACLE_DECK_CHAT_EDIT_TOOLS
          contextType: DECK_CHAT_CONTEXT,
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
