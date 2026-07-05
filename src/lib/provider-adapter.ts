// ---------------------------------------------------------------------------
// Brew Model Selector — Provider Adapter Interface & Shared Types
// ---------------------------------------------------------------------------
// Defines the contract that all provider adapters must implement, plus the
// normalized message types used to communicate between the tool loop and
// individual provider adapters.
// ---------------------------------------------------------------------------

import type { AnthropicToolDefinition } from './tool-types'

// Re-export for convenient use across adapter implementations
export type { AnthropicToolDefinition } from './tool-types'

// ---------------------------------------------------------------------------
// Normalized Response Types
// ---------------------------------------------------------------------------

/** Normalized response from any provider */
export interface NormalizedMessage {
  /** Text content blocks from the response */
  textContent: string
  /** Tool calls requested by the model (empty if none) */
  toolCalls: NormalizedToolCall[]
  /** Whether the model wants to use tools (true) or has finished (false) */
  wantsToolUse: boolean
  /** Raw token usage for cost calculation */
  usage: { inputTokens: number; outputTokens: number }
}

/** A single tool call extracted from any provider's response */
export interface NormalizedToolCall {
  /** Unique ID for correlating results (generated if provider doesn't provide one) */
  id: string
  /** Tool function name */
  name: string
  /** Parsed arguments object */
  arguments: Record<string, unknown>
}

/** Result of a tool execution, to be sent back to the model */
export interface ToolResult {
  /** Matches NormalizedToolCall.id */
  callId: string
  /** Result text */
  content: string
  /** Whether the tool execution errored */
  isError: boolean
}

/** A message in the conversation history (provider-specific content preserved) */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  /** Provider-specific content preserved between calls */
  content: unknown
}

// ---------------------------------------------------------------------------
// Provider Adapter Interface
// ---------------------------------------------------------------------------

/** Provider adapter — translates between internal format and provider-native format */
export interface ProviderAdapter {
  /** Provider identifier for error messages */
  readonly providerName: string

  /**
   * Send a message to the model with tool definitions.
   * Handles translation of tools to provider format and response normalization.
   */
  sendMessage(params: {
    model: string
    system: string
    messages: ConversationMessage[]
    tools: AnthropicToolDefinition[]
    maxTokens: number
  }): Promise<NormalizedMessage>

  /**
   * Format tool results for the next request in the provider's expected format.
   * Returns messages to append to the conversation.
   */
  formatToolResults(
    assistantResponse: NormalizedMessage,
    results: ToolResult[]
  ): ConversationMessage[]
}
