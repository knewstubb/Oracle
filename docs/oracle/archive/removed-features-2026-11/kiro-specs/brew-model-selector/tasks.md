# Implementation Plan: Brew Model Selector

## Overview

This plan implements a provider-agnostic adapter layer enabling the brew chat to use Anthropic, Google Gemini, or DeepSeek models interchangeably. Tasks are sequenced to build the model registry and adapter interfaces first, then individual provider adapters, then refactor the tool loop, then wire the UI and session persistence. The decision extraction step (Haiku) remains pinned to Anthropic regardless of conversation model.

## Tasks

- [x] 1. Model registry and adapter interfaces
  - [x] 1.1 Rewrite `src/lib/ai-models.ts` with the full model registry and pricing metadata
    - Define `ModelConfig` interface with `id`, `label`, `provider`, `modelId`, `inputCostPerMillion`, `outputCostPerMillion`
    - Define `AVAILABLE_MODELS` array with entries for Sonnet 4, Gemini 3.5 Flash, Gemini 2.5 Flash, DeepSeek V4 Pro, DeepSeek V4 Flash
    - Export `DEFAULT_MODEL_ID = 'sonnet-4'`
    - Export `getModelConfig(modelId: string): ModelConfig` with fallback to default
    - Export `calculateCost(modelId, inputTokens, outputTokens): number`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 8.1_

  - [x] 1.2 Create `src/lib/provider-adapter.ts` with the `ProviderAdapter` interface and shared types
    - Define `NormalizedMessage`, `NormalizedToolCall`, `ToolResult`, `ConversationMessage` interfaces
    - Define the `ProviderAdapter` interface with `providerName`, `sendMessage()`, `formatToolResults()`
    - Export `AnthropicToolDefinition` type alias for use across adapters
    - _Requirements: 2.1, 2.2, 2.6_

  - [ ]* 1.3 Write property tests for model registry (Properties 1, 2, 12)
    - **Property 1: Model config shape invariant** — all entries have non-empty fields and non-negative costs
    - **Property 2: Model lookup correctness** — known IDs return matching entry, unknown IDs return default
    - **Property 12: Cost calculation correctness** — verify formula for arbitrary token counts
    - **Validates: Requirements 1.2, 1.3, 1.4, 8.1**

