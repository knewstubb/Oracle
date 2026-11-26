# Implementation Plan: Brew AI Tools

## Overview

This plan implements the Anthropic tool-use integration for the `/api/brew/chat` endpoint, giving Oracle real-time access to card data, collection ownership, deck state, EDHREC recommendations, combo interactions, and rules via the existing `mtg-mcp` MCP client singleton + local SQLite queries. The implementation follows the dependency graph: data layer → tool registry → execution loop → route refactor → system prompt → client-side parsing → integration tests.

## Tasks

- [x] 1. Define tool types and CardRepository interface (data layer foundation)
  - [x] 1.1 Create `src/lib/tool-types.ts` with shared type definitions
    - Define `ToolStreamEventType`, `ToolStreamEvent`, `ToolExecutionResult`, `RegisteredTool`, and `AnthropicToolDefinition` interfaces
    - Export all types for use across the tool system
    - _Requirements: 6.2, 6.3_

  - [x] 1.2 Create `src/lib/card-repository.ts` with the CardRepository interface and factory
    - Define `OwnedCardInfo`, `DeckAllocation`, `DeckContextCard`, `DeckContextResult` interfaces
    - Define the `CardRepository` interface with async method signatures (`getOwnedCards`, `getCardsByColourIdentity`, `getDeckAllocations`, `getDeckContext`, `getDecisionLog`)
    - Implement `getCardRepository()` factory that returns the active implementation
    - _Requirements: 9.1, 9.4, 9.5_

- [x] 2. Implement SqliteCardRepository, LRU cache, and rate limiter
  - [x] 2.1 Create `src/lib/sqlite-card-repository.ts` implementing CardRepository
    - Implement `getOwnedCards` — batch query by card names with quantity, set_code, foil
    - Implement `getCardsByColourIdentity` — query all owned cards filtered by colour identity subset
    - Implement `getDeckAllocations` — query deck_cards + decks join for allocation data
    - Implement `getDeckContext` — query brew session, return deck state or skeleton based on phase
    - Implement `getDecisionLog` — parse stored JSON from brew_sessions
    - _Requirements: 9.2, 9.3, 3.2, 3.3, 3.5, 5.1, 5.2, 5.5_

  - [x] 2.2 Create `src/lib/scryfall-cache.ts` with LRU cache and sliding-window rate limiter
    - Implement `LruCache<K, V>` class with maxSize=500, get/set with LRU eviction
    - Implement `SlidingWindowRateLimiter` class with 10 requests/second sliding window
    - Implement `scryfallSearch(query)` function using cache + rate limiter + fetch
    - Export singleton cache and rate limiter instances
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [ ]* 2.3 Write property test for LRU cache correctness
    - **Property 12: LRU Cache Correctness**
    - Generate random sequences of set/get operations, verify cache size never exceeds maxSize, values are correctly stored/retrieved, and LRU entry is evicted on overflow
    - **Validates: Requirements 8.2, 8.3**

  - [ ]* 2.4 Write property test for rate limiter sliding window
    - **Property 13: Rate Limiter Sliding Window**
    - Generate burst patterns of acquire() calls, verify no more than 10 complete within any 1-second window
    - **Validates: Requirements 8.5**

- [x] 3. Implement tool registry and individual tool executors
  - [x] 3.1 Create `src/lib/tool-registry.ts` with registry map, tool definitions, and executors
    - Implement the `registry` Map with `getToolDefinitions()` and `executeTool(name, input)` exports
    - Register 7 MCP-proxied tools via `registerMcpTool` helper: `mtg_ruling_search`, `mtg_rules_search`, `mtg_commander_recommend`, `mtg_combos_search`, `mtg_commander_deck`, `mtg_commander_brackets`, `mtg_cardtypes_get`
    - Implement and register `collection_lookup` executor — queries CardRepository for owned cards + deck allocations, returns formatted ownership data with "not_owned" status for missing cards
    - Implement and register `deck_context` executor — queries CardRepository for deck state or decision log based on session phase
    - Implement and register `scryfall_search` executor — calls `scryfallSearch()` from scryfall-cache module
    - Define JSON Schema `input_schema` for each tool matching the Data Models section in the design
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 2.3, 2.4, 2.7, 3.1, 3.2, 3.4, 3.5, 5.1, 5.5, 5.6_

  - [ ]* 3.2 Write property test for collection lookup ownership data
    - **Property 4: Collection Lookup Returns Ownership Data**
    - Generate random collection DB states and card name arrays, verify exactly one entry per input name with correct ownership shape
    - **Validates: Requirements 3.1, 3.2, 3.4**

  - [ ]* 3.3 Write property test for collection lookup deck allocations
    - **Property 5: Collection Lookup Includes Deck Allocations**
    - Generate random deck_cards entries, verify allocation data is included for cards appearing in decks
    - **Validates: Requirements 3.3**

  - [ ]* 3.4 Write property test for colour identity filter subset correctness
    - **Property 6: Colour Identity Filter Subset Correctness**
    - Generate random colour subsets and collection states, verify every returned card's identity is a subset of the filter
    - **Validates: Requirements 3.5**

  - [ ]* 3.5 Write property test for tool registry structural invariant
    - **Property 11: Tool Registry Structural Invariant**
    - Iterate all registered tools, verify each has a non-empty name with underscore, non-empty description, input_schema with type "object", and callable executor
    - **Validates: Requirements 6.2, 6.3, 6.5**

