# AI Touchpoint Audit — September 2026

**Scope:** `src/app/api/brew/*`, `src/app/api/ai/brew/*`, `src/app/api/decks/[id]/chat/*`, `src/lib/tool-registry.ts`, `src/lib/adapters/*`
**Decision under test:** D-016 — *Structured data from LLMs comes via tool use or a JSON sidecar block. No regex parsing of prose.*
**Status:** No code changes made. Findings only.

---

## 1. Executive summary

Most AI routes now use the provider-agnostic tool loop (`runToolLoop` in `src/lib/tool-executor.ts`) and receive structured tool arguments from native provider tool-use/function-call channels. Those routes conform to D-016.

The remaining violations are concentrated in three patterns:

1. **DeepSeek adapter fallback** — when DeepSeek emits tool calls as DSML/XML in text instead of the structured `tool_calls` field, the adapter uses extensive regex to parse the markup out of prose. [Confirmed: `src/lib/adapters/deepseek-adapter.ts`]
2. **Brew skeleton / assessment / refinement / investigation / extraction routes** — these ask a model for JSON (sometimes inside a markdown fence) and then use regex/string replacement to strip fences and `JSON.parse` the result. [Confirmed: `src/app/api/brew/skeleton/route.ts`, `src/app/api/brew/assess/route.ts`, `src/app/api/brew/extract/route.ts`, `src/app/api/ai/brew/investigate/route.ts`, `src/app/api/ai/brew/generate/route.ts`, `src/app/api/ai/brew/refine/route.ts`]
3. **Card-name bracket scanning in investigation** — the route scans the model's prose with a regex to find `[[Card Name]]` references for validation. This is regex on LLM prose, but it is annotation rather than structured-data extraction. [Confirmed: `src/app/api/ai/brew/investigate/route.ts`]

No route performs destructive database operations or changes existing allocations as part of this audit.

---

## 2. What the AI can access today

### 2.1 User-specific data reachable through routes/system prompts

| Data category | Fields / tables | How the AI sees it |
|---|---|---|
| Brew session | `brew_sessions.status`, `commander_name`, `colour_identity`, `decision_log_json`, `skeleton_json`, `conversation_json`, `path_type`, `brief_json`, `model_id` | Loaded by `src/app/api/brew/chat/route.ts`, `src/app/api/brew/skeleton/route.ts`, `src/app/api/ai/brew/*` routes, and passed in prompts or tool context. [Confirmed: `src/app/api/brew/chat/route.ts` L376–392, `src/app/api/brew/skeleton/route.ts` L125–148] |
| User preferences | `user_preferences` via `getUserPreferences` / `formatPlayerContextPrompt` | Injected into almost every AI system prompt. [Confirmed: `src/lib/oracle-prompt.ts` L530–543] |
| Deck portfolio | `decks.id`, `name`, `commander_name`, `colour_identity`, `card_count`, `is_active`, `last_synced_at` | Returned by the `list_user_decks` tool. [Confirmed: `src/lib/tool-registry.ts` L1001–1072] |
| Deck contents | `deck_cards.card_name`, `quantity`, `categories`, `set_code`, `scryfall_id`; joined to `ref_cards` and `ref_printings` for mana cost/price | Returned by `get_deck_cards` and by `src/app/api/decks/[id]/chat/route.ts` directly. [Confirmed: `src/lib/tool-registry.ts` L1078–1258, `src/app/api/decks/[id]/chat/route.ts` L140–159] |
| Collection / ownership | `user_copies` → `user_cards.card_name`, quantity, foil; deck allocations | Returned by `collection_lookup`, `search_owned_cards`, and used in `src/app/api/ai/brew/generate/route.ts` / `refine/route.ts`. [Confirmed: `src/lib/tool-registry.ts` L844–995] |
| Card reference data | `ref_commanders`, `ref_cards`, `ref_printings`, `ref_commander_insights`, `ref_build_cards` | Queried directly by tools and by `src/app/api/ai/brew/generate/route.ts`. [Confirmed: `src/lib/tool-registry.ts` L230–324, L1320–1386; `src/app/api/ai/brew/generate/route.ts` L96–153] |
| External MTG data | Scryfall, EDHREC, Commander Spellbook, MCP bulk data | Tools proxy to these services. [Confirmed: `src/lib/tool-registry.ts` L123–228, L1633–1659] |
| Conversation history | User-provided message array | Sent to the model in all chat endpoints. [Confirmed: `src/app/api/brew/chat/route.ts` L407–413, `src/app/api/oracle/chat/route.ts` L397–403, `src/app/api/decks/[id]/chat/route.ts` L193–199] |

