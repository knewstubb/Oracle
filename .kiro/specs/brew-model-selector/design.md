# Design Document: Brew Model Selector

## Overview

This feature introduces a provider-agnostic adapter layer that allows the brew chat to use Anthropic, Google Gemini, or DeepSeek models interchangeably. The core challenge is normalizing tool-calling semantics across three different API formats while maintaining identical tool execution behavior. The design adds a model registry with pricing metadata, a provider adapter interface, session-level model persistence, and a UI dropdown for model selection.

The decision extraction step (Haiku) remains pinned to Anthropic regardless of conversation model, ensuring consistent extraction quality and avoiding coupling the extraction pipeline to the user's model choice.

### Key Design Decisions

1. **Adapter pattern over SDK abstraction** — Each provider gets its own adapter that implements a common interface, rather than wrapping all SDKs behind a single unified client. This avoids lowest-common-denominator limitations.
2. **Anthropic format as internal canonical format** — Tool definitions and tool results stay in Anthropic format internally. Adapters translate to/from provider-native format at the boundary. This minimizes changes to existing tool registry and executor code.
3. **Session-level model persistence** — Model choice is stored per-session (not per-message), matching the UX where a user picks a model and sticks with it until they decide to switch.
4. **DeepSeek via OpenAI SDK** — DeepSeek uses an OpenAI-compatible API, so we reuse the `openai` package with a custom `baseURL` rather than adding a third SDK.

## Architecture

```mermaid
graph TD
    UI[Model Selector Dropdown] -->|model_id| API[/api/brew/chat]
    API -->|resolve model config| Registry[Model Registry]
    API -->|create adapter| AdapterFactory[Provider Adapter Factory]
    AdapterFactory -->|anthropic| AnthropicAdapter
    AdapterFactory -->|gemini| GeminiAdapter
    AdapterFactory -->|deepseek| DeepSeekAdapter
    
    AnthropicAdapter --> ToolLoop[Tool Execution Loop]
    GeminiAdapter --> ToolLoop
    DeepSeekAdapter --> ToolLoop
    
    ToolLoop -->|execute tools| ToolRegistry[Tool Registry]
    ToolLoop -->|final text| SSE[SSE Stream]
    
    SSE -->|full text| Extractor[Decision Extractor - Haiku]
    Extractor -->|always Anthropic| AnthropicSDK[Anthropic SDK]
    
    API -->|persist model_id| DB[(brew_sessions)]
```

### Request Flow

1. Client sends `{ sessionId, message, history, modelId }` to `/api/brew/chat`
2. Route resolves `modelId` → `ModelConfig` from registry
3. Route creates the appropriate `ProviderAdapter` via factory
4. `runToolLoop()` uses the adapter for all model calls (translate tools → call API → normalize response → detect tool use → loop)
5. Final text is streamed to client via SSE
6. Decision extraction runs against Anthropic Haiku (unchanged, always Anthropic)
7. Session's `model_id` column is updated if changed

## Components and Interfaces

### Provider Adapter Interface

```typescript
// src/lib/provider-adapter.ts

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

export interface NormalizedToolCall {
  id: string          // Unique ID for correlating results (generated if provider doesn't provide one)
  name: string        // Tool function name
  arguments: Record<string, unknown>  // Parsed arguments object
}

export interface ToolResult {
  callId: string      // Matches NormalizedToolCall.id
  content: string     // Result text
  isError: boolean
}

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

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  content: unknown  // Provider-specific content preserved between calls
}
```

### Anthropic Adapter

```typescript
// src/lib/adapters/anthropic-adapter.ts
import Anthropic from '@anthropic-ai/sdk'

export class AnthropicAdapter implements ProviderAdapter {
  readonly providerName = 'Anthropic'
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async sendMessage(params): Promise<NormalizedMessage> {
    // Anthropic tools are already in internal format — pass through
    const response = await this.client.messages.create({
      model: params.model,
      system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }],
      messages: params.messages as Anthropic.MessageParam[],
      tools: params.tools as Anthropic.Tool[],
      max_tokens: params.maxTokens,
    })
    return this.normalizeResponse(response)
  }

  formatToolResults(assistantResponse, results): ConversationMessage[] {
    // Return assistant message + tool_result blocks (existing pattern)
  }
}
```

### Gemini Adapter

