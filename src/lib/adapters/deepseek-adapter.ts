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
  ToolChoice,
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
    toolChoice?: ToolChoice
  }): Promise<NormalizedMessage> {
    const openAIMessages = this.buildMessages(params.system, params.messages)
    const tools = params.tools.length > 0 ? this.translateTools(params.tools) : undefined
    
    // Translate tool_choice to OpenAI format
    let toolChoice: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption | undefined
    if (params.toolChoice && tools) {
      if (params.toolChoice === 'auto') {
        toolChoice = 'auto'
      } else if (params.toolChoice === 'required') {
        toolChoice = 'required'
      } else if (typeof params.toolChoice === 'object' && params.toolChoice.type === 'tool') {
        toolChoice = { type: 'function', function: { name: params.toolChoice.name } }
      }
    }

    const response = await this.client.chat.completions.create({
      model: params.model,
      messages: openAIMessages,
      tools,
      tool_choice: toolChoice,
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
    // Detection is lenient: look for DSML keyword + invoke pattern (spacing varies)
    if (toolCalls.length === 0 && textContent.includes('DSML') && textContent.includes('invoke name=')) {
      const parsedFromText = this.parseDsmlToolCalls(textContent)
      if (parsedFromText.calls.length > 0) {
        toolCalls = parsedFromText.calls
        // Remove the DSML from the visible text content
        textContent = parsedFromText.cleanedText
      }
    }

    // Final cleanup: strip any residual DSML markup that wasn't fully parsed
    // This prevents raw XML from leaking into the UI
    if (textContent.includes('DSML') || textContent.includes('invoke') || textContent.includes('parameter')) {
      textContent = this.stripResidualDsml(textContent)
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
   * Handles various DSML formats that DeepSeek may output:
   *   - <|DSML|invoke name="tool">
   *   - < | DSML | invoke name="tool">  
   *   - < | | DSML | | invoke name="tool">
   *   - Closing tags: </|DSML|invoke>, </| | DSML | | invoke>
   * Note: DeepSeek outputs vary wildly in spacing — regex must be very flexible.
   */
  private parseDsmlToolCalls(text: string): { calls: NormalizedToolCall[]; cleanedText: string } {
    const calls: NormalizedToolCall[] = []

    // Very flexible DSML pattern: 
    // Open: < followed by any combo of |, spaces, newlines, then DSML, then any combo of |, spaces, newlines
    // Match: <|DSML|, < | DSML |, < | | DSML | |, etc.
    const dsmlOpen = '<[\\s|]*DSML[\\s|]*'
    // Close: </ followed by any combo of |, spaces, newlines, then DSML (optional), then any combo
    // Some outputs omit DSML in closing tag, just have </| | invoke>
    const dsmlClose = '<\\/[\\s|]*(?:DSML)?[\\s|]*'

    // Match invoke blocks
    const invokeRegex = new RegExp(
      dsmlOpen + 'invoke\\s+name=["\']([^"\']+)["\'][^>]*>([\\s\\S]*?)' + dsmlClose + 'invoke[\\s|]*>',
      'gi'
    )
    let match

    while ((match = invokeRegex.exec(text)) !== null) {
      const toolName = match[1]
      const invokeBody = match[2]

      // Extract parameters from the invoke body
      const args: Record<string, unknown> = {}
      const paramRegex = new RegExp(
        dsmlOpen + 'parameter\\s+name=["\']([^"\']+)["\'][^>]*>([\\s\\S]*?)' + dsmlClose + 'parameter[\\s|]*>',
        'gi'
      )
      let paramMatch

      while ((paramMatch = paramRegex.exec(invokeBody)) !== null) {
        const paramName = paramMatch[1]
        let paramValue = paramMatch[2].trim()
        
        // Clean up any nested DSML artifacts in the value
        paramValue = paramValue.replace(/<[\/\s|]*(?:DSML)?[\/\s|]*/g, '').trim()
        
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
    const toolCallsStartRegex = new RegExp(dsmlOpen + 'tool_calls[\\s|]*>', 'i')
    const toolCallsMatch = text.match(toolCallsStartRegex)
    if (toolCallsMatch && toolCallsMatch.index !== undefined) {
      cleanedText = text.slice(0, toolCallsMatch.index).trim()
    } else if (calls.length > 0) {
      // Found invoke blocks but no tool_calls wrapper — remove all DSML content
      // This handles cases where DeepSeek outputs DSML without a wrapper
      const allDsmlRegex = /<[\/\s|]*(?:DSML)?[\/\s|]*(?:tool_calls|invoke|parameter)[^>]*>[\s\S]*?(?:<[\/\s|]*(?:DSML)?[\/\s|]*(?:tool_calls|invoke|parameter)[\/\s|]*>|$)/gi
      cleanedText = text.replace(allDsmlRegex, '').trim()
      
      // Also remove any stray DSML tags
      cleanedText = cleanedText.replace(/<[\/\s|]*DSML[\/\s|]*/g, '').trim()
    }

    return { calls, cleanedText }
  }

  /**
   * Strip any DSML/XML-like tool markup from text, even if it couldn't be parsed.
   * This is a last-resort cleanup to prevent raw markup from showing in the UI.
   */
  private stripResidualDsml(text: string): string {
    if (!text) return text
    
    // Pattern to match DSML blocks: anything from < | DSML or <|DSML to the end
    // This catches partial/malformed DSML that wasn't fully parsed
    const patterns = [
      // Full tool_calls block to end
      /<[\s|]*DSML[\s|]*tool_calls[\s\S]*$/i,
      // Standalone invoke blocks
      /<[\s|]*DSML[\s|]*invoke[\s\S]*?<\/[\s|]*(?:DSML[\s|]*)?invoke[\s|]*>/gi,
      // Unclosed invoke blocks (to end of string)
      /<[\s|]*DSML[\s|]*invoke[\s\S]*$/i,
      // Any remaining DSML tags (open or close)
      /<\/?[\s|]*DSML[\s|]*[^>]*>/gi,
      // Stray pipe-delimited tags like < | | parameter> or </| | invoke>
      /<\/?[\s|]+[a-z_]+[\s|]*>/gi,
    ]
    
    let cleaned = text
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '')
    }
    
    return cleaned.trim()
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
