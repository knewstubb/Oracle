// ---------------------------------------------------------------------------
// Brew Model Selector — DeepSeek Provider Adapter
// ---------------------------------------------------------------------------
// Uses the OpenAI SDK with a custom baseURL to communicate with DeepSeek's
// OpenAI-compatible API. Translates Anthropic tool definitions to OpenAI
// function-calling format and normalizes responses back to the shared
// NormalizedMessage type.
// ---------------------------------------------------------------------------

import OpenAI from 'openai'
import type {
  ProviderAdapter,
  NormalizedMessage,
  NormalizedToolCall,
  ToolResult,
  ConversationMessage,
  AnthropicToolDefinition,
} from '../provider-adapter'

export class DeepSeekAdapter implements ProviderAdapter {
  readonly providerName = 'DeepSeek'
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com/v1',
    })
  }

  async sendMessage(params: {
    model: string
    system: string
    messages: ConversationMessage[]
    tools: AnthropicToolDefinition[]
    maxTokens: number
  }): Promise<NormalizedMessage> {
    const openAIMessages = this.buildMessages(params.system, params.messages)
    const tools = params.tools.length > 0 ? this.translateTools(params.tools) : undefined

    const response = await this.client.chat.completions.create({
      model: params.model,
      messages: openAIMessages,
      tools,
      max_tokens: params.maxTokens,
    })

    return this.normalizeResponse(response)
  }

  formatToolResults(
    assistantResponse: NormalizedMessage,
    results: ToolResult[]
  ): ConversationMessage[] {
    // Build the assistant message with tool_calls content
    const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] =
      assistantResponse.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }))

    const assistantMsg: ConversationMessage = {
      role: 'assistant',
      content: {
        role: 'assistant' as const,
        content: assistantResponse.textContent || null,
        tool_calls: toolCalls,
      },
    }

    // Build tool result messages
    const toolMessages: ConversationMessage[] = results.map((result) => ({
      role: 'assistant' as const,
      content: {
        role: 'tool' as const,
        tool_call_id: result.callId,
        content: result.content,
      },
    }))

    return [assistantMsg, ...toolMessages]
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private translateTools(
    tools: AnthropicToolDefinition[]
  ): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema as unknown as Record<string, unknown>,
      },
    }))
  }

  private buildMessages(
    system: string,
    messages: ConversationMessage[]
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

    // System prompt as a system message
    if (system) {
      result.push({ role: 'system', content: system })
    }

    // Convert conversation messages to OpenAI format
    for (const msg of messages) {
      // If content is already an OpenAI message object (from formatToolResults),
      // pass it through directly
      if (
        msg.content &&
        typeof msg.content === 'object' &&
        'role' in (msg.content as Record<string, unknown>)
      ) {
        result.push(msg.content as OpenAI.Chat.Completions.ChatCompletionMessageParam)
      } else {
        // Simple text message
        const textContent =
          typeof msg.content === 'string'
            ? msg.content
            : this.extractTextFromContent(msg.content)

        if (msg.role === 'user') {
          result.push({ role: 'user', content: textContent })
        } else if (msg.role === 'assistant') {
          result.push({ role: 'assistant', content: textContent })
        } else if (msg.role === 'system') {
          result.push({ role: 'system', content: textContent })
        }
      }
    }

    return result
  }

  private extractTextFromContent(content: unknown): string {
    if (typeof content === 'string') return content
    if (content === null || content === undefined) return ''

    // Handle Anthropic-style content blocks array
    if (Array.isArray(content)) {
      return content
        .filter(
          (block: unknown) =>
            typeof block === 'object' &&
            block !== null &&
            'type' in block &&
            (block as { type: string }).type === 'text'
        )
        .map((block: unknown) => (block as { text: string }).text)
        .join('')
    }

    return String(content)
  }

  private normalizeResponse(
    response: OpenAI.Chat.Completions.ChatCompletion
  ): NormalizedMessage {
    const choice = response.choices[0]

    if (!choice) {
      return {
        textContent: '',
        toolCalls: [],
        wantsToolUse: false,
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    }

    // Handle content filter as end-of-turn
    if (choice.finish_reason === 'content_filter') {
      return {
        textContent:
          '[DeepSeek content filter triggered — response was blocked. Please rephrase your request.]',
        toolCalls: [],
        wantsToolUse: false,
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        },
      }
    }

    const message = choice.message
    let textContent = message.content ?? ''

    // Normalize tool_calls if present via the structured API field
    let toolCalls = this.normalizeToolCalls(message.tool_calls)

    // If tool calls extraction failed (malformed), treat as end-of-turn
    if (toolCalls === null) {
      return {
        textContent:
          textContent ||
          '[DeepSeek returned a malformed tool-use response that could not be parsed.]',
        toolCalls: [],
        wantsToolUse: false,
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        },
      }
    }

    // --- DeepSeek DSML fallback ---
    // Sometimes DeepSeek outputs tool calls as XML/DSML in the text content
    // instead of using the structured tool_calls field. Detect and parse these.
    if (toolCalls.length === 0 && textContent.includes('<|') && textContent.includes('invoke name=')) {
      const parsedFromText = this.parseDsmlToolCalls(textContent)
      if (parsedFromText.calls.length > 0) {
        toolCalls = parsedFromText.calls
        // Remove the DSML from the visible text content
        textContent = parsedFromText.cleanedText
      }
    }

    const wantsToolUse = toolCalls.length > 0

    return {
      textContent,
      toolCalls,
      wantsToolUse,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    }
  }

  /**
   * Parse DSML/XML-formatted tool calls from DeepSeek's text output.
   * Handles the format: <| DSML | invoke name="tool_name"> <| DSML | parameter name="param" string="true">value</| DSML | parameter> </| DSML | invoke> </| DSML | tool_calls>
   */
  private parseDsmlToolCalls(text: string): { calls: NormalizedToolCall[]; cleanedText: string } {
    const calls: NormalizedToolCall[] = []

    // Match invoke blocks: <| DSML | invoke name="tool_name"> ... </| DSML | invoke>
    const invokeRegex = /<\|?\s*\|?\s*DSML\s*\|?\s*invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/\|?\s*\|?\s*DSML\s*\|?\s*invoke\s*>/gi
    let match

    while ((match = invokeRegex.exec(text)) !== null) {
      const toolName = match[1]
      const invokeBody = match[2]

      // Extract parameters from the invoke body
      const args: Record<string, unknown> = {}
      const paramRegex = /<\|?\s*\|?\s*DSML\s*\|?\s*parameter\s+name="([^"]+)"[^>]*>([^<]*)<\/\|?\s*\|?\s*DSML\s*\|?\s*parameter\s*>/gi
      let paramMatch

      while ((paramMatch = paramRegex.exec(invokeBody)) !== null) {
        const paramName = paramMatch[1]
        const paramValue = paramMatch[2].trim()
        // Try to parse as JSON, fall back to string
        try {
          args[paramName] = JSON.parse(paramValue)
        } catch {
          args[paramName] = paramValue
        }
      }

      calls.push({
        id: `dsml-${toolName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: toolName,
        arguments: args,
      })
    }

    // Remove the entire DSML block from visible text
    let cleanedText = text
    // Remove everything from the first tool_calls tag to the end
    const toolCallsStart = text.search(/<\|?\s*\|?\s*DSML\s*\|?\s*tool_calls\s*>/i)
    if (toolCallsStart >= 0) {
      cleanedText = text.slice(0, toolCallsStart).trim()
    } else {
      // Remove individual invoke blocks
      cleanedText = text.replace(/<\|?\s*\|?\s*DSML\s*\|?\s*invoke[\s\S]*?<\/\|?\s*\|?\s*DSML\s*\|?\s*invoke\s*>/gi, '').trim()
    }

    return { calls, cleanedText }
  }

  /**
   * Normalize OpenAI-style tool_calls into NormalizedToolCall[].
   * Returns null if any tool call is malformed (missing name or unparseable arguments).
   */
  private normalizeToolCalls(
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] | null | undefined
  ): NormalizedToolCall[] | null {
    if (!toolCalls || toolCalls.length === 0) {
      return []
    }

    const normalized: NormalizedToolCall[] = []

    for (const tc of toolCalls) {
      // Only handle function-type tool calls
      if (tc.type !== 'function') {
        continue
      }

      // Validate function name exists
      if (!tc.function?.name) {
        return null
      }

      // Parse arguments JSON
      let parsedArgs: Record<string, unknown>
      try {
        parsedArgs = JSON.parse(tc.function.arguments || '{}')
      } catch {
        // Unparseable arguments — treat entire response as malformed
        return null
      }

      normalized.push({
        id: tc.id,
        name: tc.function.name,
        arguments: parsedArgs,
      })
    }

    return normalized
  }
}
