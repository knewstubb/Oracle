// ---------------------------------------------------------------------------
// Brew Model Selector — Gemini Provider Adapter
// ---------------------------------------------------------------------------
// Implements ProviderAdapter for Google Gemini using @google/generative-ai SDK.
// Translates Anthropic-format tool definitions to Gemini FunctionDeclarations,
// normalizes functionCall responses to NormalizedToolCall[], and handles
// safety filter blocks gracefully.
// ---------------------------------------------------------------------------

import {
  GoogleGenerativeAI,
  type Content,
  type FunctionDeclaration,
  type Part,
} from '@google/generative-ai'

import type {
  ProviderAdapter,
  NormalizedMessage,
  NormalizedToolCall,
  ToolResult,
  ConversationMessage,
  AnthropicToolDefinition,
} from '../provider-adapter'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let callCounter = 0

/** Generate a unique ID for tool calls (Gemini doesn't provide one) */
function generateToolCallId(): string {
  callCounter++
  return `gemini-call-${Date.now()}-${callCounter}`
}

// ---------------------------------------------------------------------------
// Gemini Adapter
// ---------------------------------------------------------------------------

export class GeminiAdapter implements ProviderAdapter {
  readonly providerName = 'Gemini'
  private genAI: GoogleGenerativeAI

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey)
  }

  async sendMessage(params: {
    model: string
    system: string
    messages: ConversationMessage[]
    tools: AnthropicToolDefinition[]
    maxTokens: number
  }): Promise<NormalizedMessage> {
    const { model, system, messages, tools, maxTokens } = params

    const geminiTools = tools.length > 0
      ? [{ functionDeclarations: this.translateTools(tools) }]
      : undefined

    const generativeModel = this.genAI.getGenerativeModel({
      model,
      systemInstruction: system,
      generationConfig: {
        maxOutputTokens: maxTokens,
      },
    })

    const contents = this.convertMessages(messages)

    const result = await generativeModel.generateContent({
      contents,
      tools: geminiTools,
    })

    const response = result.response

    // Handle safety filter blocks: no candidates or SAFETY finish reason
    if (
      !response.candidates ||
      response.candidates.length === 0 ||
      response.candidates[0].finishReason === 'SAFETY'
    ) {
      return {
        textContent: '[Response blocked by safety filter]',
        toolCalls: [],
        wantsToolUse: false,
        usage: this.extractUsage(response),
      }
    }

    const candidate = response.candidates[0]
    const parts = candidate.content?.parts ?? []

    return this.normalizeResponse(parts, response)
  }

  formatToolResults(
    assistantResponse: NormalizedMessage,
    results: ToolResult[]
  ): ConversationMessage[] {
    // Build the model message with functionCall parts (what the model asked for)
    const functionCallParts: Part[] = assistantResponse.toolCalls.map((call) => ({
      functionCall: {
        name: call.name,
        args: call.arguments as Record<string, string>,
      },
    }))

    // Include any text content from the assistant response
    if (assistantResponse.textContent) {
      functionCallParts.unshift({ text: assistantResponse.textContent })
    }

    // Build the user message with functionResponse parts (results of execution)
    const functionResponseParts: Part[] = results.map((r) => ({
      functionResponse: {
        name: assistantResponse.toolCalls.find((c) => c.id === r.callId)?.name ?? 'unknown',
        response: {
          content: r.content,
          isError: r.isError,
        } as object,
      },
    }))

    return [
      { role: 'assistant', content: functionCallParts },
      { role: 'user', content: functionResponseParts },
    ]
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * Translate Anthropic tool definitions to Gemini FunctionDeclarations.
   * JSON Schema (input_schema) is compatible with Gemini's parameter format.
   */
  private translateTools(tools: AnthropicToolDefinition[]): FunctionDeclaration[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema as unknown as FunctionDeclaration['parameters'],
    }))
  }

  /**
   * Convert internal conversation messages to Gemini Content[] format.
   * Maps 'user' → 'user', 'assistant' → 'model'. System messages are skipped
   * (system prompt is passed via systemInstruction).
   */
  private convertMessages(messages: ConversationMessage[]): Content[] {
    const contents: Content[] = []

    for (const msg of messages) {
      if (msg.role === 'system') continue

      const role = msg.role === 'assistant' ? 'model' : 'user'

      // If content is already Gemini Part[] (from formatToolResults), use directly
      if (Array.isArray(msg.content)) {
        contents.push({ role, parts: msg.content as Part[] })
      } else if (typeof msg.content === 'string') {
        contents.push({ role, parts: [{ text: msg.content }] })
      } else {
        // Attempt to handle unknown content by stringifying
        contents.push({ role, parts: [{ text: String(msg.content) }] })
      }
    }

    return contents
  }

  /**
   * Normalize Gemini response parts into NormalizedMessage.
   * Extracts text parts and functionCall parts separately.
   */
  private normalizeResponse(
    parts: Part[],
    response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
  ): NormalizedMessage {
    const textParts: string[] = []
    const toolCalls: NormalizedToolCall[] = []

    for (const part of parts) {
      if ('text' in part && part.text) {
        textParts.push(part.text)
      } else if ('functionCall' in part && part.functionCall) {
        const fc = part.functionCall

        // Handle malformed functionCall: missing name or args → treat as end-of-turn
        if (!fc.name || typeof fc.name !== 'string') {
          return {
            textContent: textParts.join('\n') || '[Malformed tool call response — missing function name]',
            toolCalls: [],
            wantsToolUse: false,
            usage: this.extractUsage(response),
          }
        }

        const args = (fc.args && typeof fc.args === 'object')
          ? fc.args as Record<string, unknown>
          : {}

        toolCalls.push({
          id: generateToolCallId(),
          name: fc.name,
          arguments: args,
        })
      }
    }

    return {
      textContent: textParts.join('\n'),
      toolCalls,
      wantsToolUse: toolCalls.length > 0,
      usage: this.extractUsage(response),
    }
  }

  /**
   * Extract token usage from Gemini response metadata.
   */
  private extractUsage(
    response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
  ): { inputTokens: number; outputTokens: number } {
    return {
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    }
  }
}
