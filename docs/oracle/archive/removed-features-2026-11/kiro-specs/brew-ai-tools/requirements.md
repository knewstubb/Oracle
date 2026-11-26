# Requirements Document

## Introduction

Brew AI Tools adds Anthropic tool-use (function calling) to the Oracle brew chat, enabling the AI to take real actions during conversation rather than relying on memory and hallucination. Currently, the `/api/brew/chat` route streams a pure text response from Claude Sonnet with no tool access — the AI cannot search for cards, verify legality, check the user's collection, or query recommendation data.

This feature gives Oracle access to five tool domains:
1. **MTG data via `mtg-mcp`** — a Python MCP server ([pypi.org/project/mtg-mcp](https://pypi.org/project/mtg-mcp/)) providing Scryfall card lookup, EDHREC recommendations, Commander Spellbook combos, comprehensive rules, bracket system, and deck import
2. **Collection lookup** — queries the local database for ownership, allocation, and proxy status
3. **Deck context** — queries the current brew session's state, categories, and health
4. **Combo search** — finds card interactions via Commander Spellbook (proxied through `mtg-mcp`)
5. **Commander validation** — verifies legality, partner rules, and colour identity (proxied through `mtg-mcp`)

The `mtg-mcp` server is run as a sidecar process (via `uvx mtg-mcp` or `pip install mtg-mcp`) and accessed from the Next.js API route via its MCP transport (stdio or HTTP). This eliminates the need for custom Scryfall/EDHREC HTTP wrappers — the MCP server handles rate limiting, data formatting, and source aggregation. Tools execute server-side within the existing SSE streaming pattern, and the SQLite data layer is structured for future Supabase migration.

## Glossary

- **Brew_Chat**: The `/api/brew/chat` SSE streaming endpoint that handles Oracle conversation using Claude Sonnet with tool-use capabilities
- **Tool_Use**: Anthropic's function calling mechanism where the model requests a tool invocation mid-response, the server executes it, and the result is fed back to the model to continue generation
- **Tool_Definition**: A JSON schema object describing a tool's name, description, and input parameters, passed to the Anthropic API in the `tools` array
- **Tool_Result**: The structured response returned to the model after a tool is executed, containing either success data or an error message
- **MTG_MCP_Server**: The `mtg-mcp` Python package (PyPI) that provides an MCP server with tools for Scryfall card data, EDHREC recommendations, Commander Spellbook combos, comprehensive rules, bracket system, and deck import from Archidekt/Moxfield
- **MCP_Client**: A TypeScript client that connects to the MTG_MCP_Server process via stdio transport, enabling the Next.js API route to invoke MCP tools programmatically
- **Scryfall_Tool**: A tool proxied through MTG_MCP_Server (internally `mtg-ruling-search`, `mtg-commander-deck`) or directly via Scryfall REST API for card search and verification
- **Collection_Tool**: A tool that queries the local SQLite `collection` table to determine card ownership, quantity, and allocation across decks
- **EDHREC_Tool**: A tool proxied through MTG_MCP_Server (`mtg-commander-recommend`) that provides commander staple recommendations, synergy scores, and popular card data
- **Combo_Tool**: A tool proxied through MTG_MCP_Server (`mtg-combos-search`) that finds card interactions from Commander Spellbook
- **Deck_Context_Tool**: A tool that queries the current brew session's deck state including card list, categories, health status, and card count
- **Tool_Execution_Loop**: The server-side loop that detects `tool_use` stop reasons in Anthropic responses, executes the requested tools, appends tool results, and re-invokes the model until it produces a final text response
- **Ownership_Context**: The contextual information about whether a user owns a card (quantity, which decks it appears in, proxy status) provided alongside card suggestions
- **Tool_Stream_Event**: An SSE event emitted to the client indicating tool execution status (tool invoked, tool result received) to support UI feedback during tool calls

## Requirements

### Requirement 1: Tool-Use Integration with Streaming Chat

**User Story:** As a deck builder, I want Oracle to execute tool calls during our conversation, so that it can provide verified card data and contextual information without hallucinating.

#### Acceptance Criteria

1. WHEN the Anthropic API returns a response with `stop_reason: "tool_use"`, THE Brew_Chat SHALL execute the requested tools server-side and re-invoke the model with the Tool_Result appended to the message history
2. THE Brew_Chat SHALL support multiple sequential tool calls within a single response turn (the model may call tools repeatedly before producing a final text response)
3. WHILE a tool is executing, THE Brew_Chat SHALL emit a Tool_Stream_Event to the client indicating which tool is in progress
4. WHEN all tool calls are resolved and the model produces a final text response, THE Brew_Chat SHALL resume streaming text tokens to the client via SSE
5. IF a tool execution fails, THEN THE Brew_Chat SHALL return a Tool_Result with `is_error: true` and a descriptive message, allowing the model to gracefully inform the user
6. THE Brew_Chat SHALL complete the full Tool_Execution_Loop within 30 seconds; IF the loop exceeds this timeout, THEN THE Brew_Chat SHALL return the last available text to the client with an indication that tool calls were interrupted

### Requirement 2: MTG Data Tools via mtg-mcp Server

**User Story:** As a deck builder, I want Oracle to access real-time card data, EDHREC recommendations, combo interactions, and rules via the `mtg-mcp` MCP server, so that every suggestion is backed by authoritative sources without custom API wrappers.

#### Acceptance Criteria

1. THE system SHALL connect to the MTG_MCP_Server as a child process via stdio transport using `uvx mtg-mcp` (or a pre-installed `mtg-mcp` binary)
2. THE MCP_Client SHALL discover available tools from the MTG_MCP_Server on startup and expose them as Anthropic Tool_Definitions to the model
3. THE following MTG_MCP_Server tools SHALL be exposed to the model:
   - `mtg-ruling-search` — search for card rulings and official rules text
   - `mtg-rules-search` — search comprehensive rules by section or keyword
   - `mtg-commander-recommend` — get EDHREC top cards for a commander with synergy data
   - `mtg-combos-search` — find combo interactions from Commander Spellbook
   - `mtg-commander-deck` — validate commander legality (partner rules, colour identity)
   - `mtg-commander-brackets` — get bracket system criteria and power level guidelines
   - `mtg-cardtypes-get` — get detailed card type information
4. WHEN the model invokes an MTG_MCP_Server tool, THE system SHALL forward the call to the MCP_Client, await the response, and return the result as a Tool_Result to the model
5. IF the MTG_MCP_Server process crashes or is unavailable, THE system SHALL return a Tool_Result with `is_error: true` and the message "MTG data service unavailable — try again or ask without tool verification"
6. THE MCP_Client connection SHALL be initialized once on server startup (singleton) and reused across all concurrent brew chat requests
7. THE system SHALL additionally provide a direct Scryfall search tool (`scryfall_search`) that queries the Scryfall REST API (`/cards/search`) for cases where `mtg-mcp` tools don't cover a specific search query pattern (e.g. complex Scryfall syntax searches)

### Requirement 3: Collection Ownership Lookup Tool

**User Story:** As a deck builder, I want Oracle to check my collection when suggesting cards, so that I know which suggestions I already own, how many copies I have, and whether a card is already committed to another deck.

#### Acceptance Criteria

1. THE Collection_Tool SHALL accept one or more card names and return ownership data for each
2. WHEN invoked with card names, THE Collection_Tool SHALL query the SQLite `collection` table and return for each card: owned quantity, set code of owned printing, and foil status
3. THE Collection_Tool SHALL query the `deck_cards` table to determine which decks each card appears in, returning deck name and allocation status (original or proxy)
4. WHEN a card is not found in the collection, THE Collection_Tool SHALL return an explicit "not owned" status for that card
5. THE Collection_Tool SHALL accept a colour identity filter parameter to return all owned cards within a specified colour identity subset
6. THE Collection_Tool data access layer SHALL use a repository pattern that abstracts the SQLite queries behind an interface, enabling future replacement with a Supabase client without changing the tool definition or orchestration logic

### Requirement 4: EDHREC Recommendation Data Tool

**User Story:** As a deck builder, I want Oracle to look up popular cards and synergy data for my commander, so that suggestions are informed by community deckbuilding patterns and not just the model's training data.

#### Acceptance Criteria

1. THE EDHREC_Tool SHALL proxy to the MTG_MCP_Server's `mtg-commander-recommend` tool, accepting a commander name and returning top staple cards with synergy percentages and inclusion rates
2. WHEN invoked with a commander name, THE EDHREC_Tool SHALL return cards grouped by category (creatures, enchantments, artifacts, instants, sorceries, lands) with synergy score and deck inclusion percentage
3. THE EDHREC_Tool SHALL accept an optional category filter to return staples for a specific card type only
4. THE EDHREC_Tool SHALL cross-reference returned staples against the user's collection (via the Collection_Tool data layer) and annotate each result with ownership status
5. IF EDHREC data is unavailable for a commander (new or obscure), THEN THE EDHREC_Tool SHALL return a Tool_Result indicating no data is available for that commander
6. THE Combo_Tool SHALL proxy to the MTG_MCP_Server's `mtg-combos-search` tool, accepting card names and returning known combo interactions from Commander Spellbook

### Requirement 5: Deck Context Query Tool

**User Story:** As a deck builder, I want Oracle to see the current state of my deck during building phase, so that it can make informed suggestions based on what's already included, category counts, and deck health.

#### Acceptance Criteria

1. THE Deck_Context_Tool SHALL accept a brew session ID and return the current deck state including: total card count, card list with categories, and category counts
2. WHEN invoked, THE Deck_Context_Tool SHALL return each card's primary category, additional categories, and ownership status
3. THE Deck_Context_Tool SHALL return health status for each monitored category (healthy, low, or high relative to target thresholds)
4. THE Deck_Context_Tool SHALL return the current suggestions list (cards suggested but not yet added to the deck)
5. WHILE in Exploration_Phase (no commander committed), THE Deck_Context_Tool SHALL return the current Decision_Log contents (strategy, parameters, constraints) instead of deck state
6. IF the session ID is invalid or the session has no deck state, THEN THE Deck_Context_Tool SHALL return a Tool_Result indicating the deck is empty or the session was not found

### Requirement 6: Tool Definition Schema and Registration

**User Story:** As a developer, I want tool definitions structured as a typed registry with clear input/output schemas, so that adding new tools requires minimal boilerplate and the Anthropic API receives well-formed tool specifications.

#### Acceptance Criteria

1. THE system SHALL define all Tool_Definitions in a single registry module that exports the `tools` array for the Anthropic API call
2. EACH Tool_Definition SHALL include: a unique tool name, a human-readable description, and a JSON Schema defining the input parameters with types, descriptions, and required fields
3. THE system SHALL map each tool name to an executor function that accepts the parsed input parameters and returns a Tool_Result
4. THE tool registry SHALL be structured so that adding a new tool requires only: defining the schema, implementing the executor, and registering both in the registry — no changes to the streaming or orchestration logic
5. THE Tool_Definitions SHALL use descriptive names prefixed with a domain (`scryfall_search`, `collection_lookup`, `edhrec_staples`, `deck_context`) to avoid ambiguity for the model

### Requirement 7: Ownership Context in Card Suggestions

**User Story:** As a deck builder, I want Oracle to annotate every card suggestion with ownership status, so that I can immediately see which suggestions I already own, which are proxied elsewhere, and which I'd need to buy.

#### Acceptance Criteria

1. WHEN Oracle suggests cards during conversation, THE Brew_Chat system prompt SHALL instruct the model to call the Collection_Tool for each batch of suggested cards before presenting them to the user
2. THE model's response SHALL annotate each suggested card with one of: "You own this" (in collection, not allocated elsewhere), "In your [Deck Name]" (owned but allocated to another deck), or "Not in collection" (not owned)
3. WHEN the model suggests a card that is allocated to another deck as original, THE annotation SHALL name that deck so the user can make a proxy decision
4. THE system prompt SHALL instruct the model to batch collection lookups (multiple card names per tool call) rather than making one tool call per card

### Requirement 8: Rate Limiting and Caching

**User Story:** As a developer, I want Scryfall requests rate-limited and commonly accessed data cached, so that the tool stays within API limits and repeated queries for the same card are instant.

#### Acceptance Criteria

1. THE MTG_MCP_Server SHALL handle Scryfall rate limiting internally (the `mtg-mcp` package manages its own request pacing) — the Next.js server SHALL NOT implement a separate rate limiter for MCP-proxied Scryfall calls
2. THE system SHALL cache individual card lookup results (by exact name) in an in-memory LRU cache with a maximum of 500 entries for direct Scryfall REST API calls (the fallback `scryfall_search` tool)
3. WHEN a cached card is requested via the direct Scryfall tool, THE system SHALL return the cached result without making an API call
4. THE cache entries SHALL have no expiration within a server process lifetime (Scryfall card data is effectively immutable for printed cards)
5. FOR direct Scryfall REST API calls (not proxied through mtg-mcp), THE system SHALL implement a sliding-window rate limiter permitting a maximum of 10 requests per second
6. THE system SHALL implement a tool-call timeout of 15 seconds per individual tool invocation; IF exceeded, THE tool SHALL return an error result rather than blocking the entire response

### Requirement 9: Data Access Layer Abstraction for Supabase Migration

**User Story:** As a developer, I want the collection and deck queries abstracted behind an interface, so that migrating from SQLite to Supabase requires only swapping the implementation without changing tool logic.

#### Acceptance Criteria

1. THE system SHALL define a `CardRepository` interface with methods for: looking up owned cards by name, querying cards by colour identity, listing deck allocations for a card, and querying deck state by session ID
2. THE system SHALL implement a `SqliteCardRepository` class that satisfies the `CardRepository` interface using the existing `better-sqlite3` database
3. THE Collection_Tool and Deck_Context_Tool SHALL depend on the `CardRepository` interface, not directly on the SQLite database module
4. THE `CardRepository` interface SHALL use async method signatures (returning Promises) even though SQLite operations are synchronous, to maintain compatibility with a future Supabase implementation that requires async I/O
5. THE system SHALL select the active repository implementation via a configuration constant, defaulting to `SqliteCardRepository`

### Requirement 10: System Prompt Tool Guidance

**User Story:** As a deck builder, I want Oracle to use tools naturally and appropriately during conversation, so that it verifies facts without over-calling tools or interrupting conversational flow.

#### Acceptance Criteria

1. THE Brew_Chat system prompt SHALL include guidance instructing the model when to use each tool: `scryfall_search` for card search/verification, `mtg-commander-recommend` for EDHREC data, `mtg-combos-search` for combo lookup, `collection_lookup` for ownership checks, and `deck_context` for current deck state
2. THE system prompt SHALL instruct the model to verify commander suggestions via `mtg-commander-deck` before presenting them (confirming the card exists, is legendary, supports partner rules if applicable, and is Commander-legal)
3. THE system prompt SHALL instruct the model to batch tool calls where possible (verifying multiple cards in one `collection_lookup` call rather than one per card)
4. THE system prompt SHALL instruct the model to NOT call tools for general strategy discussion, archetype exploration, or philosophical conversation where no specific card data is needed
5. THE system prompt SHALL instruct the model to use `mtg-commander-recommend` when the user asks for popular cards, staples, or "what do people usually run" in a commander deck
6. THE system prompt SHALL instruct the model to present ownership context conversationally (woven into suggestions) rather than as a separate data dump
7. THE system prompt SHALL instruct the model to use `mtg-combos-search` when discussing win conditions, synergies, or when the user asks about combo lines in their deck
8. THE system prompt SHALL instruct the model to use `mtg-commander-brackets` when discussing power level, bracket placement, or card choices that affect deck power

