/**
 * POST /api/oracle/chat
 * Global Oracle chat endpoint with context awareness and real AI integration
 * 
 * Body: {
 *   message: string
 *   context: { type, deckId?, deckName?, commanderName? }
 *   history: ChatMessage[]
 * }
 * 
 * Returns: SSE stream with text chunks and tool status notifications
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { runToolLoop } from '@/lib/tool-executor'
import type { ToolStreamEvent } from '@/lib/tool-types'
import { getModelConfig, DEFAULT_MODEL_ID } from '@/lib/ai-models'
import { createProviderAdapter, ProviderConfigError } from '@/lib/provider-factory'
import { getUserPreferences, formatPlayerContextPrompt } from '@/lib/user-preferences'
import { buildOracleSystemPrompt, type OracleChatContext } from '@/lib/oracle-prompt'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatBody {
  message: string
  context: OracleChatContext
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  modelId?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEXT_CHUNK_SIZE = 50

// ---------------------------------------------------------------------------
// POST Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const body = (await request.json()) as ChatBody
  const { message, context, history } = body

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Normalize history array
  const normalizedHistory = Array.isArray(history) ? history : []

  // --- Resolve model config and create adapter ---
  const resolvedModelId = body.modelId || DEFAULT_MODEL_ID
  const modelConfig = getModelConfig(resolvedModelId)

  let adapter
  try {
    adapter = createProviderAdapter(modelConfig)
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw err
  }

  const supabase = createAdminClient()

  // Save user message to DB
  await supabase.from('oracle_messages').insert({
    user_id: userId,
    role: 'user',
    content: message.trim(),
    context_type: context.type,
    context_deck_id: context.deckId ?? null,
  })

  // --- Fetch user preferences for player context ---
  const userPrefs = await getUserPreferences(userId)
  const playerContext = formatPlayerContextPrompt(userPrefs)

  // --- Build system prompt based on context ---
  const systemPrompt = buildOracleSystemPrompt(context, playerContext)

  // --- Build messages array for the AI ---
  const apiMessages = [
    ...normalizedHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as unknown,
    })),
    { role: 'user' as const, content: message.trim() as unknown },
  ]

  // --- Create SSE stream ---
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponseText = ''
      
      try {
        // Callback to emit tool SSE events during tool execution
        const onToolEvent = (event: ToolStreamEvent) => {
          // Forward tool_status and add_cards/remove_cards events
          // (candidates events are brew-specific, keep filtering those)
          if (event.type === 'tool_status' || event.type === 'add_cards' || event.type === 'remove_cards') {
            const sseData = JSON.stringify(event)
            controller.enqueue(encoder.encode(`data: ${sseData}\n\n`))
          }
        }

        // Run the tool execution loop
        const finalResponse = await runToolLoop({
          adapter,
          model: modelConfig.modelId,
          system: systemPrompt,
          messages: apiMessages,
          maxTokens: 2048,
          onToolEvent,
          userId,
        })

        fullResponseText = finalResponse.text

        // Stream text in chunks as 'text' type events (matching frontend expectation)
        for (let i = 0; i < fullResponseText.length; i += TEXT_CHUNK_SIZE) {
          const chunk = fullResponseText.slice(i, i + TEXT_CHUNK_SIZE)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`)
          )
        }

        // Save assistant response to DB
        await supabase.from('oracle_messages').insert({
          user_id: userId,
          role: 'assistant',
          content: fullResponseText,
          context_type: context.type,
          context_deck_id: context.deckId ?? null,
        })

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (err) {
        console.error('[oracle/chat] Error:', err)
        const errMessage = err instanceof Error ? err.message : 'Something went wrong'
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', content: errMessage })}\n\n`)
        )
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
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
