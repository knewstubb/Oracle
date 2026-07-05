// ---------------------------------------------------------------------------
// POST /api/ai/debrief/investigate
// SSE-streamed investigation exchange with the fast model (Claude Haiku)
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { buildInvestigatorSystemPrompt } from '@/lib/debrief-prompts'
import type { DebriefBrief } from '@/lib/debrief-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvestigateBody {
  sessionId: number
  userMessage: string
}

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = (await request.json()) as InvestigateBody
    const { sessionId, userMessage } = body

    // --- Validate inputs ---
    if (!sessionId || typeof sessionId !== 'number') {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 })
    }
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      return Response.json({ error: 'userMessage is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // --- Load session ---
    const { data: session, error: fetchErr } = await supabase
      .from('debrief_sessions')
      .select('id, deck_id, status, brief_json, conversation_json, current_rec_index')
      .eq('id', sessionId)
      .single()

    if (fetchErr || !session) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.status !== 'investigating') {
      return Response.json(
        { error: `Session is in '${session.status}' state, expected 'investigating'` },
        { status: 409 }
      )
    }

    // --- Load deck info for system prompt ---
    const { data: deck, error: deckErr } = await supabase
      .from('decks')
      .select('id, name, commander_name')
      .eq('id', session.deck_id)
      .single()

    if (deckErr || !deck) {
      return Response.json({ error: 'Deck not found' }, { status: 404 })
    }

    // --- Build conversation history ---
    const existingConversation: ConversationMessage[] = session.conversation_json
      ? JSON.parse(session.conversation_json)
      : []

    // Add the new user message
    existingConversation.push({ role: 'user', content: userMessage.trim() })

    // Count user exchanges (messages with role 'user')
    const userExchanges = existingConversation.filter(m => m.role === 'user').length

    // --- Build system prompt ---
    const commanderName = deck.commander_name || 'Unknown Commander'
    const deckName = deck.name || 'Unknown Deck'
    let systemPrompt = buildInvestigatorSystemPrompt(commanderName, deckName)

    // After 4+ exchanges, instruct model to attempt brief extraction
    if (userExchanges >= 4) {
      systemPrompt += `\n\nIMPORTANT: You have had ${userExchanges} exchanges with the user. You should now synthesise the DebriefBrief JSON from the conversation. Output it as a JSON code block with the brief data.`
    }

    // At exchange 6, force brief extraction
    if (userExchanges >= 6) {
      systemPrompt += `\n\nCRITICAL: This is exchange ${userExchanges}. You MUST output the DebriefBrief JSON now regardless of context completeness. Do your best with the information available.`
    }

    // --- Call Anthropic fast model via SSE ---
    const anthropic = new Anthropic() // reads ANTHROPIC_API_KEY from env

    const stream = await anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: existingConversation.map(m => ({
        role: m.role,
        content: m.content,
      })),
    })

    // --- Return SSE ReadableStream ---
    const encoder = new TextEncoder()
    let fullResponse = ''

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const token = event.delta.text
              fullResponse += token
              controller.enqueue(encoder.encode(`data: ${token}\n\n`))
            }
          }

          // --- Stream complete: persist conversation and check for brief ---
          existingConversation.push({ role: 'assistant', content: fullResponse })

          // Attempt to extract a DebriefBrief from the response
          const brief = extractBrief(fullResponse)

          if (brief) {
            // Brief extracted — emit brief_ready event and update session
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'brief_ready', brief })}\n\n`)
            )

            // Update session: store brief and keep status as 'investigating'
            await supabase
              .from('debrief_sessions')
              .update({
                brief_json: JSON.stringify(brief),
                conversation_json: JSON.stringify(existingConversation),
              })
              .eq('id', sessionId)
          } else {
            // No brief yet — just store the updated conversation
            await supabase
              .from('debrief_sessions')
              .update({ conversation_json: JSON.stringify(existingConversation) })
              .eq('id', sessionId)
          }

          // Emit done signal
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Stream error'
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
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
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Investigation failed: ${message}` }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Brief extraction helper
// ---------------------------------------------------------------------------

/**
 * Attempt to extract a DebriefBrief JSON from the model response.
 */
function extractBrief(text: string): DebriefBrief | null {
  // Try to find JSON in code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  if (codeBlockMatch) {
    return parseBrief(codeBlockMatch[1])
  }

  // Try to find a raw JSON object in the text
  const jsonMatch = text.match(/\{[\s\S]*"gameOutcome"[\s\S]*\}/)
  if (jsonMatch) {
    return parseBrief(jsonMatch[0])
  }

  return null
}

/**
 * Parse and validate a JSON string as a DebriefBrief.
 */
function parseBrief(jsonStr: string): DebriefBrief | null {
  try {
    const parsed = JSON.parse(jsonStr)

    if (
      !parsed.gameOutcome ||
      !['win', 'loss', 'draw'].includes(parsed.gameOutcome)
    ) {
      return null
    }

    return {
      gameOutcome: parsed.gameOutcome,
      problemCards: Array.isArray(parsed.problemCards) ? parsed.problemCards : [],
      effectiveCards: Array.isArray(parsed.effectiveCards) ? parsed.effectiveCards : [],
      opponentArchetypes: Array.isArray(parsed.opponentArchetypes) ? parsed.opponentArchetypes : [],
      lossPattern: typeof parsed.lossPattern === 'string' ? parsed.lossPattern : '',
      userNotes: typeof parsed.userNotes === 'string' ? parsed.userNotes : '',
    }
  } catch {
    return null
  }
}