- [x] 2. Provider adapters
  - [x] 2.1 Create `src/lib/adapters/anthropic-adapter.ts`
    - Implement `ProviderAdapter` for Anthropic
    - Tools pass through in native format (Anthropic is the canonical internal format)
    - Normalize `Message` response to `NormalizedMessage`
    - `formatToolResults` returns assistant message + `tool_result` content blocks
    - Handle malformed responses gracefully (Property 5)
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 2.7_

  - [x] 2.2 Create `src/lib/adapters/gemini-adapter.ts`
    - Implement `ProviderAdapter` for Google Gemini using `@google/generative-ai` SDK
    - `translateTools()` converts `AnthropicToolDefinition[]` → Gemini `FunctionDeclaration[]`
    - Normalize `functionCall` parts → `NormalizedToolCall[]`
    - Handle Gemini safety filter blocks as end-of-turn with empty text
    - Generate unique `id` for tool calls (Gemini doesn't provide one)
    - _Requirements: 2.1, 2.2, 2.4, 2.6, 2.7_

  - [x] 2.3 Create `src/lib/adapters/deepseek-adapter.ts`
    - Implement `ProviderAdapter` for DeepSeek via `openai` package with `baseURL: 'https://api.deepseek.com/v1'`
    - `translateTools()` converts `AnthropicToolDefinition[]` → OpenAI `ChatCompletionTool[]`
    - Normalize `tool_calls` with `function` objects → `NormalizedToolCall[]`
    - Handle DeepSeek content filter as end-of-turn
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.7_

  - [x] 2.4 Create `src/lib/provider-factory.ts` with `createProviderAdapter(config: ModelConfig)`
    - Switch on `config.provider` to instantiate the correct adapter
    - Read API keys from environment variables (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`)
    - Throw `ProviderConfigError` with env var name and provider name on missing key
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 2.5 Write property tests for adapter layer (Properties 3, 4, 5, 8)
    - **Property 3: Tool definition translation preserves semantics** — name, description, schema structure preserved
    - **Property 4: Response normalization round-trip** — tool calls produce correct NormalizedToolCall entries
    - **Property 5: Malformed response graceful handling** — returns wantsToolUse: false, no unhandled exceptions
    - **Property 8: Missing API key error specificity** — ProviderConfigError includes env var name and provider
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.4**

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Refactor tool execution loop
  - [x] 4.1 Refactor `src/lib/tool-executor.ts` to accept a `ProviderAdapter` instead of a raw Anthropic client
    - Change `runToolLoop` signature to accept `ToolLoopOptions` with `adapter: ProviderAdapter`
    - Use `adapter.sendMessage()` for model calls instead of direct Anthropic SDK usage
    - Use `adapter.formatToolResults()` to append tool results in provider-specific format
    - Maintain existing timeout, max-iteration, and error handling constants
    - Emit `error` SSE events with `adapter.providerName` included in error messages
    - _Requirements: 6.1, 6.2, 6.4_

  - [ ]* 4.2 Write property tests for tool loop (Properties 9, 10)
    - **Property 9: Tool loop behaviour invariants** — same timeouts/iterations/tool execution regardless of adapter
    - **Property 10: Provider error attribution** — errors include adapter's providerName
    - **Validates: Requirements 6.2, 6.4**

- [x] 5. Database migration and session persistence
  - [x] 5.1 Create migration `022-brew-session-model.sql` to add `model_id` column to `brew_sessions`
    - `ALTER TABLE brew_sessions ADD COLUMN model_id TEXT DEFAULT NULL`
    - NULL defaults to Sonnet 4 at application level
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.2 Update `/api/brew/chat` route to accept `modelId` in request body and use the adapter layer
    - Extend `ChatBody` interface with optional `modelId?: string`
    - Resolve `modelId` → `ModelConfig` via `getModelConfig()`
    - Create adapter via `createProviderAdapter(config)`
    - Pass adapter to refactored `runToolLoop()`
    - Persist `model_id` to session on request
    - Emit `cost` SSE event after response completes with `inputTokens`, `outputTokens`, `estimatedCost`
    - Handle `ProviderConfigError` as 400 response with clear message
    - _Requirements: 4.1, 4.4, 5.4, 6.1, 8.1_

  - [ ]* 5.3 Write property tests for session persistence (Properties 6, 7)
    - **Property 6: Session model persistence round-trip** — store and load returns same model ID
    - **Property 7: Model change preserves session identity** — session ID remains constant
    - **Validates: Requirements 4.1, 4.2, 4.4**

- [x] 6. Decision extraction independence
  - [x] 6.1 Ensure decision extraction always uses Anthropic Haiku regardless of conversation model
    - Verify extraction code in `/api/brew/chat` uses `claude-haiku-4-5-20251001` with Anthropic SDK directly
    - Extraction receives the full `textContent` from `ToolLoopResult` (not provider-specific format)
    - If `ANTHROPIC_API_KEY` is missing, skip extraction gracefully and log warning
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 6.2 Write property test for decision extraction independence (Property 11)
    - **Property 11: Decision extraction independence** — extraction always uses Haiku model and receives full text regardless of conversation provider
    - **Validates: Requirements 7.1, 7.2**

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Model selector UI component
  - [x] 8.1 Create `src/components/brew/ModelSelector.tsx` client component
    - Render as compact `<select>` or custom dropdown near the chat input
    - Display current model label with coloured provider dot (orange=Anthropic, blue=Gemini, green=DeepSeek)
    - Each option shows: `{label} — ${inputCost}/${outputCost} per 1M tokens`
    - Accept `selectedModelId`, `onModelChange`, `disabled` props
    - Disable the dropdown while `disabled` is true (streaming active)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.2_

  - [x] 8.2 Wire `ModelSelector` into the brew chat page
    - Import `AVAILABLE_MODELS` and `DEFAULT_MODEL_ID` for populating options
    - Store selected model ID in component state, initialized from session's stored model
    - Pass `modelId` to `/api/brew/chat` requests
    - Disable selector while SSE stream is active
    - On model change, persist to session via existing save mechanisms
    - _Requirements: 3.3, 3.4, 4.1, 4.2, 4.3_

  - [x] 8.3 Add cost indicator to chat messages
    - After SSE `cost` event is received, display estimated cost in a subtle indicator below the message
    - Format as "$0.0012" or similar micro-cost notation
    - Non-intrusive: small muted text, not a badge or modal
    - _Requirements: 8.1, 8.3_

- [x] 9. Environment validation and startup warnings
  - [x] 9.1 Add startup API key validation in `src/lib/provider-factory.ts`
    - On module load, check presence of `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`
    - Log `console.warn()` for any missing provider key (non-fatal)
    - `ANTHROPIC_API_KEY` is always required (used for decision extraction); log error if missing
    - _Requirements: 5.4, 5.5_

  - [x] 9.2 Update `.env.local.example` with new environment variables
    - Add `GEMINI_API_KEY=` and `DEEPSEEK_API_KEY=` entries with comments
    - _Requirements: 5.2, 5.3_

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 12 universal correctness properties from the design document
- The existing `tool-executor.ts` is refactored in-place (task 4.1) — the Anthropic adapter essentially preserves existing behaviour while enabling new providers
- Decision extraction (Haiku) remains untouched in its current inline position within the chat route — it just receives text from the new `ToolLoopResult` format
- The `@google/generative-ai` package needs to be installed for Gemini support; `openai` package is reused for DeepSeek

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "2.5"] },
    { "id": 3, "tasks": ["4.1", "5.1"] },
    { "id": 4, "tasks": ["4.2", "5.2"] },
    { "id": 5, "tasks": ["5.3", "6.1"] },
    { "id": 6, "tasks": ["6.2", "8.1"] },
    { "id": 7, "tasks": ["8.2", "8.3", "9.1", "9.2"] }
  ]
}
```
