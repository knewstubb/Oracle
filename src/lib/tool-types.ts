// ---------------------------------------------------------------------------
// Brew AI Tools — Shared Type Definitions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SSE Event Types
// ---------------------------------------------------------------------------

/** SSE event types for tool execution status */
export type ToolStreamEventType = 'tool_status' | 'text_delta' | 'done' | 'error' | 'candidates' | 'add_cards' | 'commander_summary'

/** Structured commander summary for display in brew chat */
export interface CommanderSummary {
  name: string
  mana_cost: string
  type_line: string
  oracle_text: string
  color_identity: string[]
  image_uri: string
  tagline: string
  analysis: string
  collection_status: {
    owned: boolean
    quantity: number
    in_decks: Array<{ deck_name: string; is_commander: boolean }>
    proxy_conflicts: string[]
  }
}

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
  /** Structured commander summary from present_commander_summary tool */
  summary?: CommanderSummary
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

/** Execution context passed to tools */
export interface ToolExecutionContext {
  userId?: string
}

/** A registered tool: schema + executor */
export interface RegisteredTool {
  definition: AnthropicToolDefinition
  execute: (input: Record<string, unknown>, context?: ToolExecutionContext) => Promise<ToolExecutionResult>
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