### 2.2 Tool registry capabilities

The tools registered in `src/lib/tool-registry.ts` define the AI's effective read/write surface:

| Tool | What it reads / writes |
|---|---|
| `mtg_ruling_search` | Scryfall rulings for a named card. |
| `mtg_commander_recommend` | EDHREC staples/synergy cards for a commander. |
| `mtg_combos_search` | Commander Spellbook combos. |
| `mtg_commander_deck` | `ref_commanders` / `ref_cards` — commander legality and colour identity. |
| `mtg_top_commanders` | `ref_commanders` ranked by EDHREC, with optional colour/archetype/theme/tribe filters. |
| `search_commanders` | `ref_commanders` by name keyword. |
| `mtg_commander_brackets` | Static bracket guidelines (no DB read). |
| `validate_cards_for_commander` | `ref_cards` colour identities to validate card legality. |
| `search_owned_cards` | `user_copies` + `user_cards` filtered by type/subtype and optional colour identity. |
| `collection_lookup` | `user_copies` + `user_cards` + deck allocations for named cards. |
| `list_user_decks` | `decks` owned by the user. |
| `get_deck_cards` | Full card list for a deck, with prices from `ref_printings`. |
| `deck_context` | `brew_sessions` deck state / decision log via `getCardRepository`. |
| `get_commander_insights` | `ref_commander_insights` for a commander. |
| `card_fuzzy_lookup` | `mtg_cards`, `ref_printings`, Scryfall fuzzy/autocomplete. |
| `scryfall_search` | Scryfall API via `scryfallSearch`. |
| `display_commander_candidates` | **Display / structured-output tool** — emits candidate commanders as an SSE event; no DB write. |
| `add_cards_to_deck` | **Display / structured-output tool** — emits cards to add as an SSE event; the frontend performs the actual deck write. |
| `remove_cards_from_deck` | **Display / structured-output tool** — emits cards to remove as an SSE event; frontend performs the write. |

Important: the actual database writes for `add_cards_to_deck` and `remove_cards_from_deck` are performed by the frontend through separate deck API calls. The AI only produces structured tool arguments.

---

## 3. Touchpoint-by-touchpoint D-016 verdict

