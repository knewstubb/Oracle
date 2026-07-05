// ---------------------------------------------------------------------------
// Brew AI Tools — Shared Type Definitions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SSE Event Types
// ---------------------------------------------------------------------------

/** SSE event types for tool execution status */
export type ToolStreamEventType = 'tool_status' | 'text_delta' | 'done' | 'error' | 'candidates' | 'add_cards'

export interface ToolStreamEvent {
  type: ToolStreamEventType
  tool_name?: string
  status?: 'running' | 'complete' | 'error'
  error_message?: string
  text?: string
  /** Structured candidate data from display_commander_candidates tool */
  commanders?: Array<{ name: string; color_identity?: string[] }>
  /** Structured card data from add_cards_to_deck tool */
  cards?: Array<{ name: string; category: string }>
}

// ---------------------------------------------------------------------------
// Tool Execution
// ---------------------------------------------------------------------------

/** Result returned from a tool executor */
export interface ToolExecutionResult {
  content: string
  is_error: boolean
}

// ---------------------------------------------------------------------------
// Tool Registration
// ---------------------------------------------------------------------------

/** A registered tool: schema + executor */
export interface RegisteredTool {
  definition: AnthropicToolDefinition
  execute: (input: Record<string, unknown>) => Promise<ToolExecutionResult>
}

/** Anthropic tool definition shape */
export interface AnthropicToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}
