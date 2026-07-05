// ---------------------------------------------------------------------------
// Brew Model Selector — Anthropic Provider Adapter
// ---------------------------------------------------------------------------
// Anthropic is the canonical internal format. Tools pass through without
// translation. This adapter normalizes Anthropic API responses into the
// shared NormalizedMessage format and formats tool results back into
// Anthropic's expected message structure.
// ---------------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk'
import type {
  ProviderAdapter,
  NormalizedMessage,
  NormalizedToolCall,
  ToolResult,
  ConversationMessage,
  AnthropicToolDefinition,
} from '../provider-adapter'

export class AnthropicAdapter implements ProviderAdapter {
  readonly providerName = 'Anthropic'
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async sendMessage(params: {
    model: string
    system: string
    messages: ConversationMessage[]
    tools: AnthropicToolDefinition[]
    maxTokens: number
  }): Promise<NormalizedMessage> {
    const response = await this.client.messages.create({
      model: params.model,
      system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }],
      messages: params.messages as Anthropic.MessageParam[],
      // Anthropic tools are already in internal format — pass through
      tools: params.tools as Anthropic.Tool[],
      max_tokens: params.maxTokens,
    })

    return this.normalizeResponse(response)
  }

  formatToolResults(
    assistantResponse: NormalizedMessage,
    results: ToolResult[]
  ): ConversationMessage[] {
    // Reconstruct the assistant content blocks from the normalized tool calls.
    // We build a raw content array matching Anthropic's MessageParam shape.
    const assistantContent: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: unknown }
    > = []

    // Add text block if there's text content
    if (assistantResponse.textContent) {
      assistantContent.push({ type: 'text', text: assistantResponse.textContent })
    }

    // Add tool_use blocks for each tool call
    for (const call of assistantResponse.toolCalls) {
      assistantContent.push({
        type: 'tool_use',
        id: call.id,
        name: call.name,
        input: call.arguments,
      })
    }

    // Build tool_result content blocks for the user message
    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = results.map(result => ({
      type: 'tool_result' as const,
      tool_use_id: result.callId,
      content: result.content,
      is_error: result.isError,
    }))

    return [
      { role: 'assistant', content: assistantContent },
      { role: 'user', content: toolResultBlocks },
    ]
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private normalizeResponse(response: Anthropic.Message): NormalizedMessage {
    const textParts: string[] = []
    const toolCalls: NormalizedToolCall[] = []
    let hasMalformedToolUse = false
    const malformedErrors: string[] = []

    for (const block of response.content) {
      if (block.type === 'text') {
        textParts.push(block.text)
      } else if (block.type === 'tool_use') {
        // Validate tool_use block integrity (Property 5: graceful malformed handling)
        if (!block.name || typeof block.name !== 'string') {
          hasMalformedToolUse = true
          malformedErrors.push(
            `Malformed tool_use block: missing or invalid 'name' (id: ${block.id ?? 'unknown'})`
          )
          continue
        }

        let parsedArgs: Record<string, unknown>
        try {
          // block.input may already be an object or could be malformed
          if (block.input === null || block.input === undefined) {
            parsedArgs = {}
          } else if (typeof block.input === 'object' && !Array.isArray(block.input)) {
            parsedArgs = block.input as Record<string, unknown>
          } else if (typeof block.input === 'string') {
            parsedArgs = JSON.parse(block.input) as Record<string, unknown>
          } else {
            throw new Error(`Unexpected input type: ${typeof block.input}`)
          }
        } catch {
          hasMalformedToolUse = true
          malformedErrors.push(
            `Malformed tool_use block: unparseable 'input' for tool '${block.name}' (id: ${block.id ?? 'unknown'})`
          )
          continue
        }

        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: parsedArgs,
        })
      }
    }

    // If we detected malformed tool_use blocks, degrade gracefully:
    // return wantsToolUse: false and include error info in textContent
    if (hasMalformedToolUse) {
      const errorText = [
        ...textParts,
        `[Provider error: ${malformedErrors.join('; ')}]`,
      ].join('\n')

      return {
        textContent: errorText,
        toolCalls: [],
        wantsToolUse: false,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      }
    }

    return {
      textContent: textParts.join(''),
      toolCalls,
      wantsToolUse: response.stop_reason === 'tool_use' && toolCalls.length > 0,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }
  }
}