```typescript
// src/lib/adapters/gemini-adapter.ts
import { GoogleGenerativeAI } from '@google/generative-ai'

export class GeminiAdapter implements ProviderAdapter {
  readonly providerName = 'Gemini'
  private genAI: GoogleGenerativeAI

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey)
  }

  async sendMessage(params): Promise<NormalizedMessage> {
    // Translate AnthropicToolDefinition[] → Gemini FunctionDeclaration[]
    // Call generateContent with tools
    // Normalize functionCall parts → NormalizedToolCall[]
  }

  private translateTools(tools: AnthropicToolDefinition[]): FunctionDeclaration[] {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,  // JSON Schema is compatible
    }))
  }
}
```

### DeepSeek Adapter

```typescript
// src/lib/adapters/deepseek-adapter.ts
import OpenAI from 'openai'

export class DeepSeekAdapter implements ProviderAdapter {
  readonly providerName = 'DeepSeek'
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com/v1',
    })
  }

  async sendMessage(params): Promise<NormalizedMessage> {
    // Translate AnthropicToolDefinition[] → OpenAI function tools format
    // Call chat.completions.create with tools
    // Normalize tool_calls → NormalizedToolCall[]
  }

  private translateTools(tools: AnthropicToolDefinition[]): OpenAI.ChatCompletionTool[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }))
  }
}
```

### Provider Factory

```typescript
// src/lib/provider-factory.ts

export function createProviderAdapter(config: ModelConfig): ProviderAdapter {
  switch (config.provider) {
    case 'anthropic': {
      const key = process.env.ANTHROPIC_API_KEY
      if (!key) throw new ProviderConfigError('ANTHROPIC_API_KEY', 'Anthropic')
      return new AnthropicAdapter(key)
    }
    case 'gemini': {
      const key = process.env.GEMINI_API_KEY
      if (!key) throw new ProviderConfigError('GEMINI_API_KEY', 'Gemini')
      return new GeminiAdapter(key)
    }
    case 'deepseek': {
      const key = process.env.DEEPSEEK_API_KEY
      if (!key) throw new ProviderConfigError('DEEPSEEK_API_KEY', 'DeepSeek')
      return new DeepSeekAdapter(key)
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }
}

export class ProviderConfigError extends Error {
  constructor(public envVar: string, public provider: string) {
    super(`Missing API key: ${envVar} is required for ${provider} provider`)
  }
}
```

### Model Registry

```typescript
// src/lib/ai-models.ts (rewritten)

export interface ModelConfig {
  id: string
  label: string
  provider: 'anthropic' | 'gemini' | 'deepseek'
  modelId: string
  inputCostPerMillion: number   // USD per 1M input tokens
  outputCostPerMillion: number  // USD per 1M output tokens
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'sonnet-4',
    label: 'Claude Sonnet 4',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    inputCostPerMillion: 3.00,
    outputCostPerMillion: 15.00,
  },
  {
    id: 'gemini-35-flash',
    label: 'Gemini 3.5 Flash',
    provider: 'gemini',
    modelId: 'gemini-3.5-flash',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.60,
  },
  {
    id: 'gemini-25-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'gemini',
    modelId: 'gemini-2.5-flash-preview-05-20',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.60,
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    modelId: 'deepseek-chat',
    inputCostPerMillion: 0.27,
    outputCostPerMillion: 1.10,
  },
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    modelId: 'deepseek-chat', // Uses the same endpoint, lighter model variant
    inputCostPerMillion: 0.07,
    outputCostPerMillion: 0.28,
  },
]

export const DEFAULT_MODEL_ID = 'sonnet-4'

export function getModelConfig(modelId: string): ModelConfig {
  return AVAILABLE_MODELS.find(m => m.id === modelId) ?? AVAILABLE_MODELS[0]
}

export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const config = getModelConfig(modelId)
  return (
    (inputTokens / 1_000_000) * config.inputCostPerMillion +
    (outputTokens / 1_000_000) * config.outputCostPerMillion
  )
}
```

### Refactored Tool Loop

