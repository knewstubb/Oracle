/**
 * POST /api/oracle/chat
 * Global Oracle chat endpoint with context awareness and real AI integration
 * 
 * Body: {
 *   message: string
 *   context: { type, deckId?, deckName?, commanderName? }
 *   history: ChatMessage[]
 *   sessionId?: string
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
  sessionId?: string
  modelId?: string
}

// ---------------------------------------------------------------------------
// Intent Detection
// ---------------------------------------------------------------------------

const DECK_BUILDING_PATTERNS = [
  /\b(build|brew|create|make|start|design)\s+(a\s+)?(new\s+)?(deck|commander|edh)/i,
  /\bi\s+want\s+to\s+(build|brew|create|make)/i,
  /\bhelp\s+me\s+(build|brew|create|design)/i,
  /\bwhat\s+(commander|deck)\s+should\s+i\s+(build|play)/i,
  /\bsugg(est|estion)\s+(a\s+)?(commander|deck)/i,
  /\b(aristocrats|aggro|control|combo|voltron|tokens|tribal|reanimator|landfall|spellslinger)\s+(deck|commander|build)/i,
  /\b(?:let'?s|lets)\s+(build|brew|make|create)/i,
]

// Patterns that suggest the user is mentioning a specific commander to build around
const COMMANDER_MENTION_PATTERNS = [
  /\b(?:build|brew|make|create|design|start)\s+(?:a\s+)?(?:deck\s+)?(?:around|with|for|using)\s+(.+?)(?:\s+deck)?$/i,
  /\b(?:build|brew)\s+(.+?)(?:\s+deck)?$/i,
  /\bi\s+want\s+to\s+(?:build|brew|play|try)\s+(.+?)(?:\s+deck)?$/i,
  /\bhelp\s+(?:me\s+)?(?:build|brew)\s+(.+?)(?:\s+deck)?$/i,
  /\b(?:let'?s|lets)\s+(?:build|brew|make|try)\s+(.+?)(?:\s+deck)?$/i,
  /\b(?:let'?s|lets)\s+(?:build|brew|make)\s+(?:a\s+)?(.+?)(?:\s+deck)?$/i,
]

function detectDeckBuildingIntent(message: string): boolean {
  return DECK_BUILDING_PATTERNS.some(pattern => pattern.test(message))
}

/**
 * Extract a potential commander name from a message.
 * Returns the extracted text that might be a commander name.
 */
function extractPotentialCommanderName(message: string): string | null {
  for (const pattern of COMMANDER_MENTION_PATTERNS) {
    const match = message.match(pattern)
    if (match && match[1]) {
      // Clean up the extracted name
      let name = match[1].trim()
      // Remove common suffixes
      name = name.replace(/\s+(deck|commander|edh)$/i, '')
      // Only return if it looks like a card name (2+ words or known pattern)
      if (name.length >= 3) {
        return name
      }
    }
  }
  return null
}

/**
 * Look up a commander in the database by fuzzy matching the display_name.
 * Returns the canonical commander info if found.
 */
