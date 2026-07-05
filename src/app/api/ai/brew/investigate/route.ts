// ---------------------------------------------------------------------------
// POST /api/ai/brew/investigate
// SSE-streamed investigation exchange — supports Anthropic and Gemini models
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createServerClient } from '@/lib/supabase'
import { buildBrewInvestigatorPrompt, buildBriefExtractionPrompt } from '@/lib/brew-prompts'
import { getModelConfig } from '@/lib/ai-models'
import { getMcpClient } from '@/lib/mcp-client'
import type { StrategyBrief, BrewSessionRow } from '@/types/brew'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvestigateBody {
  sessionId: number
  userMessage: string
  modelId?: string
}

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as InvestigateBody
    const { sessionId, userMessage, modelId } = body

    // --- Validate inputs ---
    if (!sessionId || typeof sessionId !== 'number') {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 })
    }
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      return Response.json({ error: 'Message cannot be empty' }, { status: 400 })
    }

    const supabase = createServerClient()

    // --- Load session ---
    const { data: session, error: fetchErr } = await supabase
      .from('brew_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (fetchErr || !session) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.status !== 'investigating') {
      return Response.json(
        { error: `Session is in '${session.status}', expected 'investigating'` },
        { status: 409 }
      )
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
    let systemPrompt = buildBrewInvestigatorPrompt(
      session.path_type as 'commander' | 'concept',
      session.commander_name || undefined,
      session.concept_description || undefined
    )

    // After 4+ exchanges, instruct model to attempt brief extraction
    if (userExchanges >= 4) {
      systemPrompt += `\n\nIMPORTANT: You have had ${userExchanges} exchanges with the user. You now have enough context to synthesise the StrategyBrief. Output the JSON in a code block at the end of your response.`
    }

    // At exchange 6, force brief extraction
    if (userExchanges >= 6) {
      systemPrompt += `\n\nCRITICAL: This is exchange ${userExchanges}. You MUST output the StrategyBrief JSON now regardless of context completeness. Do your best with the information available.`
    }

    // --- Determine which model/provider to use ---
    const model = getModelConfig(modelId ?? 'haiku')

    // --- Stream the response ---
    const encoder = new TextEncoder()
    let fullResponse = ''

    const readable = new ReadableStream({
      async start(controller) {
        try {
          if (model.provider === 'anthropic') {
            // --- Anthropic streaming ---
            const anthropic = new Anthropic()
            const stream = await anthropic.messages.stream({
              model: model.modelId,
              max_tokens: 1024,
              system: systemPrompt,
              messages: existingConversation.map(m => ({
                role: m.role,
                content: m.content,
              })),
            })

            for await (const event of stream) {
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                fullResponse += event.delta.text
              }
            }
          } else if (model.provider === 'gemini') {
            // --- Gemini streaming ---
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
            const geminiModel = genAI.getGenerativeModel({ model: model.modelId })

            // Build Gemini conversation format
            const history = existingConversation.slice(0, -1).map(m => ({
              role: m.role === 'user' ? 'user' as const : 'model' as const,
              parts: [{ text: m.content }],
            }))

            const chat = geminiModel.startChat({
              history,
              systemInstruction: { role: 'user', parts: [{ text: systemPrompt }] },
            })

            const result = await chat.sendMessageStream(userMessage.trim())

            for await (const chunk of result.stream) {
              const text = chunk.text()
              if (text) {
                fullResponse += text
              }
            }
          }

          // --- Validate [[Card Name]] references against MCP bulk data ---
          fullResponse = await validateCardNames(fullResponse)

          // --- Strip any raw JSON brief from the visible response ---
          // Remove code blocks containing StrategyBrief JSON
          fullResponse = fullResponse.replace(/```(?:json)?\s*\{[\s\S]*?"commanderName"[\s\S]*?\}\s*```/g, '').trim()
          // Also remove bare JSON objects that look like a brief
          fullResponse = fullResponse.replace(/---\s*\{[\s\S]*?"commanderName"[\s\S]*?\}\s*$/g, '').trim()
          fullResponse = fullResponse.replace(/\{[\s\S]*?"commanderName"[\s\S]*?"budgetPreference"[\s\S]*?\}\s*$/g, '').trim()

          // Emit the complete validated response as a single SSE event
          // SSE data lines can't contain raw newlines — encode as JSON string
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(fullResponse)}\n\n`))

          // --- Stream complete: persist conversation and check for brief ---
          existingConversation.push({ role: 'assistant', content: fullResponse })

          // Attempt to extract a StrategyBrief from the response
          let brief: StrategyBrief | null = null

          if (userExchanges >= 4) {
            brief = extractBrief(fullResponse)

            // If extraction from model output fails at exchange 6, force extraction
            if (!brief && userExchanges >= 6) {
              brief = await forceExtractBrief(
                existingConversation,
                session.commander_name || 'Unknown Commander'
              )
            }
          }

          if (brief) {
            // Brief extracted — emit brief_ready event and update session
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'brief_ready', brief })}\n\n`)
            )

            // Update session: store brief and transition to 'confirming'
            await supabase
              .from('brew_sessions')
              .update({
                brief_json: JSON.stringify(brief),
                conversation_json: JSON.stringify(existingConversation),
                status: 'confirming',
                commander_name: brief.commanderName,
                colour_identity: brief.colourIdentity.join(','),
                updated_at: new Date().toISOString(),
              })
              .eq('id', sessionId)
          } else {
            // No brief yet — just store the updated conversation
            await supabase
              .from('brew_sessions')
              .update({
                conversation_json: JSON.stringify(existingConversation),
                updated_at: new Date().toISOString(),
              })
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
// Card name validation via MCP bulk data
// ---------------------------------------------------------------------------

/**
 * Validate all [[Card Name]] references in the response against MCP bulk data.
 * Invalid cards get annotated with ⚠️ and a note.
 */
async function validateCardNames(text: string): Promise<string> {
  const cardNameRegex = /\[\[([^\]]+)\]\]/g
  const matches = [...text.matchAll(cardNameRegex)]

  if (matches.length === 0) return text

  // Deduplicate card names
  const uniqueNames = [...new Set(matches.map(m => m[1]))]

  // Exclude known deck names from validation (these aren't MTG cards)
  const supabaseClient = createServerClient()
  const { data: deckRows } = await supabaseClient.from('decks').select('name')
  const deckNames = new Set(
    (deckRows ?? []).map(r => r.name.toLowerCase())
  )

  const validationResults = new Map<string, { valid: boolean; typeLine?: string }>()

  try {
    const client = await getMcpClient()

    for (const name of uniqueNames) {
      // Skip known deck names — they're not MTG cards
      if (deckNames.has(name.toLowerCase())) {
        // Remove brackets but keep the name (it's a deck reference, not a card)
        validationResults.set(name, { valid: true })
        continue
      }

      try {
        const result = await client.callTool({
          name: 'bulk_card_lookup',
          arguments: { name, response_format: 'concise' },
        })

        if (result.isError) {
          validationResults.set(name, { valid: false })
          continue
        }

        // Check if the card was found
        const textContent = (result.content as { type: string; text?: string }[])
          .filter(c => c.type === 'text')
          .map(c => c.text ?? '')
          .join('')

        if (textContent.includes('not found') || textContent.includes('No card found')) {
          validationResults.set(name, { valid: false })
        } else {
          // Extract type line to check if it's legendary
          const typeMatch = textContent.match(/Type:\s*(.+)/i) || textContent.match(/type_line['":\s]+([^"'\n]+)/)
          const typeLine = typeMatch ? typeMatch[1].trim() : ''
          validationResults.set(name, { valid: true, typeLine })
        }
      } catch {
        // If lookup fails, assume valid (don't block on MCP errors)
        validationResults.set(name, { valid: true })
      }
    }
  } catch {
    // If MCP client fails entirely, return text unmodified
    return text
  }

  // Replace invalid [[Card Name]] with annotated versions
  let result = text
  for (const [name, validation] of validationResults) {
    if (!validation.valid) {
      // Card doesn't exist — annotate it
      result = result.replace(
        new RegExp(`\\[\\[${escapeRegex(name)}\\]\\]`, 'g'),
        `~~${name}~~ ⚠️(not found)`
      )
    }
  }

  return result
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Brief extraction helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to extract a StrategyBrief JSON from the model response.
 */