```typescript
// src/lib/tool-executor.ts (refactored)

export interface ToolLoopOptions {
  adapter: ProviderAdapter
  model: string
  system: string
  messages: ConversationMessage[]
  maxTokens: number
  onToolEvent: (event: ToolStreamEvent) => void
}

export interface ToolLoopResult {
  text: string
  usage: { inputTokens: number; outputTokens: number }
}

export async function runToolLoop(options: ToolLoopOptions): Promise<ToolLoopResult> {
  const { adapter, model, system, messages, maxTokens, onToolEvent } = options
  const tools = getToolDefinitions()
  const loopStart = Date.now()
  let currentMessages = [...messages]
  let iterations = 0
  let totalUsage = { inputTokens: 0, outputTokens: 0 }

  while (iterations < MAX_TOOL_ITERATIONS) {
    if (Date.now() - loopStart > LOOP_TIMEOUT_MS) {
      onToolEvent({ type: 'error', error_message: 'Tool execution timeout' })
      break
    }

    const response = await adapter.sendMessage({
      model, system, messages: currentMessages, tools, maxTokens,
    })

    totalUsage.inputTokens += response.usage.inputTokens
    totalUsage.outputTokens += response.usage.outputTokens

    if (!response.wantsToolUse) {
      return { text: response.textContent, usage: totalUsage }
    }

    // Execute tools (same timeout/retry logic as before)
    const results: ToolResult[] = []
    for (const call of response.toolCalls) {
      onToolEvent({ type: 'tool_status', tool_name: call.name, status: 'running' })
      let result: ToolExecutionResult
      try {
        result = await Promise.race([
          executeTool(call.name, call.arguments),
          new Promise<ToolExecutionResult>((_, reject) =>
            setTimeout(() => reject(new Error('Tool timeout')), TOOL_TIMEOUT_MS)
          ),
        ])
      } catch {
        result = { content: `Tool "${call.name}" timed out`, is_error: true }
      }
      onToolEvent({ type: 'tool_status', tool_name: call.name, status: result.is_error ? 'error' : 'complete' })
      results.push({ callId: call.id, content: result.content, isError: result.is_error })
    }

    // Append results in provider-specific format
    currentMessages = [
      ...currentMessages,
      ...adapter.formatToolResults(response, results),
    ]
    iterations++
  }

  // Fallback: final call without tools
  const fallback = await adapter.sendMessage({
    model, system, messages: currentMessages, tools: [], maxTokens,
  })
  totalUsage.inputTokens += fallback.usage.inputTokens
  totalUsage.outputTokens += fallback.usage.outputTokens
  return { text: fallback.textContent, usage: totalUsage }
}
```

### UI Component — Model Selector

```typescript
// src/components/brew/ModelSelector.tsx
'use client'

interface ModelSelectorProps {
  selectedModelId: string
  onModelChange: (modelId: string) => void
  disabled?: boolean  // True while streaming
}
```

The component renders as a compact `<select>` or custom dropdown positioned next to the chat input. Each option shows: `{label} — ${inputCost}/${outputCost} per 1M tokens`. A coloured dot (Anthropic: orange, Gemini: blue, DeepSeek: green) indicates the provider visually.

## Data Models

### Database Schema Change

New migration `022-brew-session-model.sql`:

```sql
-- Add model_id column to brew_sessions for persisting model selection
ALTER TABLE brew_sessions ADD COLUMN model_id TEXT DEFAULT NULL;
```

When `model_id` is `NULL`, the system defaults to `'sonnet-4'` (the `DEFAULT_MODEL_ID` constant).

### API Request Shape Change

```typescript
// POST /api/brew/chat body
interface ChatBody {
  sessionId: number
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  modelId?: string  // New — optional, defaults to session's stored model or DEFAULT_MODEL_ID
}
```

### SSE Response Addition

A new `cost` event is emitted after the final text:

```typescript
{ type: 'cost', inputTokens: number, outputTokens: number, estimatedCost: number }
```

### Environment Variables

| Variable | Provider | Required |
|----------|----------|----------|
| `ANTHROPIC_API_KEY` | Anthropic | Yes (also used for decision extraction) |
| `GEMINI_API_KEY` | Google Gemini | No — only if Gemini models are used |
| `DEEPSEEK_API_KEY` | DeepSeek | No — only if DeepSeek models are used |

At startup, the app logs a warning for any missing provider key but does not fail. The missing-key error surfaces only when a user selects a model whose provider key is absent.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Model config shape invariant

*For any* model entry in `AVAILABLE_MODELS`, it SHALL contain non-empty `id`, `label`, `provider`, `modelId`, and numeric `inputCostPerMillion` >= 0 and `outputCostPerMillion` >= 0.

**Validates: Requirements 1.2**

### Property 2: Model lookup correctness

*For any* string `id`, calling `getModelConfig(id)` SHALL return the matching entry if `id` exists in the registry, or the default model (Sonnet 4) if `id` is not found.

**Validates: Requirements 1.3, 1.4**

### Property 3: Tool definition translation preserves semantics

*For any* valid `AnthropicToolDefinition` and any provider adapter, translating the definition to the provider's native format SHALL preserve the tool's `name`, `description`, and the structure of `input_schema` (property names, types, required fields).

**Validates: Requirements 2.1, 2.3, 2.4, 2.5**

### Property 4: Response normalization round-trip