- [x] 4. Implement tool execution loop
  - [x] 4.1 Create `src/lib/tool-executor.ts` with the `runToolLoop` function
    - Implement the loop: call Claude (non-streaming) → detect `stop_reason: "tool_use"` → execute tools → append results → re-invoke
    - Implement per-tool timeout (15s via Promise.race)
    - Implement total loop timeout (30s elapsed check)
    - Implement max iteration guard (10 iterations)
    - Emit `tool_status` events via `onToolEvent` callback (running/complete/error)
    - On timeout or max iterations, make final call without tools for best-effort response
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 8.6_

  - [ ]* 4.2 Write property test for tool execution loop completeness
    - **Property 1: Tool Execution Loop Completeness**
    - Generate mock Anthropic responses with 1-10 tool_use blocks, verify all N tools executed and N tool_result entries appended
    - **Validates: Requirements 1.1, 1.2, 2.4**

  - [ ]* 4.3 Write property test for tool status event emission
    - **Property 2: Tool Status Event Emission**
    - Generate random tool execution sequences, verify exactly one "running" + one "complete/error" event per tool invocation
    - **Validates: Requirements 1.3**

  - [ ]* 4.4 Write property test for tool error propagation
    - **Property 3: Tool Error Propagation**
    - Generate tools that throw various errors or timeout, verify `is_error: true` result with non-empty content and loop continuation
    - **Validates: Requirements 1.5, 2.5**

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Refactor `/api/brew/chat` route to use the tool loop
  - [x] 6.1 Modify `src/app/api/brew/chat/route.ts` to integrate the tool execution loop
    - Replace the pure `messages.stream()` pattern with: build messages → run `runToolLoop()` → stream final text response via SSE
    - Emit `tool_status` SSE events during tool execution (format: `data: {"type":"tool_status","tool_name":"...","status":"..."}\n\n`)
    - Stream final text response as `text_delta` events (format: `data: {"type":"text_delta","text":"..."}\n\n`)
    - Maintain `[DONE]` signal at end of stream
    - Pass `sessionId` into tool context so `deck_context` executor can access it
    - Include tool definitions in the Anthropic API call via `getToolDefinitions()`
    - Handle error events gracefully (emit error SSE event, still close stream)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.6_

- [x] 7. Create system prompt with tool guidance
  - [x] 7.1 Create `src/lib/brew-tool-prompt.ts` with the tool-use system prompt
    - Include guidance for when to use each tool: `scryfall_search` for card search/verification, `mtg_commander_recommend` for EDHREC data, `mtg_combos_search` for combos, `collection_lookup` for ownership, `deck_context` for deck state
    - Instruct model to verify commander suggestions via `mtg_commander_deck` before presenting
    - Instruct model to batch collection lookups (multiple card names per call)
    - Instruct model NOT to call tools for general strategy discussion
    - Instruct model to use `mtg_commander_recommend` when user asks about popular cards/staples
    - Instruct model to present ownership context conversationally (woven into suggestions)
    - Instruct model to use `mtg_combos_search` for win conditions and synergies
    - Instruct model to use `mtg_commander_brackets` for power level discussions
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [x] 7.2 Integrate the tool-use system prompt into the chat route
    - Import `brew-tool-prompt.ts` and combine with the existing exploration prompt
    - Ensure the tool guidance section is included in the system message passed to `runToolLoop()`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 8. Update client-side SSE parsing for tool_status events
  - [x] 8.1 Modify `src/app/new-deck/page.tsx` to handle new SSE event format
    - Parse `tool_status` events and display tool execution indicators (tool name + running/complete/error state)
    - Parse `text_delta` events for streamed text tokens (replacing the previous plain JSON string format)
    - Handle `error` events gracefully (display subtle indicator, continue conversation)
    - Maintain backward compatibility with `[DONE]` signal
    - Show/hide tool status UI during tool execution phases
    - _Requirements: 1.3, 1.4_

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Integration and validation testing
  - [ ]* 10.1 Write unit tests for tool registry
    - Verify registry contains all 10 expected tools (7 MCP + 2 local + 1 Scryfall)
    - Verify tool definition schemas are valid JSON Schema
    - Verify `executeTool` with unknown name returns `is_error: true`
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 10.2 Write integration test for tool execution loop with mocked Anthropic API
    - Mock Anthropic to return tool_use response, then final text response
    - Verify message assembly (tool_result appended correctly)
    - Verify event emission order (running → complete for each tool)
    - Verify timeout handling
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

  - [ ]* 10.3 Write property tests for EDHREC ownership annotation and deck context
    - **Property 7: EDHREC Results Annotated with Ownership** — generate EDHREC results + collection state, verify annotations match DB
    - **Property 8: Deck Context Returns Correct Card Data** — generate random deck states, verify total_cards and card entry structure
    - **Property 9: Category Health Computation** — generate category counts + targets, verify health classification logic
    - **Property 10: Phase Determines Deck Context Output** — generate sessions in both phases, verify correct output type
    - **Validates: Requirements 4.4, 5.1, 5.2, 5.3, 5.5**

  - [ ]* 10.4 Write integration test for SSE stream parsing
    - Verify tool_status events + text_delta events + done signal are correctly emitted in sequence
    - Verify error events don't crash the stream
    - _Requirements: 1.3, 1.4_

- [ ] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `src/lib/mcp-client.ts` singleton is reused — no new MCP connection logic needed
- The design specifies TypeScript throughout; all new files use `.ts` extension
- The SSE event format changes from plain JSON strings to typed objects — client must be updated

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "6.1"] },
    { "id": 5, "tasks": ["7.1"] },
    { "id": 6, "tasks": ["7.2", "8.1"] },
    { "id": 7, "tasks": ["10.1", "10.2", "10.3", "10.4"] }
  ]
}
```