| # | Touchpoint | Data the AI can see | D-016 verdict | Evidence |
|---|---|---|---|---|
| 1 | `src/app/api/brew/chat/route.ts` | Brew session status/commander, user message, history, user preferences, collection mode, all tools available for the phase (exploration or building). | **Mismatch** | Uses a second Haiku call to extract decisions from Sonnet prose, then strips markdown fences and parses JSON. [Confirmed: `src/app/api/brew/chat/route.ts` L474–595] |
| 2 | `src/app/api/brew/assess/route.ts` | Session ID, card name, deck context (commander, strategy, up to 40 existing cards). | **Mismatch** | `parseAssessment` strips markdown fences and parses JSON from model text. [Confirmed: `src/app/api/brew/assess/route.ts` L182–209] |
| 3 | `src/app/api/brew/skeleton/route.ts` | Brew session (commander, colour identity, decision log), user preferences, collection mode. | **Mismatch** | `parseSkeleton` strips markdown fences and parses JSON from model text. [Confirmed: `src/app/api/brew/skeleton/route.ts` L415–445] |
| 4 | `src/app/api/brew/extract/route.ts` | Session ID, assistant response text. | **Mismatch** | Asks Haiku for a JSON array of extractions, then parses it from prose. [Confirmed: `src/app/api/brew/extract/route.ts` L34–71, L126–141] |
| 5 | `src/app/api/ai/brew/start/route.ts` | Path type, commander name or concept, user preferences. | **Matches** | Returns the model's free-text greeting directly; no structured data is parsed from prose. [Confirmed: `src/app/api/ai/brew/start/route.ts` L81–121] |
| 6 | `src/app/api/ai/brew/investigate/route.ts` | Session, full conversation, user message, model config, user preferences. | **Mismatch** | `extractBrief` and `parseBrief` use regex to locate and parse a `StrategyBrief` JSON object from model prose. Also uses regex to scan/validate `[[Card Name]]` references and to strip raw JSON briefs from visible text. [Confirmed: `src/app/api/ai/brew/investigate/route.ts` L163–168, L181–189, L256–333, L346–425] |
| 7 | `src/app/api/ai/brew/generate/route.ts` | Strategy brief, EDHREC build cards, user's collection, Scryfall slot candidates, knowledge context. | **Mismatch** | `parseSkeleton` uses regex to pull a JSON object out of model text. [Confirmed: `src/app/api/ai/brew/generate/route.ts` L439–480] |
| 8 | `src/app/api/ai/brew/refine/route.ts` | Session, current skeleton, strategy brief, refinement action. | **Mismatch** | `parseCardJSON` and `parseCardArrayJSON` use regex to extract JSON objects/arrays from model text for swap/alternative suggestions. [Confirmed: `src/app/api/ai/brew/refine/route.ts` L405–449] |
| 9 | `src/app/api/ai/brew/save/route.ts` | Session, deck name. | **N/A — not an AI call** | Persists skeleton to `decks`/`deck_cards`; no LLM invocation. [Confirmed: `src/app/api/ai/brew/save/route.ts`] |
| 10 | `src/app/api/ai/brew/confirm/route.ts` | Session ID. | **N/A — not an AI call** | Updates session status only. [Confirmed: `src/app/api/ai/brew/confirm/route.ts`] |
| 11 | `src/app/api/ai/brew/session/route.ts` | Session query params. | **N/A — not an AI call** | CRUD retrieval only. [Confirmed: `src/app/api/ai/brew/session/route.ts`] |
| 12 | `src/app/api/decks/[id]/chat/route.ts` | Deck metadata, full deck card list with categories/quantities, user preferences, message, history. | **Matches** | Uses `runToolLoop`; structured actions flow through tools; response text is streamed unmodified. [Confirmed: `src/app/api/decks/[id]/chat/route.ts` L95–259] |
| 13 | `src/app/api/oracle/chat/route.ts` | Message, context (page type, optional deck ID/name/commander), history, session ID, user preferences, commander colour identity. | **Matches** | Uses `runToolLoop`; intent detection regex operates on **user input**, not LLM prose. [Confirmed: `src/app/api/oracle/chat/route.ts` L272–519] |
| 14 | `src/lib/adapters/anthropic-adapter.ts` | Normalized tool-use responses. | **Matches** | Reads native Anthropic `tool_use` content blocks; no regex parsing. [Confirmed: `src/lib/adapters/anthropic-adapter.ts` L106–181] |
| 15 | `src/lib/adapters/gemini-adapter.ts` | Normalized function-call responses. | **Matches** | Reads native Gemini `functionCall` parts; no regex parsing. [Confirmed: `src/lib/adapters/gemini-adapter.ts` L196–237] |
| 16 | `src/lib/adapters/deepseek-adapter.ts` | OpenAI-compatible tool calls; DSML/XML fallback text. | **Mismatch** | `parseDsmlToolCalls` and `stripResidualDsml` parse tool calls out of LLM prose with regex when DeepSeek emits DSML instead of structured `tool_calls`. Streaming path also buffers and matches DSML tokens with regex. [Confirmed: `src/lib/adapters/deepseek-adapter.ts` L118–178, L421–560] |
| 17 | `src/lib/tool-executor.ts` | Tool definitions, conversation, model responses. | **Matches** | Executes native tool calls from adapters; `detectCollectionTypeQuestion` regexes **user input**, not LLM prose. [Confirmed: `src/lib/tool-executor.ts` L150–339] |

---

## 4. D-016 violation detail

### 4.1 Regex parsing of LLM prose for structured data

