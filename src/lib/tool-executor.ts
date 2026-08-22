// ---------------------------------------------------------------------------
// Brew AI Tools — Tool Execution Loop (Provider-Agnostic)
// ---------------------------------------------------------------------------
// Runs the tool-use loop using a ProviderAdapter: call model → detect tool-use
// → execute tools → append results in provider-specific format → re-invoke
// until the model produces a final text response.
// ---------------------------------------------------------------------------
// Requirements: 6.1, 6.2, 6.4

import { getToolDefinitions, executeTool } from './tool-registry'
import type { ToolStreamEvent, ToolExecutionResult } from './tool-types'
import type {
  ProviderAdapter,
  ConversationMessage,
  NormalizedMessage,
  ToolResult,
  ToolChoice,
  AnthropicToolDefinition,
} from './provider-adapter'

// ---------------------------------------------------------------------------
// Constants (unchanged — Requirement 6.2)
// ---------------------------------------------------------------------------

const TOOL_TIMEOUT_MS = 15_000
const LOOP_TIMEOUT_MS = 30_000
const MAX_TOOL_ITERATIONS = 10

// ---------------------------------------------------------------------------
// Collection Question Detection
// ---------------------------------------------------------------------------

/**
 * Detect if a message is asking about owned cards by type.
 * Returns the detected type if found, or null if not a collection type question.
 * 
 * Patterns detected:
 * - "what curses do I own"
 * - "show me my sagas"
 * - "do I have any equipment"
 * - "list my creatures"
 * - "what enchantments are in my collection"
 */
export function detectCollectionTypeQuestion(message: string): string | null {
  const lowerMessage = message.toLowerCase()
  
  // Common card types and subtypes
  const cardTypes = [
    'curse', 'curses',
    'saga', 'sagas',
    'equipment',
    'creature', 'creatures',
    'enchantment', 'enchantments',
    'artifact', 'artifacts',
    'instant', 'instants',
    'sorcery', 'sorceries',
    'planeswalker', 'planeswalkers',
    'land', 'lands',
    'aura', 'auras',
    'vehicle', 'vehicles',
    'treasure',
    'food',
    'clue', 'clues',
    'blood',
    'goblin', 'goblins',
    'elf', 'elves',
    'zombie', 'zombies',
    'vampire', 'vampires',
    'dragon', 'dragons',
    'angel', 'angels',
    'demon', 'demons',
    'merfolk',
    'human', 'humans',
    'warrior', 'warriors',
    'wizard', 'wizards',
    'rogue', 'rogues',
    'cleric', 'clerics',
  ]
  
  // Patterns that indicate ownership questions
  const ownershipPatterns = [
    /what\s+(\w+)\s+do\s+i\s+(?:own|have)/i,
    /show\s+(?:me\s+)?my\s+(\w+)/i,
    /do\s+i\s+(?:own|have)\s+(?:any\s+)?(\w+)/i,
    /list\s+(?:my\s+)?(\w+)/i,
    /(?:how\s+many|what)\s+(\w+)\s+(?:are\s+)?in\s+my\s+collection/i,
    /my\s+(\w+)\s+(?:cards?|collection)/i,
  ]
  
  for (const pattern of ownershipPatterns) {
    const match = lowerMessage.match(pattern)
    if (match) {
      const potentialType = match[1]?.toLowerCase()
      // Check if the captured word is a known card type
      if (cardTypes.includes(potentialType)) {
        // Normalize to singular form for the tool
        const normalized = potentialType
          .replace(/ies$/, 'y')  // sorceries -> sorcery
          .replace(/ves$/, 'f')  // elves -> elf (but we want Elf, not Elf)
          .replace(/s$/, '')     // curses -> curse
        
        // Special cases
        if (potentialType === 'elves') return 'Elf'
        if (potentialType === 'merfolk') return 'Merfolk'
        
        // Capitalize first letter
        return normalized.charAt(0).toUpperCase() + normalized.slice(1)
      }
    }
  }
  
  return null
}