async function findCommanderByName(
  supabase: ReturnType<typeof createAdminClient>,
  searchName: string
): Promise<{ displayName: string; canonicalKey: string; colorIdentity: string } | null> {
  // Normalize search: lowercase, remove special chars for matching
  const normalizedSearch = searchName.toLowerCase().trim()
  
  // Extract significant words (remove common filler words)
  const fillerWords = new Set(['the', 'of', 'a', 'an', 'and', 'or', 'to', 'in', 'on', 'for', 'with'])
  const significantWords = normalizedSearch
    .split(/[\s,]+/)
    .filter(w => w.length >= 2 && !fillerWords.has(w))
  
  // First try exact match (case-insensitive)
  const { data: exactMatch } = await supabase
    .from('ref_commanders')
    .select('display_name, canonical_key, color_identity')
    .ilike('display_name', normalizedSearch)
    .eq('legal_commander', true)
    .limit(1)
    .single()
  
  if (exactMatch) {
    return {
      displayName: exactMatch.display_name,
      canonicalKey: exactMatch.canonical_key,
      colorIdentity: exactMatch.color_identity,
    }
  }
  
  // Try partial match (contains the search term)
  const { data: partialMatches } = await supabase
    .from('ref_commanders')
    .select('display_name, canonical_key, color_identity')
    .ilike('display_name', `%${normalizedSearch}%`)
    .eq('legal_commander', true)
    .order('edhrec_deck_count', { ascending: false, nullsFirst: false })
    .limit(5)
  
  if (partialMatches && partialMatches.length > 0) {
    // If only one match, return it
    if (partialMatches.length === 1) {
      return {
        displayName: partialMatches[0].display_name,
        canonicalKey: partialMatches[0].canonical_key,
        colorIdentity: partialMatches[0].color_identity,
      }
    }
    
    // If multiple matches, prefer the one where the search term is a significant part
    // (e.g., "gitrog" should match "The Gitrog Monster" over "Gitrog, Horror of Zhava")
    const searchWords = normalizedSearch.split(/\s+/)
    for (const match of partialMatches) {
      const displayLower = match.display_name.toLowerCase()
      // Check if all search words appear in the display name
      const allWordsMatch = searchWords.every(word => displayLower.includes(word))
      if (allWordsMatch) {
        return {
          displayName: match.display_name,
          canonicalKey: match.canonical_key,
          colorIdentity: match.color_identity,
        }
      }
    }
    
    // Fall back to highest EDHREC count match
    return {
      displayName: partialMatches[0].display_name,
      canonicalKey: partialMatches[0].canonical_key,
      colorIdentity: partialMatches[0].color_identity,
    }
  }
  
  // If no partial match, try searching by significant words individually
  // This handles cases like "kaalia the vast" matching "Kaalia of the Vast"
  if (significantWords.length > 0) {
    // Search for commanders that contain ALL significant words
    // Build a query that matches all words
    let query = supabase
      .from('ref_commanders')
      .select('display_name, canonical_key, color_identity')
      .eq('legal_commander', true)
    
    // Add ILIKE conditions for each significant word
    for (const word of significantWords) {
      query = query.ilike('display_name', `%${word}%`)
    }
    
    const { data: wordMatches } = await query
      .order('edhrec_deck_count', { ascending: false, nullsFirst: false })
      .limit(5)
    
    if (wordMatches && wordMatches.length > 0) {
      // If we found matches with all significant words, return the most popular
      console.log('[oracle/chat] Commander found via significant words:', {
        search: searchName,
        words: significantWords,
        found: wordMatches[0].display_name
      })
      return {
        displayName: wordMatches[0].display_name,
        canonicalKey: wordMatches[0].canonical_key,
        colorIdentity: wordMatches[0].color_identity,
      }
    }
    
    // Last resort: try just the first significant word (likely the commander's name)
    if (significantWords[0].length >= 4) {
      const { data: firstWordMatches } = await supabase
        .from('ref_commanders')
        .select('display_name, canonical_key, color_identity')
        .ilike('display_name', `%${significantWords[0]}%`)
        .eq('legal_commander', true)
        .order('edhrec_deck_count', { ascending: false, nullsFirst: false })
        .limit(3)
      
      if (firstWordMatches && firstWordMatches.length === 1) {
        // Only use if there's exactly one match to avoid ambiguity
        console.log('[oracle/chat] Commander found via first word:', {
          search: searchName,
          word: significantWords[0],
          found: firstWordMatches[0].display_name
        })
        return {
          displayName: firstWordMatches[0].display_name,
          canonicalKey: firstWordMatches[0].canonical_key,
          colorIdentity: firstWordMatches[0].color_identity,
        }
      }
    }
  }
  
  return null
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
  const { message, context, history, sessionId } = body

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

  // --- Intent detection for exploration sessions ---
  // Only detect intent when in general/collection/forge/deck-list context (not already in a specific deck)
  const shouldDetectIntent = ['general', 'collection', 'forge', 'deck-list'].includes(context.type)
  const hasDeckBuildingIntent = shouldDetectIntent && detectDeckBuildingIntent(message)
  
  // Try to extract a specific commander name if deck-building intent is detected
  let detectedCommander: { displayName: string; canonicalKey: string; colorIdentity: string } | null = null
  if (shouldDetectIntent) {
    const potentialName = extractPotentialCommanderName(message)
    if (potentialName) {
      detectedCommander = await findCommanderByName(supabase, potentialName)
      if (detectedCommander) {
        console.log('[oracle/chat] Commander detected:', { 
          search: potentialName, 
          found: detectedCommander.displayName,
          key: detectedCommander.canonicalKey
        })
      }
    }
  }
  
  if (hasDeckBuildingIntent || detectedCommander) {
    console.log('[oracle/chat] Deck-building intent detected:', { 
      message, 
      contextType: context.type,
      commander: detectedCommander?.displayName ?? null
    })
  }

  // If deck-building intent detected and we have a session, update it to exploration type
  if (hasDeckBuildingIntent && sessionId) {
    await supabase
      .from('oracle_sessions')
      .update({ 
        session_type: 'exploration',
        status: 'exploring'
      })
      .eq('id', sessionId)
      .eq('user_id', userId)
  }

  // Save user message to DB (with session_id if provided)
  await supabase.from('oracle_messages').insert({
    user_id: userId,
    session_id: sessionId ?? null,
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
        // If deck-building intent detected OR a specific commander mentioned, send a navigate prompt event
        // This allows the UI to show an action button alongside the response
        if (hasDeckBuildingIntent || detectedCommander) {
          const navigateEvent = detectedCommander
            ? {
                type: 'navigate_prompt',
                action: 'build_commander',
                label: `Build ${detectedCommander.displayName}`,
                url: `/new-deck?commander=${encodeURIComponent(detectedCommander.canonicalKey)}`,
                commanderName: detectedCommander.displayName,
                commanderKey: detectedCommander.canonicalKey,
                colorIdentity: detectedCommander.colorIdentity,
              }
            : {
                type: 'navigate_prompt',
                action: 'new_deck',
                label: 'Start building in the Commander Builder',
                url: '/new-deck',
              }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(navigateEvent)}\n\n`))
        }

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
          session_id: sessionId ?? null,
          role: 'assistant',
          content: fullResponseText,
          context_type: context.type,
          context_deck_id: context.deckId ?? null,
        })

        // Update session last_message_at (message_count is updated by OracleContext locally)
        if (sessionId) {
          await supabase
            .from('oracle_sessions')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', sessionId)
        }

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