D-016 requires structured LLM output to arrive through tool use or a JSON sidecar block. The following files parse JSON (or XML/DSML) out of free-form model text using regex or string replacement:

- `src/lib/adapters/deepseek-adapter.ts` — DSML tool-call fallback is entirely regex-driven (lines 421–560; also streaming detection lines 118–178).
- `src/app/api/brew/assess/route.ts` — `parseAssessment` strips fences and parses JSON (lines 182–209).
- `src/app/api/brew/skeleton/route.ts` — `parseSkeleton` strips fences and parses JSON (lines 415–445).
- `src/app/api/brew/extract/route.ts` — Haiku returns a JSON array that is parsed from text (lines 126–141).
- `src/app/api/brew/chat/route.ts` — inline Haiku decision extraction strips fences and parses JSON (lines 512–528).
- `src/app/api/ai/brew/investigate/route.ts` — `extractBrief` / `parseBrief` locate and parse a `StrategyBrief` JSON object from prose (lines 346–425).
- `src/app/api/ai/brew/generate/route.ts` — `parseSkeleton` extracts JSON with regex (lines 439–480).
- `src/app/api/ai/brew/refine/route.ts` — `parseCardJSON` / `parseCardArrayJSON` extract JSON objects/arrays from prose (lines 405–449).

### 4.2 Regex annotation of LLM prose (not a D-016 structured-data violation, but noted)

- `src/app/api/ai/brew/investigate/route.ts` scans the model's text for `[[Card Name]]` references and validates them against MCP bulk data, then annotates invalid names with `~~name~~ ⚠️(not found)`. This is regex on LLM prose, but it does not extract application state — it only adds warnings. [Confirmed: `src/app/api/ai/brew/investigate/route.ts` L256–333]

---

## 5. Recommendations (for owner / future work)

1. **Retire DSML parsing in the DeepSeek adapter.** Either remove DeepSeek from supported providers until it reliably emits native tool calls, or route DeepSeek through a provider-side tool-use mode and reject malformed responses instead of regex-parsing them.
2. **Convert JSON-extraction routes to tool use or a validated JSON sidecar block.**
   - Skeleton generation, card assessment, and refinement should request structured tool calls (e.g., a `return_skeleton` / `return_assessment` / `return_card` tool) instead of asking the model to write JSON inside prose.
   - Decision extraction should either be removed from the chat loop or implemented as a dedicated tool-use step.
   - The investigation route's `StrategyBrief` should be produced through a forced tool call with a strict input schema.
3. **Clarify "JSON sidecar block."** The current code treats markdown-fenced JSON as a sidecar, but it still uses regex to locate and strip the fence. A true sidecar should be a separate, unambiguous message part or tool result that does not require string scanning.

---

## 6. Files read for this audit

- `src/lib/adapters/anthropic-adapter.ts`
- `src/lib/adapters/gemini-adapter.ts`
- `src/lib/adapters/deepseek-adapter.ts`
- `src/lib/ai-models.ts`
- `src/lib/provider-adapter.ts`
- `src/lib/tool-executor.ts`
- `src/lib/tool-registry.ts`
- `src/lib/oracle-prompt.ts`
- `src/app/api/brew/chat/route.ts`
- `src/app/api/brew/assess/route.ts`
- `src/app/api/brew/skeleton/route.ts`
- `src/app/api/brew/extract/route.ts`
- `src/app/api/brew/session/route.ts`
- `src/app/api/brew/session/[id]/route.ts`
- `src/app/api/brew/save/route.ts`
- `src/app/api/brew/commit/route.ts`
- `src/app/api/ai/brew/session/route.ts`
- `src/app/api/ai/brew/start/route.ts`
- `src/app/api/ai/brew/generate/route.ts`
- `src/app/api/ai/brew/refine/route.ts`
- `src/app/api/ai/brew/save/route.ts`
- `src/app/api/ai/brew/confirm/route.ts`
- `src/app/api/ai/brew/investigate/route.ts`
- `src/app/api/decks/[id]/chat/route.ts`
- `src/app/api/oracle/chat/route.ts`
- `AGENTS.md`
- `.paseo/agents/architect.md`
- `docs/oracle/decisions.md`

No code changes were made.