// ---------------------------------------------------------------------------
// Public Interfaces
// ---------------------------------------------------------------------------

export interface ToolLoopOptions {
  adapter: ProviderAdapter
  model: string
  system: string
  messages: ConversationMessage[]
  maxTokens: number
  onToolEvent: (event: ToolStreamEvent) => void
  /** Callback for streaming text deltas — called as text arrives from the model */
  onTextDelta?: (text: string) => void
  userId?: string
  /** Optional tool choice to force tool usage on the first iteration */
  toolChoice?: ToolChoice
}

export interface ToolLoopResult {
  text: string
  usage: { inputTokens: number; outputTokens: number }
}

// ---------------------------------------------------------------------------
// Tool Loop Implementation
// ---------------------------------------------------------------------------

/**
 * Runs the tool-use loop using the provided ProviderAdapter.
 * Calls model via adapter.sendMessage(), executes tools with existing timeout
 * logic, and appends results via adapter.formatToolResults().
 * Returns the final text response and accumulated token usage.
 */
export async function runToolLoop(options: ToolLoopOptions): Promise<ToolLoopResult> {
  const { adapter, model, system, messages, maxTokens, onToolEvent, onTextDelta, userId, toolChoice } = options
  const tools = getToolDefinitions()
  
  const loopStart = Date.now()
  let currentMessages = [...messages]
  let iterations = 0
  let totalUsage = { inputTokens: 0, outputTokens: 0 }
  
  // Tool choice is only applied on the first iteration
  let currentToolChoice: ToolChoice | undefined = toolChoice

  while (iterations < MAX_TOOL_ITERATIONS) {
    // Check total loop timeout at the start of each iteration
    if (Date.now() - loopStart > LOOP_TIMEOUT_MS) {
      onToolEvent({ type: 'error', error_message: `[${adapter.providerName}] Tool execution timeout` })
      break
    }

    let response: NormalizedMessage
    try {
      // Use streaming if onTextDelta callback is provided
      if (onTextDelta && adapter.sendMessageStreaming) {
        response = await runStreamingIteration({
          adapter,
          model,
          system,
          messages: currentMessages,
          tools,
          maxTokens,
          toolChoice: currentToolChoice,
          onTextDelta,
        })
      } else {
        response = await adapter.sendMessage({
          model,
          system,
          messages: currentMessages,
          tools,
          maxTokens,
          toolChoice: currentToolChoice,
        })
      }
      
      // Clear tool choice after first iteration — only force on the initial call
      currentToolChoice = undefined
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error'
      onToolEvent({
        type: 'error',
        error_message: `[${adapter.providerName}] API error: ${errMessage}`,
      })
      // Return what we have so far
      return { text: '', usage: totalUsage }
    }

    totalUsage.inputTokens += response.usage.inputTokens
    totalUsage.outputTokens += response.usage.outputTokens

    // If the model is done (no more tool calls), return the text
    if (!response.wantsToolUse) {
      return { text: response.textContent, usage: totalUsage }
    }

    // Execute each tool with per-tool timeout
    const results: ToolResult[] = []
    for (const call of response.toolCalls) {
      onToolEvent({
        type: 'tool_status',
        tool_name: call.name,
        status: 'running',
      })

      let result: ToolExecutionResult
      try {
        result = await Promise.race([
          executeTool(call.name, call.arguments, { userId }),
          new Promise<ToolExecutionResult>((_, reject) =>
            setTimeout(() => reject(new Error('Tool timeout')), TOOL_TIMEOUT_MS)
          ),
        ])
      } catch {
        result = {
          content: `Tool "${call.name}" timed out after ${TOOL_TIMEOUT_MS / 1000}s`,
          is_error: true,
        }
      }

      onToolEvent({
        type: 'tool_status',
        tool_name: call.name,
        status: result.is_error ? 'error' : 'complete',
      })

      // Emit structured data for display tools
      if (call.name === 'display_commander_candidates' && !result.is_error) {
        const commanders = call.arguments?.commanders as Array<{ 
          name: string
          partner_name?: string
          color_identity?: string[]
          leadership_type?: string 
        }> | undefined
        if (commanders && Array.isArray(commanders)) {
          const displayNames = commanders.map(c => c.partner_name ? `${c.name} & ${c.partner_name}` : c.name)
          console.log('[tool-executor] display_commander_candidates called with', commanders.length, 'commanders:', displayNames)
          onToolEvent({
            type: 'candidates',
            commanders,
          })
        } else {
          console.warn('[tool-executor] display_commander_candidates called but commanders field is invalid:', call.arguments)
        }
      }

      // Emit add_cards event for deck building
      if (call.name === 'add_cards_to_deck' && !result.is_error) {
        const cards = call.arguments?.cards as Array<{ name: string; category: string }> | undefined
        if (cards && Array.isArray(cards)) {
          console.log('[tool-executor] add_cards_to_deck called with', cards.length, 'cards:', cards.map(c => c.name))
          onToolEvent({
            type: 'add_cards' as any,
            cards,
          } as any)
        }
      }

      // Emit remove_cards event for deck editing
      if (call.name === 'remove_cards_from_deck' && !result.is_error) {
        const cards = call.arguments?.cards as Array<{ name: string }> | undefined
        if (cards && Array.isArray(cards)) {
          console.log('[tool-executor] remove_cards_from_deck called with', cards.length, 'cards:', cards.map(c => c.name))
          onToolEvent({
            type: 'remove_cards' as any,
            cards,
          } as any)
        }
      }

      results.push({
        callId: call.id,
        content: result.content,
        isError: result.is_error,
      })
    }

    // Append results in provider-specific format
    currentMessages = [
      ...currentMessages,
      ...adapter.formatToolResults(response, results),
    ]

    iterations++
  }

  // If we hit max iterations or timeout, make one final call without tools
  // for a best-effort text response
  try {
    let fallback: NormalizedMessage
    if (onTextDelta && adapter.sendMessageStreaming) {
      fallback = await runStreamingIteration({
        adapter,
        model,
        system,
        messages: currentMessages,
        tools: [],
        maxTokens,
        onTextDelta,
      })
    } else {
      fallback = await adapter.sendMessage({
        model,
        system,
        messages: currentMessages,
        tools: [],
        maxTokens,
      })
    }
    totalUsage.inputTokens += fallback.usage.inputTokens
    totalUsage.outputTokens += fallback.usage.outputTokens
    return { text: fallback.textContent, usage: totalUsage }
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : 'Unknown error'
    onToolEvent({
      type: 'error',
      error_message: `[${adapter.providerName}] Fallback API error: ${errMessage}`,
    })
    return { text: '', usage: totalUsage }
  }
}

/**
 * Run a single streaming iteration — consumes the stream, emits text deltas,
 * and returns the final NormalizedMessage when done.
 */
async function runStreamingIteration(params: {
  adapter: ProviderAdapter
  model: string
  system: string
  messages: ConversationMessage[]
  tools: AnthropicToolDefinition[]
  maxTokens: number
  toolChoice?: ToolChoice
  onTextDelta: (text: string) => void
}): Promise<NormalizedMessage> {
  const { adapter, model, system, messages, tools, maxTokens, toolChoice, onTextDelta } = params

  for await (const chunk of adapter.sendMessageStreaming({
    model,
    system,
    messages,
    tools,
    maxTokens,
    toolChoice,
  })) {
    if (chunk.type === 'text_delta') {
      onTextDelta(chunk.text)
    } else if (chunk.type === 'done') {
      return chunk.message
    } else if (chunk.type === 'error') {
      throw new Error(chunk.error)
    }
    // tool_call_start, tool_call_delta, tool_call_end — we just accumulate these
    // The final 'done' chunk has the complete NormalizedMessage with all tool calls
  }

  // Should not reach here — stream should always end with 'done' or 'error'
  throw new Error('Stream ended without done or error chunk')
}