function extractBrief(text: string): StrategyBrief | null {
  // Try to find JSON in code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  if (codeBlockMatch) {
    return parseBrief(codeBlockMatch[1])
  }

  // Try to find a raw JSON object with strategy brief fields
  const jsonMatch = text.match(/\{[\s\S]*"commanderName"[\s\S]*"colourIdentity"[\s\S]*\}/)
  if (jsonMatch) {
    return parseBrief(jsonMatch[0])
  }

  return null
}

/**
 * Force brief extraction by calling the model with the extraction prompt.
 */
async function forceExtractBrief(
  conversation: ConversationMessage[],
  commanderName: string
): Promise<StrategyBrief | null> {
  try {
    const anthropic = new Anthropic()
    const extractionPrompt = buildBriefExtractionPrompt(conversation, commanderName)

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: extractionPrompt }],
    })

    const responseText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    return extractBrief(responseText) || parseBrief(responseText)
  } catch {
    return null
  }
}

/**
 * Parse and validate a JSON string as a StrategyBrief.
 */
function parseBrief(jsonStr: string): StrategyBrief | null {
  try {
    const parsed = JSON.parse(jsonStr)

    // Validate required fields
    if (!parsed.commanderName || typeof parsed.commanderName !== 'string') return null
    if (!Array.isArray(parsed.colourIdentity) || parsed.colourIdentity.length === 0) return null
    if (!parsed.primaryWinCondition || typeof parsed.primaryWinCondition !== 'string') return null
    if (!parsed.secondaryWinCondition || typeof parsed.secondaryWinCondition !== 'string') return null
    if (![1, 2, 3, 4].includes(parsed.targetBracket)) return null
    if (!Array.isArray(parsed.knownIncludes)) return null
    if (!parsed.playstyleDescription || typeof parsed.playstyleDescription !== 'string') return null
    if (!['collection', 'budget', 'unrestricted'].includes(parsed.budgetPreference)) return null

    // Validate colour identity values
    const validColours = ['W', 'U', 'B', 'R', 'G']
    if (!parsed.colourIdentity.every((c: string) => validColours.includes(c))) return null

    return {
      commanderName: parsed.commanderName,
      colourIdentity: parsed.colourIdentity,
      primaryWinCondition: parsed.primaryWinCondition,
      secondaryWinCondition: parsed.secondaryWinCondition,
      targetBracket: parsed.targetBracket,
      knownIncludes: parsed.knownIncludes,
      playstyleDescription: parsed.playstyleDescription,
      budgetPreference: parsed.budgetPreference,
      budgetCeiling: typeof parsed.budgetCeiling === 'number' ? parsed.budgetCeiling : undefined,
    }
  } catch {
    return null
  }
}