*For any* provider's tool-use response containing one or more tool calls, normalizing via the adapter SHALL produce `NormalizedToolCall` entries that preserve the tool `name`, `arguments` object, and a non-empty `id`. The `wantsToolUse` flag SHALL be `true` when tool calls are present and `false` otherwise.

**Validates: Requirements 2.2, 2.6**

### Property 5: Malformed response graceful handling

*For any* response from a provider that contains malformed tool-use data (missing `name`, unparseable `arguments`, null tool calls array), the adapter SHALL return a `NormalizedMessage` with `wantsToolUse: false` and include error information in `textContent`, rather than throwing an unhandled exception.

**Validates: Requirements 2.7**

### Property 6: Session model persistence round-trip

*For any* valid model ID from the registry, storing it on a session and then loading that session SHALL return the same model ID.

**Validates: Requirements 4.1, 4.2**

### Property 7: Model change preserves session identity

*For any* brew session and any sequence of model changes, the session `id` SHALL remain constant and no new session rows SHALL be created.

**Validates: Requirements 4.4**

### Property 8: Missing API key error specificity

*For any* provider whose environment variable is unset, calling `createProviderAdapter` SHALL throw a `ProviderConfigError` whose message includes both the environment variable name and the provider name.

**Validates: Requirements 5.4**

### Property 9: Tool loop behaviour invariants

*For any* provider adapter, the tool loop SHALL enforce the same `TOOL_TIMEOUT_MS`, `LOOP_TIMEOUT_MS`, and `MAX_TOOL_ITERATIONS` constants, and SHALL execute the same tool via `executeTool()` regardless of which adapter is in use.

**Validates: Requirements 6.2**

### Property 10: Provider error attribution

*For any* provider adapter that throws an API error during `sendMessage`, the error surfaced to the SSE stream SHALL include the adapter's `providerName` string.

**Validates: Requirements 6.4**

### Property 11: Decision extraction independence

*For any* model selection (including non-Anthropic providers), the decision extraction step SHALL invoke the Anthropic SDK with model `'claude-haiku-4-5-20251001'` and SHALL receive the complete text from the main conversation response.

**Validates: Requirements 7.1, 7.2**

### Property 12: Cost calculation correctness

*For any* non-negative `inputTokens` and `outputTokens` and any valid model ID, `calculateCost(modelId, inputTokens, outputTokens)` SHALL equal `(inputTokens / 1_000_000) * model.inputCostPerMillion + (outputTokens / 1_000_000) * model.outputCostPerMillion`.

**Validates: Requirements 8.1**

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Missing API key for selected provider | `ProviderConfigError` thrown at adapter creation; caught in route, returned as 400 with message naming the missing key |
| Provider API timeout | Adapter's `sendMessage` rejects; tool loop catches and emits `error` SSE event with provider name |
| Provider rate limit (429) | Adapter propagates; route emits `error` SSE event suggesting retry |
| Malformed tool-use response | Adapter normalizes to `wantsToolUse: false` with error text; loop terminates gracefully |
| Invalid `modelId` in request | `getModelConfig` falls back to default; route proceeds with Sonnet 4 |
| Gemini safety filter blocks response | Adapter treats as end-of-turn with empty text; route emits a user-friendly explanation |
| DeepSeek content filter | Same as Gemini — treat as end-of-turn |
| Tool execution failure during non-Anthropic loop | Same handling as today — `is_error: true` result appended, model continues |

## Testing Strategy

### Property-Based Tests (fast-check)

Each correctness property above maps to a property-based test using `fast-check`. Configuration: minimum 100 iterations per property.

- **Library:** `fast-check` (already available in the ecosystem for TypeScript/Vitest)
- **Tag format:** `Feature: brew-model-selector, Property {N}: {title}`

Key generators needed:
- `arbitraryToolDefinition()` — generates random `AnthropicToolDefinition` objects
- `arbitraryModelId()` — generates both valid registry IDs and random strings
- `arbitraryTokenCounts()` — non-negative integer pairs
- `arbitraryMalformedResponse()` — responses with missing/null/wrong-type fields

### Unit Tests

- Adapter construction with/without API keys
- Each adapter's `translateTools` output format
- `getModelConfig` with known and unknown IDs
- `calculateCost` with concrete examples
- Model selector component rendering states (open, closed, disabled)
- SSE cost event emission after tool loop completes

### Integration Tests

- Full tool loop with a mock Gemini adapter (verify tool execution + normalization)
- Full tool loop with a mock DeepSeek adapter
- API route accepts `modelId` and creates correct adapter
- Session model persistence across load/save cycle
- Decision extraction still fires when conversation model is Gemini
