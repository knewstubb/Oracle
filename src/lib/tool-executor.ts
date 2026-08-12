// ---------------------------------------------------------------------------
// Brew AI Tools — Tool Execution Loop (Provider-Agnostic)
// ---------------------------------------------------------------------------
// Runs the tool-use loop using a ProviderAdapter: call model → detect tool-use
// → execute tools → append results in provider-specific format → re-invoke
// until the model produces a final text response.
// ---------------------------------------------------------------------------
// Requirements: 6.1, 6.2, 6.4

import { getToolDefinitions, executeTool } from './tool-registry'
import { enrichCommanderSummary } from './tool-registry'
import type { ToolStreamEvent, ToolExecutionResult } from './tool-types'
import type {
  ProviderAdapter,
  ConversationMessage,
  NormalizedMessage,
  ToolResult,
} from './provider-adapter'

// ---------------------------------------------------------------------------
// Constants (unchanged — Requirement 6.2)
// ---------------------------------------------------------------------------

const TOOL_TIMEOUT_MS = 15_000
const LOOP_TIMEOUT_MS = 30_000
const MAX_TOOL_ITERATIONS = 10

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
  userId?: string
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
  const { adapter, model, system, messages, maxTokens, onToolEvent, userId } = options
  const tools = getToolDefinitions()
  const loopStart = Date.now()
  let currentMessages = [...messages]
  let iterations = 0
  let totalUsage = { inputTokens: 0, outputTokens: 0 }

  while (iterations < MAX_TOOL_ITERATIONS) {
    // Check total loop timeout at the start of each iteration
    if (Date.now() - loopStart > LOOP_TIMEOUT_MS) {
      onToolEvent({ type: 'error', error_message: `[${adapter.providerName}] Tool execution timeout` })
      break
    }

    let response: NormalizedMessage
    try {
      response = await adapter.sendMessage({
        model,
        system,
        messages: currentMessages,
        tools,
        maxTokens,
      })
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

      // NOTE: commander_summary events disabled.
      // With the new UX, commanders are shown inline as [[Card Name]] links with
      // hover previews and crown buttons. Users click crown to select.
      // The present_commander_summary tool may still be called by the AI,
      // but we no longer emit summary events to render the formatted cards.
      if (call.name === 'present_commander_summary' && !result.is_error) {
        const input = call.arguments as { name: string; tagline: string; analysis: string } | undefined
        if (input?.name) {
          console.log('[tool-executor] present_commander_summary called for:', input.name, '(event disabled — new UX uses [[brackets]] instead)')
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
    const fallback = await adapter.sendMessage({
      model,
      system,
      messages: currentMessages,
      tools: [],
      maxTokens,
    })
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
